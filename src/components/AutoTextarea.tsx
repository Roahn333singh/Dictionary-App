import { useLayoutEffect, useRef, type TextareaHTMLAttributes } from 'react'

/** Grows to the text and stays tight — no empty rows in fetched meaning boxes. */
export function AutoTextarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const innerRef = useRef<HTMLTextAreaElement>(null)

  function fit() {
    const el = innerRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.max(el.scrollHeight, 44)}px`
  }

  useLayoutEffect(fit, [props.value])

  return (
    <textarea
      {...props}
      ref={innerRef}
      rows={props.rows ?? 1}
      onInput={(e) => {
        fit()
        props.onInput?.(e)
      }}
    />
  )
}
