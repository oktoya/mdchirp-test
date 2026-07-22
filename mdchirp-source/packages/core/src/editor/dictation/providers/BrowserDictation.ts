// BrowserDictation.ts — [1차] Web Speech API 기반 받아쓰기.
//
// 웹뷰 내장, 무료, 온라인 필요. 미지원 브라우저/오프라인이면 isAvailable()===false.
// 에디터는 DictationProvider 인터페이스만 의존한다(엔진 교체 가능).
//
// SPEC: packages/core/src/editor/SPEC.md §5

import type { DictationProvider } from '@mdchirp/shared'

// Web Speech API 타입(브라우저 표준이지만 lib.dom 에 일부만 존재)
interface SpeechRecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((e: SpeechRecognitionEventLike) => void) | null
  onerror: ((e: unknown) => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
}
interface SpeechRecognitionEventLike {
  resultIndex: number
  results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }>
}

function getCtor(): (new () => SpeechRecognitionLike) | null {
  const w = window as unknown as Record<string, unknown>
  return (w.SpeechRecognition || w.webkitSpeechRecognition || null) as
    | (new () => SpeechRecognitionLike)
    | null
}

export class BrowserDictation implements DictationProvider {
  id = 'browser-webspeech'
  private rec: SpeechRecognitionLike | null = null

  constructor(private lang = 'ko-KR') {}

  isAvailable(): boolean {
    return typeof window !== 'undefined' && getCtor() !== null && navigator.onLine
  }

  start(onText: (chunk: string, isFinal: boolean) => void): void {
    const Ctor = getCtor()
    if (!Ctor) return
    const rec = new Ctor()
    rec.lang = this.lang
    rec.continuous = true
    rec.interimResults = true
    rec.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]
        onText(r[0].transcript, r.isFinal)
      }
    }
    rec.onend = () => {
      this.rec = null
    }
    rec.start()
    this.rec = rec
  }

  stop(): void {
    this.rec?.stop()
    this.rec = null
  }
}
