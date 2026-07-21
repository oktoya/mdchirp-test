// sections.ts — 설정 섹션 레지스트리.
// SPEC §4 표를 코드 자료구조로 옮긴 단일 소스. UI 는 이 배열을 렌더한다.
// 새 기능 = 이 배열에 한 줄 추가(기존 불변 = 수술적 변경).
//   ready   ✅ 지금 동작 (소비처+backend 준비됨)
//   partial 🚧 값은 저장되나 소비처가 아직 안 읽음 (UI 동작, 효과는 나중)
//   slot    📋 자리표시자만 (비활성 + "준비 중" 배지). todo 로 시야에 남김.

export type SectionStatus = 'ready' | 'partial' | 'slot'

export interface SectionDef {
  id: string // 'connection' | 'github' | 'ai' | ...
  num: number // SPEC §4 의 # (1~12)
  label: string
  status: SectionStatus
  note?: string // partial/slot 안내 문구
}

// SPEC §4 의 12행을 그대로 옮긴 것. 순서·번호·상태가 SPEC 과 일치해야 한다
// (settings.test.ts 가 불변식으로 강제).
export const SECTIONS: SectionDef[] = [
  { id: 'connection', num: 1, label: '연결(NAS)', status: 'ready' },
  { id: 'github', num: 2, label: 'GitHub', status: 'ready' },
  { id: 'ai', num: 3, label: 'AI 키/모델', status: 'ready' },
  {
    id: 'editor',
    num: 4,
    label: '에디터 동작',
    status: 'partial',
    note: '값은 저장됩니다. 실제 적용은 에디터 연결 후.',
  },
  {
    id: 'dictation',
    num: 5,
    label: '받아쓰기',
    status: 'partial',
    note: '값은 저장됩니다. 실제 적용은 에디터 연결 후.',
  },
  {
    id: 'suggestions',
    num: 6,
    label: '서식·slug 제안',
    status: 'partial',
    note: '값은 저장됩니다. 실제 적용은 에디터 연결 후.',
  },
  {
    id: 'image',
    num: 7,
    label: '이미지 저장 형식',
    status: 'ready',
  },
  {
    id: 'headerImage',
    num: 8,
    label: '헤더이미지 자동생성/검색',
    status: 'slot',
    note: '준비 중',
  },
  {
    id: 'youtube',
    num: 9,
    label: '유튜브 계정 연결',
    status: 'slot',
    note: '준비 중',
  },
  {
    id: 'shortcuts',
    num: 10,
    label: '단축키/단축어',
    status: 'slot',
    note: '준비 중',
  },
  {
    id: 'theme',
    num: 11,
    label: 'GitHub 테마별 문법',
    status: 'slot',
    note: '준비 중',
  },
  {
    id: 'mediaPolicy',
    num: 12,
    label: '미디어 정책·워터마크',
    status: 'slot',
    note: '준비 중',
  },
]
