# core 패키지 SPEC (개요)

> 플랫폼 독립적인 공유 코어. 데스크톱앱·블로그팝업·웹앱이 모두 이걸 마운트한다.
> 상위: `/SPEC.md`

---

## 1. 목적 (Why)

mdchirp의 **모든 UI와 로직**을 한 곳에 담아, 어느 껍데기(Tauri/브라우저/팝업)에 넣어도
동일하게 동작하게 한다. = One source, multi use의 실체.

---

## 2. 책임 범위

**한다:** 모듈(editor/lister/settings/prompter/shell) + 서비스(sync) 제공.
**안 한다:** 플랫폼 의존 코드(파일시스템, 네이티브 API) 직접 호출 금지 → 어댑터로 주입받음.

---

## 3. 구성 (각 하위 SPEC 참조)

```
core/src/
├── shell/      본체 UI (모듈 레이아웃)         → shell/SPEC.md
├── editor/     리치 에디터                      → editor/SPEC.md
├── lister/     글 목록/검색/배지                → lister/SPEC.md
├── settings/   설정/정책/키                     → settings/SPEC.md
├── prompter/   쇼츠 생성 (슬롯)                 → prompter/SPEC.md
└── sync/       로컬저장+큐+NAS클라이언트(UI없음) → sync/SPEC.md
```

---

## 4. 플랫폼 어댑터 (Platform Adapter)

코어는 플랫폼 기능을 직접 안 쓰고 인터페이스로 주입받는다 (껍데기가 구현 제공):

```typescript
interface PlatformAdapter {
  storage: LocalStorageAdapter   // IndexedDB(브라우저) or 네이티브
  http: HttpAdapter              // NAS API 호출
  clipboard?, fileDialog?, ...   // 선택 기능
}
```
- Tauri 앱 → Tauri 플러그인으로 구현 주입
- 브라우저/팝업 → 표준 Web API로 구현 주입
- → 코어 코드는 변경 0

---

## 5. 의존성

- React, TipTap, Dexie, `packages/shared`
- 런타임 주입: `PlatformAdapter`, AI 어댑터들

---

## 6. 상태

- ✅ 구현 완료: shell/editor/lister/settings/sync
- 📋 슬롯: prompter

---

## 7. 미래 확장

- 모바일 어댑터, 팝업(embed) 마운트 진입점
