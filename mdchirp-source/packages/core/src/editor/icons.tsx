// icons.tsx — 툴바용 깔끔한 라인 SVG 아이콘 모음.
// 외부 아이콘 패키지 의존 없이 인라인 SVG로(번들 가볍게, 색은 currentColor).

import type { ReactNode } from 'react'

const S = (children: ReactNode) => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {children}
  </svg>
)

export const Icon = {
  bold: () =>
    S(
      <>
        <path d="M6 4h8a4 4 0 0 1 0 8H6z" />
        <path d="M6 12h9a4 4 0 0 1 0 8H6z" />
      </>,
    ),
  italic: () =>
    S(
      <>
        <line x1="19" y1="4" x2="10" y2="4" />
        <line x1="14" y1="20" x2="5" y2="20" />
        <line x1="15" y1="4" x2="9" y2="20" />
      </>,
    ),
  strike: () =>
    S(
      <>
        <path d="M16 4H9a3 3 0 0 0-2.83 4" />
        <path d="M14 12a4 4 0 0 1 0 8H6" />
        <line x1="4" y1="12" x2="20" y2="12" />
      </>,
    ),
  code: () =>
    S(
      <>
        <polyline points="16 18 22 12 16 6" />
        <polyline points="8 6 2 12 8 18" />
      </>,
    ),
  underline: () =>
    S(
      <>
        <path d="M6 4v6a6 6 0 0 0 12 0V4" />
        <line x1="4" y1="21" x2="20" y2="21" />
      </>,
    ),
  palette: () =>
    S(
      <>
        <circle cx="13.5" cy="6.5" r="1.2" fill="currentColor" stroke="none" />
        <circle cx="17.5" cy="10.5" r="1.2" fill="currentColor" stroke="none" />
        <circle cx="8.5" cy="7.5" r="1.2" fill="currentColor" stroke="none" />
        <circle cx="6.5" cy="12.5" r="1.2" fill="currentColor" stroke="none" />
        <path d="M12 2a10 10 0 0 0 0 20c1.1 0 2-.9 2-2 0-.5-.2-1-.5-1.3-.3-.4-.5-.8-.5-1.2 0-.9.8-1.5 1.7-1.5H16a6 6 0 0 0 6-6c0-4.4-4.5-8-10-8z" />
      </>,
    ),
  highlight: () =>
    S(
      <>
        <path d="M9 11l-4 4v3h3l4-4" />
        <path d="M13 7l4 4" />
        <path d="M15 5l4 4-7 7-4-4z" />
      </>,
    ),
  image: () =>
    S(
      <>
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <polyline points="21 15 16 10 5 21" />
      </>,
    ),
  video: () =>
    S(
      <>
        <rect x="2" y="5" width="14" height="14" rx="2" />
        <polygon points="22 7 16 12 22 17 22 7" />
      </>,
    ),
  file: () =>
    S(
      <>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
      </>,
    ),
  link: () =>
    S(
      <>
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
      </>,
    ),
  quote: () =>
    S(
      <>
        <path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2-2-2H4c-1.25 0-2 .75-2 2v6c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V21z" />
      </>,
    ),
  codeBlock: () =>
    S(
      <>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <polyline points="9 9 7 12 9 15" />
        <polyline points="15 9 17 12 15 15" />
      </>,
    ),
  bulletList: () =>
    S(
      <>
        <line x1="9" y1="6" x2="20" y2="6" />
        <line x1="9" y1="12" x2="20" y2="12" />
        <line x1="9" y1="18" x2="20" y2="18" />
        <circle cx="4" cy="6" r="1" fill="currentColor" />
        <circle cx="4" cy="12" r="1" fill="currentColor" />
        <circle cx="4" cy="18" r="1" fill="currentColor" />
      </>,
    ),
  orderedList: () =>
    S(
      <>
        <line x1="10" y1="6" x2="21" y2="6" />
        <line x1="10" y1="12" x2="21" y2="12" />
        <line x1="10" y1="18" x2="21" y2="18" />
        <path d="M4 6h1v4" />
        <path d="M4 10h2" />
        <path d="M6 18H4l2-3H4" />
      </>,
    ),
  taskList: () =>
    S(
      <>
        <polyline points="3 8 5 10 9 5" />
        <polyline points="3 17 5 19 9 14" />
        <line x1="13" y1="7" x2="21" y2="7" />
        <line x1="13" y1="16" x2="21" y2="16" />
      </>,
    ),
  alignLeft: () =>
    S(
      <>
        <line x1="3" y1="6" x2="21" y2="6" />
        <line x1="3" y1="12" x2="15" y2="12" />
        <line x1="3" y1="18" x2="18" y2="18" />
      </>,
    ),
  alignCenter: () =>
    S(
      <>
        <line x1="3" y1="6" x2="21" y2="6" />
        <line x1="6" y1="12" x2="18" y2="12" />
        <line x1="4" y1="18" x2="20" y2="18" />
      </>,
    ),
  alignRight: () =>
    S(
      <>
        <line x1="3" y1="6" x2="21" y2="6" />
        <line x1="9" y1="12" x2="21" y2="12" />
        <line x1="6" y1="18" x2="21" y2="18" />
      </>,
    ),
  alignJustify: () =>
    S(
      <>
        <line x1="3" y1="6" x2="21" y2="6" />
        <line x1="3" y1="12" x2="21" y2="12" />
        <line x1="3" y1="18" x2="21" y2="18" />
      </>,
    ),
  hr: () => S(<line x1="3" y1="12" x2="21" y2="12" />),
  mic: () =>
    S(
      <>
        <rect x="9" y="2" width="6" height="12" rx="3" />
        <path d="M5 10a7 7 0 0 0 14 0" />
        <line x1="12" y1="17" x2="12" y2="22" />
        <line x1="8" y1="22" x2="16" y2="22" />
      </>,
    ),
  sparkles: () =>
    S(
      <>
        <path d="M12 3l1.6 4.6L18 9l-4.4 1.4L12 15l-1.6-4.6L6 9l4.4-1.4z" />
        <path d="M19 14l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z" />
      </>,
    ),
  save: () =>
    S(
      <>
        <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
        <polyline points="17 21 17 13 7 13 7 21" />
        <polyline points="7 3 7 8 15 8" />
      </>,
    ),
  publish: () =>
    S(
      <>
        <line x1="22" y1="2" x2="11" y2="13" />
        <polygon points="22 2 15 22 11 13 2 9 22 2" />
      </>,
    ),
  chevron: () => S(<polyline points="6 9 12 15 18 9" />),
  clock: () =>
    S(
      <>
        <circle cx="12" cy="12" r="9" />
        <polyline points="12 7 12 12 15 14" />
      </>,
    ),
  youtube: () =>
    S(
      <>
        <rect x="2" y="5" width="20" height="14" rx="4" />
        <polygon points="10 9 16 12 10 15 10 9" fill="currentColor" stroke="none" />
      </>,
    ),
}
