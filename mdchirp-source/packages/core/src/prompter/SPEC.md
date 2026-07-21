# prompter (프롬프터) 모듈 SPEC — 📋 슬롯 (1차 미구현)

> 글 내용으로 유튜브 쇼츠를 만드는 파이프라인. 지금은 구조만 준비한다.
> 상위: `packages/core/SPEC.md`

---

## 1. 목적 (Why)

블로그 글을 입력으로 받아 쇼츠를 생성하고, 쇼츠와 본문을 함께 예약발행한다.
**1차에는 구현하지 않고, 데이터/인터페이스 슬롯만 비워둔다.** (나중에 대공사 방지)

---

## 2. 파이프라인 (목표 흐름)

```
글 내용
 → 1. 대본 생성 (LLM, NAS 프록시)
 → 2. 음성 변환 (TTS, ElevenLabs)
 → 3. 영상 생성 (이미지/자막/음성 합성)
 → 4. 쇼츠 업로드 + 예약발행 (블로그 링크 포함)
 → 5. 쇼츠 링크를 본문에 삽입 → 포스트도 예약발행
```

각 단계는 NAS 백엔드의 **작업 큐(job queue)**에서 비동기 처리 (무겁고 오래 걸리므로).

---

## 3. 책임 경계 (구현 시)

**할 것:** 대본 초안 표시·편집, 단계별 진행 상태 표시, 결과(음성/영상) 미리보기, 예약 설정.
**안 할 것:** 실제 생성은 NAS가 함(기기는 요청·표시만). 키는 NAS에만.

---

## 4. 데이터 슬롯 (✅ 이미 shared 에 박아둠)

`ShortsJob` / `ShortsStage` 는 **이미 `@mdchirp/shared` 의 `types.ts` 에 정의**되어 있다.
(구현 시 새로 만들지 말고 import. 모델만 미리 박아 "나중 대공사" 방지)

```typescript
import type { ShortsJob, ShortsStage } from '@mdchirp/shared'
//   ShortsJob { id, postId, stage, scriptDraft?, voiceTrackUrl?, videoUrl?,
//               shortsUrl?, scheduledAt?, error? }
//   ShortsStage = 'script'|'tts'|'video'|'publishing'|'done'|'failed'
```
- `Post.shortsJobId` 로 글과 연결(이미 `Post` 타입에 슬롯 있음).

---

## 5. 기존 인프라 재사용

- LLM 프록시(`/api/format/suggest`와 같은 계층) → 대본 생성에 재사용.
- TTS(ElevenLabs)는 받아쓰기 STT와 같은 "오디오/AI 어댑터" 계층으로 통합 가능.
- 예약발행은 backend 스케줄러(이미 슬롯) 재사용.

---

## 6. 상태 / 협업 노트

- 📋 **전체 슬롯. 1차에는 구현하지 않는다.** (NAS 작업 큐 + TTS + 영상생성이 필요 — 큰 작업)
- 지금 협업자가 할 수 있는 최소: 에디터에 "이 글로 쇼츠 만들기"(disabled) 진입점,
  `ShortsJob` 타입 기반의 단계 표시 UI **목업**(실제 생성 호출 없이).
- **선행 조건**: 실제 구현은 NAS 백엔드의 job queue + 외부 API(TTS/영상)가 먼저 필요.
  → 다른 슬롯(lister/settings/shell)보다 **후순위**. 지금은 분담하지 않는 것을 권장.

### 완료 기준 (구현에 착수할 경우)

- [ ] 실제 생성은 전부 NAS(기기는 요청·표시만), 키는 NAS 에만
- [ ] `ShortsJob.stage` 기반 단계 진행 UI + 결과 미리보기
- [ ] `pnpm check` 통과 + 이 SPEC §상태 갱신

---

## 7. 미래 확장

- 템플릿(자막 스타일/BGM), 멀티 플랫폼(쇼츠/릴스/틱톡), A/B 썸네일
