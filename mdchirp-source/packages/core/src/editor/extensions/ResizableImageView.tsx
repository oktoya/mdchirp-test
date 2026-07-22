import { NodeViewWrapper, type ReactNodeViewProps } from '@tiptap/react'
import type {
  ComponentType,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from 'react'

type ResizeCorner = 'nw' | 'ne' | 'sw' | 'se'

export interface RichImageEditTarget {
  pos: number
  src: string
  alt: string
  width: number | null
  height: number | null
}

export type RichImageEditHandler = (image: RichImageEditTarget) => void

function positiveDimension(value: unknown): number | null {
  const parsed =
    typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN

  if (!Number.isFinite(parsed) || parsed <= 0) return null
  return Math.round(parsed)
}

export function createResizableImageView(
  resolveImageSrc?: (src: string) => string,
  onImageEdit?: RichImageEditHandler,
): ComponentType<ReactNodeViewProps<HTMLElement>> {
  function ResizableImageView(props: ReactNodeViewProps<HTMLElement>) {
    const originalSrc = typeof props.node.attrs.src === 'string' ? props.node.attrs.src : ''

    const renderedSrc = resolveImageSrc?.(originalSrc) ?? originalSrc

    const width = positiveDimension(props.node.attrs.width)
    const height = positiveDimension(props.node.attrs.height)
    const alt = typeof props.node.attrs.alt === 'string' ? props.node.attrs.alt : ''

    function selectImage() {
      const position = props.getPos()

      if (typeof position === 'number') {
        props.editor.commands.setNodeSelection(position)
      }
    }

    function openImageEditor(event: ReactMouseEvent<HTMLImageElement>) {
      event.preventDefault()
      event.stopPropagation()

      if (!props.editor.isEditable) return

      const position = props.getPos()
      if (typeof position !== 'number') return

      props.editor.commands.setNodeSelection(position)

      onImageEdit?.({
        pos: position,
        src: originalSrc,
        alt,
        width,
        height,
      })
    }

    function startResize(event: ReactPointerEvent<HTMLButtonElement>, corner: ResizeCorner) {
      event.preventDefault()
      event.stopPropagation()

      if (!props.editor.isEditable) return

      selectImage()

      const wrapper = event.currentTarget.closest('.mdc-resizable-image') as HTMLElement | null
      const image = wrapper?.querySelector('.mdc-resizable-image__image') as HTMLImageElement | null

      if (!image) return

      const rect = image.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return

      const startX = event.clientX
      const startY = event.clientY
      const startWidth = rect.width
      const startHeight = rect.height
      const aspectRatio = startWidth / startHeight

      const horizontalDirection = corner.endsWith('e') ? 1 : -1
      const verticalDirection = corner.startsWith('s') ? 1 : -1

      const previousUserSelect = document.body.style.userSelect
      const previousCursor = document.body.style.cursor

      document.body.style.userSelect = 'none'
      document.body.style.cursor = 'nwse-resize'

      function onPointerMove(pointerEvent: PointerEvent) {
        pointerEvent.preventDefault()

        const widthCandidate = startWidth + (pointerEvent.clientX - startX) * horizontalDirection
        const heightCandidate = startHeight + (pointerEvent.clientY - startY) * verticalDirection

        const widthChange = Math.abs(widthCandidate - startWidth) / startWidth
        const heightChange = Math.abs(heightCandidate - startHeight) / startHeight

        let nextWidth = widthChange >= heightChange ? widthCandidate : heightCandidate * aspectRatio

        nextWidth = Math.max(40, Math.min(4096, nextWidth))

        const nextHeight = Math.max(1, nextWidth / aspectRatio)

        props.updateAttributes({
          width: Math.round(nextWidth),
          height: Math.round(nextHeight),
        })
      }

      function finishResize() {
        window.removeEventListener('pointermove', onPointerMove)
        window.removeEventListener('pointerup', finishResize)
        window.removeEventListener('pointercancel', finishResize)

        document.body.style.userSelect = previousUserSelect
        document.body.style.cursor = previousCursor
      }

      window.addEventListener('pointermove', onPointerMove)
      window.addEventListener('pointerup', finishResize)
      window.addEventListener('pointercancel', finishResize)
    }

    return (
      <NodeViewWrapper
        className={'mdc-resizable-image' + (props.selected ? ' is-selected' : '')}
        data-mdchirp-src={originalSrc}
      >
        <img
          className="mdc-resizable-image__image"
          src={renderedSrc}
          alt={alt}
          data-mdchirp-src={originalSrc}
          draggable={false}
          style={{
            width: width ? `${width}px` : undefined,
            height: height ? `${height}px` : undefined,
          }}
          onClick={selectImage}
          onDoubleClick={openImageEditor}
        />

        {props.selected && props.editor.isEditable && (
          <>
            <button
              type="button"
              className="mdc-resizable-image__handle is-nw"
              aria-label="왼쪽 위에서 이미지 크기 조절"
              contentEditable={false}
              onPointerDown={(event) => startResize(event, 'nw')}
            />
            <button
              type="button"
              className="mdc-resizable-image__handle is-ne"
              aria-label="오른쪽 위에서 이미지 크기 조절"
              contentEditable={false}
              onPointerDown={(event) => startResize(event, 'ne')}
            />
            <button
              type="button"
              className="mdc-resizable-image__handle is-sw"
              aria-label="왼쪽 아래에서 이미지 크기 조절"
              contentEditable={false}
              onPointerDown={(event) => startResize(event, 'sw')}
            />
            <button
              type="button"
              className="mdc-resizable-image__handle is-se"
              aria-label="오른쪽 아래에서 이미지 크기 조절"
              contentEditable={false}
              onPointerDown={(event) => startResize(event, 'se')}
            />
          </>
        )}

        {props.selected && props.editor.isEditable && (
          <span className="mdc-resizable-image__size" contentEditable={false}>
            {width && height ? `${width} × ${height}px` : '모서리를 드래그하여 크기 조절'}
          </span>
        )}
      </NodeViewWrapper>
    )
  }

  return ResizableImageView
}
