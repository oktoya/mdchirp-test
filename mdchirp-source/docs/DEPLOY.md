# mdchirp NAS 배포 가이드 (Docker / 시놀로지)

> 개발 환경(`pnpm dev:backend`, localhost:8787)에서만 돌리던 NAS 백엔드를
> 실제 시놀로지 NAS에 Docker로 띄워 **상시 동작**시키는 방법.
> 대상 환경: 시놀로지 DS920+ / DSM 7.x / Container Manager(Docker Compose).

---

## 0. 이 문서로 무엇을 하나

```
내 기기(작성)  →   NAS 백엔드(Docker, 상시)   →   GitHub(발행)
   데스크톱 앱        이 문서가 띄우는 대상           (git push는 다음 단계)
```

NAS 백엔드는 mdchirp의 허브입니다: 글 저장(진실 공급원), AI 키 보관(Gemini 프록시),
설정 저장. 이 문서를 따라 하면 NAS에서 백엔드가 24시간 돌고, 집 안/밖 어디서든
데스크톱 앱이 이 백엔드에 접속할 수 있게 됩니다.

> NAS backend는 글 저장과 이미지 업로드·조회·변환뿐 아니라,
> 발행 시 GitHub 저장소에 실제 commit/push까지 수행합니다.
> GitHub 쓰기 권한 PAT와 최초 1회 repo clone이 필요합니다.

---

## 1. 사전 준비물

- 시놀로지 NAS (DS920+ 등) + DSM 7.x
- **Container Manager** 패키지 설치 (패키지 센터에서 설치 — 이미 쓰고 계심)
- NAS에 데이터를 둘 **공유 폴더** (이 가이드는 `docker` 공유폴더 사용 가정)
- GitHub 블로그 레포 (이미 보유) + (다음 단계용) 쓰기 권한 토큰 → §8
- (선택) Gemini API 키 — AI 서식/slug 제안을 쓰려면. 없어도 배포는 됩니다(B 모드).
- (외부 접속용) Cloudflare Tunnel (이미 운영 중) → §7

---

## 2. 데이터 저장 설계 (영구 보관)

백엔드가 만드는 **모든 영속 데이터는 한 디렉토리에 모입니다**:

```
/data/mdchirp/            ← 컨테이너 안 경로 (고정)
├── posts-src/            #   글 작업공간 (글 본문/리치원본/미디어)
├── repo/                 #   git 워킹카피 (발행 빌더 산출물)
├── secrets.json          #   GitHub 토큰 / Gemini 키 (평문 — §10 보안)
└── settings.json         #   NAS측 설정
```

이 한 폴더를 NAS의 실제 공유폴더에 **볼륨 연결**하면 컨테이너를 지워도 데이터가 남습니다.
이 가이드는 NAS 호스트 경로를 다음으로 가정합니다(본인 환경에 맞게 바꾸세요):

```
/volume1/docker/mdchirp/data   ←→   컨테이너 /data/mdchirp
```

---

## 3. 소스 코드를 NAS로 가져오기 (git clone)

PC 폴더를 통째로 복사하면 `node_modules` 등 때문에 너무 느립니다. 대신 NAS에서
GitHub 소스 레포(`oktoya/mdchirp`, private)를 직접 clone 합니다. SSH로 접속해 명령을
복사·붙여넣기 하면 됩니다.

### 3-1. NAS에 SSH 켜기 (한 번만)

1. DSM → **제어판 → 터미널 및 SNMP** → **SSH 서비스 활성화** 체크 → 적용.
   (포트는 기본 22. 보안을 위해 평소엔 꺼두고 필요할 때만 켜도 됩니다.)

### 3-2. SSH로 NAS 접속 (PC PowerShell)

PC의 PowerShell에서 (DSM 관리자 계정으로):

```powershell
ssh <DSM관리자ID>@<NAS내부IP>
```

비밀번호를 입력하면 NAS 안의 셸로 들어갑니다. (2단계 인증을 쓰면 코드도 입력.)

### 3-3. 소스 레포 clone (NAS 셸 안에서)

소스와 데이터 폴더를 분리해 둡니다. 아래는 그대로 복붙하면 됩니다.

```bash
# 소스를 둘 폴더로 이동 (없으면 만듦)
sudo mkdir -p /volume1/docker/mdchirp
cd /volume1/docker/mdchirp

# private 레포라 인증이 필요합니다. 아래 <GITHUB_TOKEN> 자리에
# oktoya/mdchirp 를 읽을 수 있는 토큰(아래 설명)을 넣어 한 번만 clone 합니다.
sudo git clone https://<GITHUB_TOKEN>@github.com/oktoya/mdchirp.git source
```

성공하면 `/volume1/docker/mdchirp/source/` 에 코드가 받아집니다.
데이터(볼륨)는 별도 폴더를 씁니다:

```bash
sudo mkdir -p /volume1/docker/mdchirp/data
```

> 정리: **소스** = `/volume1/docker/mdchirp/source`, **데이터(볼륨)** = `/volume1/docker/mdchirp/data`.

### 3-4. clone 용 토큰 (private 레포 읽기)

위 `<GITHUB_TOKEN>` 은 **소스 레포(oktoya/mdchirp)를 읽을 수 있는** GitHub 토큰입니다.
(§8의 블로그 레포 쓰기 토큰과는 별개지만, fine-grained PAT 하나로 두 레포를 모두
포함하게 발급해도 됩니다.)

- GitHub → **Settings → Developer settings → Personal access tokens → Fine-grained tokens**
  → `oktoya/mdchirp` 레포 선택 → **Contents: Read** 권한 → 토큰 발급.
- 이 토큰은 clone 명령 URL 에 **한 번만** 쓰입니다. NAS 디스크에 토큰을 영구 저장하지
  않으려면, clone 직후 다음 명령으로 원격 URL 에서 토큰을 지워두세요(이후 업데이트 시
  pull 할 때 토큰을 다시 물어봅니다):

```bash
cd /volume1/docker/mdchirp/source
sudo git remote set-url origin https://github.com/oktoya/mdchirp.git
```

> ⚠️ 토큰은 비밀번호와 같습니다. 화면에 그대로 노출되니 SSH 세션을 닫은 뒤 PowerShell
> 기록(`Clear-History`)을 정리하면 더 안전합니다.

---

## 4. compose 파일의 볼륨/경로 확인

`apps/backend/docker-compose.yml` 의 `volumes` 가 NAS 데이터 경로를 가리키는지 확인하세요.
(PC 테스트용으로 `./.docker-data:...` 로 바꿔 두었다면 **원래대로 되돌립니다**.)

```yaml
    volumes:
      - /volume1/docker/mdchirp/data:/data/mdchirp
```

> 위 왼쪽 경로(`/volume1/docker/mdchirp/data`)는 §2에서 정한 본인의 데이터 폴더로 맞추세요.

---

## 5. Container Manager로 빌드 & 실행

1. DSM → **Container Manager** 열기.
2. 왼쪽 **프로젝트(Project)** → **생성(Create)**.
3. 설정:
   - **프로젝트 이름**: `mdchirp-backend` (원하는 이름)
   - **경로(Path)**: 소스를 올린 곳 안의 **backend 폴더**를 지정 —
     `/volume1/docker/mdchirp/source/apps/backend`
     (이 폴더 안에 `docker-compose.yml`이 있어야 합니다.)
   - **소스(Source)**: "기존 docker-compose.yml 사용" 선택.
4. compose 내용 확인 화면이 나오면 그대로 진행(빌드 컨텍스트 `../../` 가 monorepo 루트를
   가리키므로 소스 전체가 NAS에 있어야 빌드됩니다 — §3에서 복사했으면 OK).
5. **다음 → 완료**. Container Manager가 이미지를 **빌드**(처음엔 몇 분 소요)하고 컨테이너를 띄웁니다.

> 빌드 로그에서 `pnpm install` → 소스 복사 → 컨테이너 시작 순서를 볼 수 있습니다.

---

## 6. 동작 확인 (검증)

컨테이너가 뜨면 로그(Container Manager → 컨테이너 → 로그)에서 다음이 보여야 합니다:

```
mdchirp backend on http://localhost:8787  (data: /data/mdchirp)
```

그다음 같은 LAN의 PC 브라우저에서 NAS 내부 IP로 헬스체크:

```
http://<NAS내부IP>:8787/api/health
```

이런 JSON 이 200으로 오면 성공입니다(키 없으면 `not_configured` 가 정상):

```json
{ "ok": true, "version": "0.0.1", "features": { "formatter": "not_configured", "slug": "not_configured" } }
```

데이터 폴더(`/volume1/docker/mdchirp/data`)에 `posts-src/` 등이 생기는지도 확인하세요.

---

## 7. 외부 접속 (Cloudflare Tunnel — 메인)

데스크톱 앱을 집 밖에서도 쓰려면 NAS 백엔드를 외부에 노출해야 합니다.
이미 Cloudflare Tunnel을 운영 중이므로 이를 권장합니다(포트포워딩 불필요, 더 안전).

1. Cloudflare Tunnel 설정에서 **퍼블릭 호스트네임** 추가:
   - 서브도메인/도메인: 원하는 주소 (예: `mdchirp.yourdomain.com`)
   - 서비스: `HTTP` → `<NAS내부IP>:8787` (또는 cloudflared가 NAS 안에서 돌면 `localhost:8787`)
2. 저장 후, 외부에서 `https://mdchirp.yourdomain.com/api/health` 가 200이면 성공.
3. mdchirp 데스크톱 앱 → **설정** 메뉴 → NAS 주소에 이 외부 주소를 입력.
   (집 안에서는 `http://<NAS내부IP>:8787` 를 써도 됩니다.)

### 대안: DDNS + 포트포워딩 (참고용)
Cloudflare Tunnel 대신 기존 DuckDNS(`tonol.duckdns.org`)를 쓰려면, 공유기에서
외부 포트 → NAS의 8787 포트로 **포트포워딩**한 뒤 `http://tonol.duckdns.org:8787`
로 접속합니다. 다만 포트를 직접 여는 방식이라 보안상 Cloudflare Tunnel을 더 권장합니다.
(HTTPS·접근제어가 필요하면 Tunnel 쪽이 유리합니다.)

---

## 8. GitHub 발행 준비 (토큰)

> 발행 git push는 **다음 단계**지만, 토큰은 미리 준비/저장해두면 그때 바로 쓰입니다.

1. GitHub → **Settings → Developer settings → Personal access tokens** 에서
   **블로그 레포에 쓰기 권한이 있는 토큰(PAT)** 을 발급합니다.
   (Fine-grained token 추천: 해당 레포만, Contents = Read and write 권한.)
2. 발급한 토큰을 mdchirp 데스크톱 앱 → **설정** 메뉴 → GitHub 토큰 칸에 저장.
   → 앱이 NAS `PUT /api/secrets` 로 보내 `secrets.json` 에 보관합니다(프론트에 안 남음).
3. 저장되면 설정 화면에 `설정됨 ✓` 으로 표시됩니다(토큰 원문은 다시 안 보여줌 — 정상).

---

## 9. Gemini 키 설정 (AI 서식/slug 제안)

**권장(메인): 앱 설정 메뉴에서 저장.**
mdchirp 데스크톱 앱 → **설정** → AI 키 칸에 Gemini 키 입력 → 저장.
→ NAS `secrets.json` 에 보관되고, **재시작 없이 즉시** `✨` 기능이 켜집니다(B 모드).
이 방식은 키를 compose 파일에 평문으로 남기지 않아 더 안전합니다.

**대안(서브): compose 환경변수.**
`apps/backend/docker-compose.yml` 의 environment 에서 아래 주석을 해제하고 키를 넣은 뒤
컨테이너를 재생성합니다(키가 파일에 평문으로 남으니 주의):

```yaml
    environment:
      - GEMINI_API_KEY=여기에_키
      - GEMINI_MODEL=gemini-2.0-flash
```

설정 후 `/api/health` 의 `features.formatter` 가 `ready` 로 바뀌면 켜진 것입니다.

---

## 10. 보안 주의사항

- **secrets.json 은 현재 평문 저장**입니다(`.env` 와 동일 수준). NAS 디스크에 접근할 수 있는
  사람에게 토큰/키가 노출될 수 있습니다. 데이터 폴더(`/volume1/docker/mdchirp/data`)를
  **신뢰할 수 있는 위치**에 두고, 공유/권한을 최소화하세요.
- 가능하면 데이터 폴더(특히 `secrets.json`)의 권한을 **소유자 전용(600 상당)** 으로 제한하세요.
  (DSM 공유폴더 권한 또는 SSH `chmod 600`.) 자동 권한/암호화는 추후 개선 예정입니다.
- 외부 접속은 Cloudflare Tunnel 등 **HTTPS 경유**를 권장합니다.

---

## 11. 운영 (업데이트 / 백업 / 문제 해결)

**업데이트(새 버전 배포):**
1. NAS SSH 접속 → 소스 폴더에서 최신 코드 받기:
   ```bash
   cd /volume1/docker/mdchirp/source
   sudo git pull
   ```
   (§3-4 에서 토큰을 지웠다면 pull 시 GitHub 사용자명/토큰을 물어봅니다.)
2. Container Manager → 프로젝트 → **빌드(Build)** 다시 실행 → 컨테이너 재생성.
   (데이터 폴더는 볼륨이라 그대로 유지됩니다.)

> 💡 매번 SSH로 들어가기 번거롭다면 → **§12 "SSH 없이 원클릭 갱신"** 을 한 번
> 설정해 두면, 이후엔 DSM 웹 화면의 **"실행" 버튼 하나**로 위 1~2단계가 끝납니다.

**백업:** 데이터 폴더(`/volume1/docker/mdchirp/data`)만 백업하면 글·설정·키가 모두 보존됩니다.

**문제 해결:**
- `/api/health` 가 안 뜨면 → Container Manager 로그 확인.
- clone 이 `Authentication failed` 로 실패하면 → 토큰(§3-4)의 권한/유효기간을 확인하세요
  (private 레포라 읽기 권한 토큰이 필수).
- `pnpm install --frozen-lockfile` 에러가 나면 → clone 된 소스에 `pnpm-lock.yaml` 이
  있는지 확인하세요(git clone 이면 보통 포함됩니다).
- 외부에서만 안 되면 → Cloudflare Tunnel 의 서비스 주소(`<NAS IP>:8787`)를 확인.

---

## 12. SSH 없이 원클릭 갱신 (deploy key + 작업 스케줄러)

> §11 의 업데이트(소스 pull + 재빌드)를 **DSM 웹 화면의 버튼 하나**로 끝내는 방법.
> 한 번만 설정해두면, 이후 PC/맥에서 GitHub 에 push 한 뒤 NAS 를 최신화할 때
> SSH 로 들어갈 필요 없이 DSM 작업 스케줄러의 **"실행"** 만 누르면 됩니다.
> (자동 일정 없이 **수동 버튼 전용**으로 등록 — 원할 때만 갱신됩니다.)

### 12-0. 큰 그림

```
PC/맥에서 코드 수정 → GitHub 에 push
                          │
                          ▼
DSM 작업 스케줄러의 "mdchirp 갱신" 작업 → [실행] 클릭
                          │  (nas-update.sh 실행)
                          ▼
   NAS 소스 git pull  →  docker compose 재빌드 & 재시작  →  최신 반영
```

핵심 두 조각:
- **read-only deploy key** — NAS 가 private 소스 레포를 **토큰 입력 없이, 평문 토큰
  저장 없이** 읽도록(pull) 해주는 SSH 키. 읽기 전용이라 NAS 가 코드를 GitHub 에
  거꾸로 쓸 수는 없습니다(안전).
- **작업 스케줄러** — 위 스크립트를 DSM 웹에서 버튼으로 실행하게 해주는 DSM 기능.

> 왜 §3 의 토큰 방식 대신 deploy key 인가: 토큰을 URL 에 박으면 평문 노출이고,
> 안 박으면 pull 할 때마다 토큰을 물어봐서 "원클릭" 이 깨집니다. deploy key 는
> 평문 토큰 없이 + 입력 없이 pull 되므로 원클릭 목표에 정확히 맞습니다.

### 12-1. read-only deploy key 만들기

**(a) NAS 안에서 키 생성** — SSH 로 접속(§3-2)한 뒤, root 권한으로:

```bash
# /root/.ssh 폴더 준비 + 키 생성 (암호 없이 → 무인 pull 가능)
sudo mkdir -p /root/.ssh
sudo ssh-keygen -t ed25519 -N "" -f /root/.ssh/mdchirp_deploy -C "mdchirp-nas-deploy"
sudo chmod 600 /root/.ssh/mdchirp_deploy
sudo chmod 644 /root/.ssh/mdchirp_deploy.pub

# 공개키 내용 출력 (다음 단계에서 GitHub 에 붙여넣을 것)
sudo cat /root/.ssh/mdchirp_deploy.pub
```

마지막 명령이 출력한 `ssh-ed25519 AAAA...mdchirp-nas-deploy` **한 줄 전체**를 복사해 둡니다.

**(b) GitHub 에 공개키 등록** (읽기 전용):

1. GitHub → 소스 레포 `oktoya/mdchirp` → **Settings → Deploy keys → Add deploy key**.
2. **Title**: `mdchirp NAS` (아무 이름).
3. **Key**: 위에서 복사한 공개키 한 줄 붙여넣기.
4. **Allow write access** 는 **체크하지 않음** (읽기 전용 — pull 만 하면 되므로).
5. **Add key**.

> 이 키는 **이 레포 하나에만** 유효하고, 읽기 전용입니다. 유출되더라도 코드를
> 읽기만 가능하고 쓰기/다른 레포 접근은 불가. 폐기는 GitHub 에서 이 키만 삭제하면 끝.

### 12-2. 소스 레포의 원격 주소를 SSH 로 전환

§3 에서 소스를 HTTPS 로 clone 했으므로, deploy key(SSH)를 쓰도록 원격 주소를 바꿉니다.

```bash
cd /volume1/docker/mdchirp/source
sudo git remote set-url origin git@github.com:oktoya/mdchirp.git

# deploy key 로 인증되는지 테스트 (처음엔 호스트키 확인이 뜨면 yes)
sudo GIT_SSH_COMMAND="ssh -i /root/.ssh/mdchirp_deploy -o StrictHostKeyChecking=accept-new" git pull --ff-only
```

마지막 명령이 `Already up to date.` 또는 변경분을 받아오면 deploy key 인증 성공입니다.
(`Permission denied (publickey)` 가 뜨면 12-1 의 공개키 등록을 다시 확인하세요.)

### 12-3. 갱신 스크립트 준비 (실행 권한)

스크립트는 레포에 이미 들어 있습니다: `apps/backend/scripts/nas-update.sh`
(§3 의 git pull 로 NAS 소스에 함께 받아집니다.) 실행 권한만 한 번 부여하세요:

```bash
sudo chmod +x /volume1/docker/mdchirp/source/apps/backend/scripts/nas-update.sh
```

> 스크립트 상단의 `SOURCE_DIR` / `COMPOSE_FILE` 변수는 이 가이드 기본 경로와
> 일치합니다. 데이터/소스 경로를 다르게 뒀다면 그 두 줄만 본인 경로로 고치세요.

### 12-4. DSM 작업 스케줄러에 등록 (버튼 만들기)

1. DSM → **제어판 → 작업 스케줄러(Task Scheduler)**.
2. **생성(Create) → 예약된 작업(Scheduled Task) → 사용자 정의 스크립트(User-defined script)**.
3. **일반(General)** 탭:
   - **작업 이름**: `mdchirp 갱신` (원하는 이름).
   - **사용자(User)**: `root` (docker 빌드/소스 접근 권한 때문에 root 필요).
4. **일정(Schedule)** 탭:
   - 자동 실행을 원치 않으므로 **일정을 비활성화**합니다. DSM 에서는 일정을 끄는
     직접 옵션이 없으니, 가장 드문 시각(예: 매월 1일 03:00)으로 두되 — 실제로는
     이 작업을 목록에서 골라 **수동으로 [실행]** 만 누를 것이므로 일정이 와도
     무해합니다. (정 신경 쓰이면 가장 먼 미래/드문 빈도로 설정.)
5. **작업 설정(Task Settings)** 탭 → **사용자 정의 스크립트** 칸에 아래 한 줄:

   ```sh
   /bin/sh /volume1/docker/mdchirp/source/apps/backend/scripts/nas-update.sh
   ```

   (선택) 실행 결과를 메일로 받고 싶으면 **"세부 정보를 이메일로 전송"** 체크.
6. **확인** 으로 저장.

### 12-5. 원클릭 갱신 사용법 (평소 운영)

PC/맥에서 코드를 고쳐 GitHub 에 push 한 뒤, NAS 를 최신화할 때:

1. DSM → **제어판 → 작업 스케줄러** 열기.
2. 목록에서 **`mdchirp 갱신`** 작업을 클릭해 선택.
3. 상단 **실행(Run)** 버튼 클릭 → "실행하시겠습니까?" → 확인.
4. 1~2분 기다린 뒤(코드만 바뀌면 캐시로 빠름) 헬스체크로 확인:
   `http://<NAS내부IP>:8787/api/health` 가 200 이면 갱신 완료.

> 진행 로그를 보고 싶으면: 작업을 우클릭 → **결과 보기/실행 결과** 에서 스크립트
> 출력(`==> [1/2] git pull` … `==> done.`)을 확인할 수 있습니다.

### 12-6. 문제 해결

- **`Permission denied (publickey)`** → 12-1(b) 의 공개키가 GitHub 에 제대로
  등록됐는지, 12-2 의 원격 주소가 `git@github.com:...` (SSH)인지 확인.
- **`git pull` 에서 멈춤/충돌** → 스크립트가 `--ff-only` 라 NAS 소스를 직접
  수정했으면 막힙니다. NAS 소스는 읽기 전용으로만 두세요(직접 편집 금지).
  꼬였다면 SSH 로 `cd .../source && sudo git reset --hard origin/main` 후 다시.
- **빌드 실패** → 작업 스케줄러 실행 결과 로그에서 compose 빌드 오류 확인
  (대개 `pnpm-lock.yaml` 불일치 또는 디스크 공간). Container Manager 로그도 참고.
- **권한 오류로 docker 명령 실패** → 작업의 **사용자가 `root`** 인지 다시 확인.
- **`container name ... already in use` (이름 충돌)** → 스크립트의
  `COMPOSE_PROJECT` 값이 Container Manager 가 만든 프로젝트 이름과 다른 경우.
  실제 이름은 `sudo docker inspect <컨테이너ID> --format '{{ index .Config.Labels "com.docker.compose.project" }}'`
  로 확인해 스크립트의 `COMPOSE_PROJECT` 를 그 값으로 맞춘다(이 가이드 기본값: `mdchirp`).
- **갱신 후 `/api/health` 의 features 가 `not_configured` 로 보임** → **이제 자동 복구됩니다.**
  서버가 기동할 때 `secrets.json` 의 Gemini 키를 읽어 런타임에 재주입하므로(컨테이너를
  Recreate 해도) 앱에서 키를 다시 저장할 필요가 없습니다. 그래도 `not_configured` 가
  지속되면 `secrets.json` 에 gemini 키가 실제로 있는지 확인하세요.

---

## 13. GitHub 발행 — `repo/` 워킹카피 최초 clone (한 번만)

> §0 의 "현재 한계"가 **해소되었습니다.** 이제 발행을 누르면 NAS 가 블로그 레포로
> **실제 git push** 합니다. 그 전제로, NAS 데이터 폴더의 `repo/` 가 **블로그 레포의
> git 워킹카피**여야 합니다. 최초 1회만 아래처럼 clone 해 두면 됩니다.

### 13-1. 발행 대상 레포 정하기 (테스트 먼저 권장)

처음에는 **테스트용 레포**로 검증한 뒤 실제 블로그로 바꾸는 것을 권장합니다
(실블로그에 실수로 push하는 사고 방지).

- 테스트 레포 예: `oktoya/mdchirp-publish-test` (private, README 하나 포함 → `main` 브랜치 존재).
- 검증이 끝나면 **앱 설정의 GitHub repo 값만** 실블로그로 바꾸면 됩니다(코드 변경 없음, §13-4).

### 13-2. 쓰기 권한 토큰(PAT) 준비

§8 과 동일합니다. Fine-grained PAT — 대상 레포 선택 → **Contents: Read and write** → 발급.

### 13-3. NAS 에서 `repo/` 로 clone (SSH, 최초 1회)

SSH 로 NAS 에 접속(§3-2)한 뒤:

```bash
cd /volume1/docker/mdchirp/data

# 백엔드가 만들어둔 빈 repo/ 가 있으면 비켜둔다(있을 때만 실행됨).
[ -e repo ] && sudo mv repo repo.bak.$(date +%s)

# 발행 대상 레포를 repo 라는 이름으로 clone. <PAT> 는 §13-2 토큰(1회용).
sudo git clone https://<PAT>@github.com/oktoya/mdchirp-publish-test.git repo

# clone URL 에 박힌 토큰을 remote 에서 지운다(발행 시엔 백엔드가 토큰을 자체 주입).
cd /volume1/docker/mdchirp/data/repo
sudo git remote set-url origin https://github.com/oktoya/mdchirp-publish-test.git
```

> 컨테이너 안에서는 이 폴더가 `/data/mdchirp/repo` 로 보입니다(볼륨 연결).
> 발행 시 백엔드가 `https://x-access-token:<PAT>@github.com/<repo>.git` 형태로
> **토큰을 push 명령에만 1회 주입**하므로, `repo/.git/config` 에 토큰이 남지 않습니다.

### 13-4. 앱 설정에서 대상 지정

mdchirp 데스크톱 앱 → **설정 → GitHub**:
- **repo**: `oktoya/mdchirp-publish-test` (형식: `owner/name`) — 실블로그 전환 시 이 값만 변경.
- **branch**: `main`
- **PAT**: §13-2 토큰 저장(→ `secrets.json`, 응답은 `설정됨 ✓` 불린만).

### 13-5. 발행 검증

앱에서 글 작성 → **저장** → **발행 → 지금 발행**. GitHub 대상 레포의 `_posts/<slug>.md`
가 생기면 성공입니다. (Container Manager 로그는 **자동 갱신되지 않으니** 발행 직후
우측 하단 새로고침을 눌러 `POST /api/posts/<slug>/publish 200` 을 확인하세요.)

### 13-6. 문제 해결

- **`발행 대상 git 워킹카피가 없습니다`** → §13-3 clone 이 `data/repo/` 에 됐는지 확인
  (컨테이너 안 `/data/mdchirp/repo`).
- **`GitHub 대상 레포가 설정되지 않았습니다`** → §13-4 repo 를 `owner/name` 형식으로 저장.
- **`GitHub 토큰(PAT)이 없습니다`** → §13-4 PAT 저장 확인.
- **`dubious ownership`** (로그에 이 문구) → clone 을 root(`sudo`)로 해서 컨테이너 유저와
  소유자가 달라 git 이 거부하는 경우. 발생 시 알려주세요(safe.directory 설정으로 대응).
- **발행해도 `_posts` 에 변화 없음 / `committed:false`** → 내용이 이전과 동일하면 git 이
  "nothing to commit" 으로 새 커밋을 만들지 않습니다(정상). 본문을 바꾼 뒤 다시 발행.

---

## 부록 A. GitHub 실발행 구현 참고

> ✅ **완료됨(2026-07-01).** 실제 GitHub 발행(git push)이 구현되어 앱 발행으로 검증되었습니다.
> 아래는 당시 인수인계 메모의 기록 보존용입니다(구현 결과는 §13 및 MANUAL B-12 참조).

- **~~현 상태~~ (당시):** `apps/backend/src/publisher/publishBuilder.ts` 의 발행 빌더는 1~6단계
  (slug 확정 / 프론트매터 / 본문 배치 / 미디어 배치 / 워터마크 슬롯 / 정책 슬롯)까지
  실제 동작. 7~9단계(git add/commit/push)는 `GitPublisher` 인터페이스로 분리돼 있고,
  현재 주입되는 구현체는 `NoopGitPublisher`(아무것도 안 함) 하나뿐.
- **할 일:** `GitPublisher` 의 실제 구현체(예: `SimpleGitPublisher`)를 만들어
  `repo/` 워킹카피에서 `git add/commit/push` 수행. 발행 라우트에서 Noop 대신 주입.
- **필요한 것:**
  - 컨테이너에 git 설치됨(이 가이드의 Dockerfile 이 `apk add git` 으로 이미 설치).
  - `repo/` 워킹카피 초기화(최초 `git clone`) 절차 — NAS 데이터 폴더에 블로그 레포 clone.
  - GitHub 인증: `secrets.json` 의 GitHub PAT 를 git push 시 사용(예: HTTPS URL 에
    토큰 주입 또는 credential helper). §8 에서 토큰을 미리 저장해두면 그대로 활용.
- **검증 아이디어:** 테스트용 레포에 실제 push → GitHub 에서 `_posts/<slug>.md` 확인.
- 관련 SPEC: `apps/backend/SPEC.md` §6(발행 빌더 7~9단계), §9(git 의존성).
- **구현 결과(2026-07-01):** `SimpleGitPublisher`(child_process 로 git 호출) 작성 →
  `routes/posts.ts` 에서 `NoopGitPublisher` 대신 주입. PAT 는 push URL 에 1회 주입,
  커밋 저자는 `mdchirp`/`mdchirp@localhost` 를 `-c` 로 커밋 단위 주입, `repo/` 는 수동
  clone(§13). 발행 라우트는 실패 시 502 `publish_failed` 반환. 검증: 앱 발행 → 테스트
  레포 `_posts/` 반영 확인.
