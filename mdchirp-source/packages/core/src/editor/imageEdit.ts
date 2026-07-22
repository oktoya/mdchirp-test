// imageEdit.ts — 기존 이미지 상세 편집의 크기 검증·비율 계산 순수 함수.
//
// UI와 TipTap 트랜잭션에서 분리해 잘못된 크기가 문서에 들어가는 것을 막는다.
// SPEC: packages/core/src/editor/SPEC.md §7-3

export type ParsedImageDimensions =
  | {
      ok: true
      width: number | null
      height: number | null
    }
  | {
      ok: false
      message: string
    }

type ChangedDimension = 'width' | 'height'

/**
 * 양수인 유한 숫자를 정수 픽셀로 정규화한다.
 * 0, 음수, NaN, Infinity와 반올림 후 0이 되는 값은 거부한다.
 */
export function positiveImageDimension(value: unknown): number | null {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim()
        ? Number(value)
        : Number.NaN

  if (!Number.isFinite(parsed) || parsed <= 0) return null

  const rounded = Math.round(parsed)
  return rounded > 0 ? rounded : null
}

/**
 * 상세 편집 폼의 너비·높이를 함께 검증한다.
 *
 * - 둘 다 비어 있으면 명시적 크기 없음(width/height=null).
 * - 둘 다 양수인 유한 숫자면 정수로 반올림한다.
 * - 한쪽만 비었거나 하나라도 잘못된 값이면 적용하지 않는다.
 */
export function parseImageDimensions(
  widthValue: string,
  heightValue: string,
): ParsedImageDimensions {
  const widthText = widthValue.trim()
  const heightText = heightValue.trim()

  if (!widthText && !heightText) {
    return {
      ok: true,
      width: null,
      height: null,
    }
  }

  if (!widthText || !heightText) {
    return {
      ok: false,
      message: '너비와 높이를 모두 입력하거나 원본 크기 복원을 사용해 주세요.',
    }
  }

  const width = positiveImageDimension(widthText)
  const height = positiveImageDimension(heightText)

  if (width === null || height === null) {
    return {
      ok: false,
      message: '너비와 높이는 0보다 큰 숫자로 입력해 주세요.',
    }
  }

  return {
    ok: true,
    width,
    height,
  }
}

/**
 * 비율 계산 기준을 고른다.
 *
 * 1. 이미지 파일의 자연 크기
 * 2. 현재 이미지 노드의 width/height
 * 3. 둘 다 유효하지 않으면 null
 */
export function resolveImageAspectRatio(
  naturalWidth: unknown,
  naturalHeight: unknown,
  currentWidth: unknown,
  currentHeight: unknown,
): number | null {
  const naturalW = positiveImageDimension(naturalWidth)
  const naturalH = positiveImageDimension(naturalHeight)

  if (naturalW !== null && naturalH !== null) {
    return naturalW / naturalH
  }

  const currentW = positiveImageDimension(currentWidth)
  const currentH = positiveImageDimension(currentHeight)

  if (currentW !== null && currentH !== null) {
    return currentW / currentH
  }

  return null
}

/**
 * 비율 유지가 켜진 상태에서 반대쪽 크기를 계산한다.
 *
 * - width 변경: height = width / ratio
 * - height 변경: width = height * ratio
 */
export function pairedImageDimension(
  changed: ChangedDimension,
  value: unknown,
  aspectRatio: number | null,
): number | null {
  const dimension = positiveImageDimension(value)

  if (
    dimension === null ||
    aspectRatio === null ||
    !Number.isFinite(aspectRatio) ||
    aspectRatio <= 0
  ) {
    return null
  }

  const paired =
    changed === 'width' ? Math.round(dimension / aspectRatio) : Math.round(dimension * aspectRatio)

  return paired > 0 ? paired : null
}
