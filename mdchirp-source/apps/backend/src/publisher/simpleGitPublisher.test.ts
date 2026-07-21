import assert from 'node:assert'
import { isNothingToCommitError } from './simpleGitPublisher.js'

let pass = 0

function ok(name: string): void {
  console.log(`  ✓ ${name}`)
  pass++
}

console.log('mdchirp simpleGitPublisher test')

// 실제 장애 형태: stderr는 빈 문자열이고 안내 문구는 stdout/message에 있다.
{
  const error = {
    stderr: '',
    stdout:
      "On branch main\nYour branch is up to date with 'origin/main'.\n\n" +
      'nothing to commit, working tree clean',
    message:
      "On branch main\nYour branch is up to date with 'origin/main'.\n\n" +
      'nothing to commit, working tree clean',
  }

  assert(
    isNothingToCommitError(error),
    'empty stderr must not hide stdout nothing-to-commit message',
  )
  ok('빈 stderr가 stdout의 nothing to commit을 가리지 않음')
}

// Error.message에만 안내 문구가 있는 경우
{
  const error = new Error('nothing to commit, working tree clean')

  assert(
    isNothingToCommitError(error),
    'Error.message nothing-to-commit must be detected',
  )
  ok('Error.message의 nothing to commit 감지')
}

// 다른 Git 버전에서 사용하는 메시지
{
  const error = {
    stderr: 'no changes added to commit',
  }

  assert(
    isNothingToCommitError(error),
    'no changes added must be detected',
  )
  ok('no changes added 메시지 감지')
}

// 실제 Git 실패는 정상 성공으로 오인하면 안 된다.
{
  const error = {
    stderr: 'fatal: Authentication failed for repository',
    message: 'git commit failed',
  }

  assert(
    !isNothingToCommitError(error),
    'authentication failure must remain an error',
  )
  ok('실제 Git 오류는 nothing-to-commit으로 오인하지 않음')
}

console.log(`\n✅ ${pass} checks passed`)
