# mdchirp NAS 백엔드 — Docker 이미지
# 빌드 컨텍스트는 monorepo 루트(../../). pnpm workspace 의 shared 패키지까지 함께 복사.
# 실행은 tsx 로 src/server.ts 직접 구동(이 프로젝트 관례: tsx/strip-types).
# git: 다음 단계의 실제 발행(git push)용으로 미리 설치해 둔다.
FROM node:20-alpine

# 발행(git push)에 필요한 git + 시간대 데이터(tzdata) 설치.
# Alpine 은 tzdata 가 기본 없어 TZ 환경변수가 안 먹으므로 반드시 설치한다.
RUN apk add --no-cache git tzdata

# 컨테이너 시간대를 한국(NAS 위치)으로 고정. nas 모드 발행 시각의 기준.
ENV TZ=Asia/Seoul

# pnpm 활성화 (루트 package.json 의 packageManager 핀 사용)
RUN corepack enable

WORKDIR /app

# --- 의존성 설치 레이어 (캐시 최적화) ---
# workspace 매니페스트만 먼저 복사해 install 캐시를 살린다.
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/shared/package.json packages/shared/
COPY apps/backend/package.json apps/backend/

# backend 와 그 의존(shared)만 설치
RUN pnpm install --frozen-lockfile --filter @mdchirp/backend...

# --- 소스 복사 ---
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/backend apps/backend

# 데이터 디렉토리(볼륨 마운트 지점). compose 에서 호스트 폴더를 여기 연결.
ENV MDCHIRP_DATA_DIR=/data/mdchirp
ENV PORT=8787
RUN mkdir -p /data/mdchirp

EXPOSE 8787

WORKDIR /app/apps/backend
# tsx 로 직접 실행 (dev 의존성 tsx 사용)
CMD ["pnpm", "exec", "tsx", "src/server.ts"]
