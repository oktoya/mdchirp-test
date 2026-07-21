// SimpleGitPublisher — GitPublisher 실제 구현체. repo/ 워킹카피에서 git add/commit/push.
// 정식 명세: apps/backend/SPEC.md §6 (7~9단계), §9(git 의존성).
//
// 설계(합의):
// - 인증: secrets.json 의 GitHub PAT 를 HTTPS remote URL 에 주입(x-access-token).
//         토큰은 remote 에 영구 저장하지 않고 push 명령의 URL 인자로만 1회 사용
//         (→ .git/config 에 토큰이 남지 않음).
// - 대상: settings.json 의 github.repo("owner/name") / github.branch.
// - 커밋 저자: mdchirp / mdchirp@localhost 를 -c 로 커밋 단위 주입(전역 config 불변).
// - repo/ 가 git 워킹카피가 아니면 명확한 에러(수동 clone 안내). DEPLOY §13 참조.
// - 발행/발행취소/삭제는 공통 커밋 흐름(commitPullPush)을 공유. 발행은 add,
//   발행취소·삭제는 git rm 으로 스테이징만 다르고 pull --rebase(+abort 자가치유)·push 는 동일.
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs'
import path from 'node:path'
import { config } from '../config.js'
import { getSecret, getSettings } from '../store/secretStore.js'
import type { GitPublisher } from './publishBuilder.js'

const execFileAsync = promisify(execFile)

const COMMIT_NAME = 'mdchirp'
const COMMIT_EMAIL = 'mdchirp@localhost'

/**
 * git commit은 변경사항이 없을 때 non-zero로 종료한다.
 * 환경에 따라 안내 문구가 stdout, stderr 또는 Error.message에 들어가므로
 * 빈 stderr 하나만 우선 선택하지 않고 모든 비어 있지 않은 메시지를 검사한다.
 */
export function isNothingToCommitError(error: unknown): boolean {
  const record =
    error && typeof error === 'object'
      ? (error as {
          stdout?: unknown
          stderr?: unknown
          message?: unknown
        })
      : {}

  const message = [
    record.stdout,
    record.stderr,
    record.message,
    error,
  ]
    .filter(
      (value): value is string =>
        typeof value === 'string' && value.trim().length > 0,
    )
    .join('\n')

  return /nothing to commit|no changes added/i.test(message)
}

export class SimpleGitPublisher implements GitPublisher {
  /** repo/ 워킹카피에서 files 를 add/commit 하고 대상 브랜치로 push. */
  async commitAndPush(
    slug: string,
    files: string[],
  ): Promise<{ committed: boolean; pushedAt: string }> {
    const repoDir = this.assertRepo()
    // add (발행 빌더가 만든 파일들만). 없으면 전체.
    if (files.length > 0) {
      await this.git(repoDir, ['add', ...files])
    } else {
      await this.git(repoDir, ['add', '-A'])
    }
    return this.commitPullPush(repoDir, `publish: ${slug}`)
  }

  /** repo/ 에서 paths(본문+이미지폴더 등)를 git rm 하고 커밋+push. 발행취소/삭제 공용. */
  async removePaths(
    slug: string,
    paths: string[],
  ): Promise<{ committed: boolean; pushedAt: string }> {
    const repoDir = this.assertRepo()
    // --ignore-unmatch: repo 에 없는 경로(이미 지웠거나 이미지 폴더 없음)여도 실패 안 함.
    // -r: 폴더(assets/img/posts/<slug>/) 재귀 삭제.
    await this.git(repoDir, ['rm', '-r', '--ignore-unmatch', ...paths])
    return this.commitPullPush(repoDir, `unpublish: ${slug}`)
  }

  /** repo/ 가 git 워킹카피인지 확인하고 절대경로 반환(아니면 명확한 에러). */
  private assertRepo(): string {
    const repoDir = config.repoDir
    if (!fs.existsSync(path.join(repoDir, '.git'))) {
      throw new Error(
        `발행 대상 git 워킹카피가 없습니다: ${repoDir}\n` +
          `NAS 에서 최초 1회 clone 이 필요합니다(DEPLOY.md §13 참조).`,
      )
    }
    return repoDir
  }

  /** 스테이징된 변경을 commit → pull --rebase(+abort 자가치유) → push. 발행/발행취소/삭제 공용. */
  private async commitPullPush(
    repoDir: string,
    message: string,
  ): Promise<{ committed: boolean; pushedAt: string }> {
    // 대상 레포/브랜치/토큰 확인.
    const gh = getSettings().github
    const repo = (gh.repo ?? '').trim() // "owner/name"
    const branch = (gh.branch ?? '').trim() || 'main'
    if (!repo || !repo.includes('/')) {
      throw new Error(
        `GitHub 대상 레포가 설정되지 않았습니다. 앱 설정 → GitHub 에서 ` +
          `repo 를 "owner/name" 형식으로 저장하세요(현재: "${repo}").`,
      )
    }
    const token = getSecret('github')
    if (!token) {
      throw new Error(
        `GitHub 토큰(PAT)이 없습니다. 앱 설정 → GitHub 에서 쓰기 권한 토큰을 저장하세요.`,
      )
    }

    // commit. 변경이 없으면 git 이 비영으로 실패하므로, 그 경우는 "커밋 안 함"으로 취급.
    let committed = true
    try {
      await this.git(repoDir, [
        '-c',
        `user.name=${COMMIT_NAME}`,
        '-c',
        `user.email=${COMMIT_EMAIL}`,
        'commit',
        '-m',
        message,
      ])
    } catch (e: unknown) {
      if (isNothingToCommitError(e)) {
        committed = false // 삭제할 Git 변경이 없어도 멱등한 성공으로 처리한다.
      } else {
        throw e
      }
    }

    // push 전에 원격 변경을 먼저 받아 합친다(GitHub 에서 직접 수정/삭제한 경우 대비).
    //
    // ⚠️ rebase 가 충돌로 멈추면 .git 이 "rebase in progress" 로 굳어 이후 모든
    //    발행/삭제가 영구히 502 로 막힌다. 그래서 실패 시 반드시 abort 로 워킹카피를
    //    rebase 직전 상태로 되돌리고(되감기만), git 원인 메시지를 담아 던진다.
    //    abort 는 rebase 진행 중이 아니면 no-op 이라 무시해도 안전.
    const authRemote = `https://x-access-token:${token}@github.com/${repo}.git`
    try {
      await this.git(repoDir, [
        '-c',
        `user.name=${COMMIT_NAME}`,
        '-c',
        `user.email=${COMMIT_EMAIL}`,
        'pull',
        '--rebase',
        authRemote,
        branch,
      ])
    } catch (e: any) {
      // 멈춘 rebase 를 정리(진행 중이 아니면 no-op → 무시).
      await this.git(repoDir, ['rebase', '--abort']).catch(() => {})
      const reason = String(e?.stderr ?? e?.stdout ?? e?.message ?? e).trim()
      throw new Error(
        `원격 변경과 병합(rebase) 중 충돌로 중단했습니다. ` +
          `워킹카피는 원상복구했습니다(잃은 작업 없음). ` +
          `GitHub 에서 이 글을 직접 지웠거나 수정했을 수 있습니다. 확인 후 다시 시도하세요.\n` +
          `(git: ${reason})`,
      )
    }

    // push (커밋이 새로 생겼거나, 로컬이 원격보다 앞선 경우 모두 반영).
    await this.git(repoDir, ['push', authRemote, `HEAD:${branch}`])

    return { committed, pushedAt: new Date().toISOString() }
  }

  /** repoDir 에서 git 실행. 실패 시 stdout+stderr 를 합쳐 message 에 담아 throw. */
  private async git(cwd: string, args: string[]): Promise<string> {
    try {
      const { stdout } = await execFileAsync('git', args, {
        cwd,
        maxBuffer: 10 * 1024 * 1024,
      })
      return stdout
    } catch (e: any) {
      // git 은 "nothing to commit" 을 stdout 에 쓴다. 빈 stderr 가 ?? 를 가로채
      // stdout 을 못 보는 일이 없도록, stdout+stderr 를 합쳐 message 로 실어 다시 throw.
      const out = `${e?.stdout ?? ''}\n${e?.stderr ?? ''}`.trim()
      const err: any = new Error(out || String(e?.message ?? e))
      err.stdout = e?.stdout
      err.stderr = e?.stderr
      throw err
    }
  }
}
