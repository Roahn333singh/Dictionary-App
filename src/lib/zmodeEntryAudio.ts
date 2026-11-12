/** Stinger extracted from zmode_entry.mp4 (12s, played once). */

const SRC = '/zmode-entry.mp3'

let clip: HTMLAudioElement | null = null

function ensureClip(): HTMLAudioElement {
  if (!clip) {
    clip = new Audio(SRC)
    clip.preload = 'auto'
    clip.loop = false
  }
  return clip
}

/** Start buffering. Does not play. */
export function primeZModeStinger(): void {
  if (typeof Audio === 'undefined') return
  ensureClip()
}

/**
 * Play the entry stinger from the start. Call synchronously inside the
 * Z-button click handler, before any await, so the browser keeps the gesture.
 */
export function playZModeStinger(): void {
  if (typeof Audio === 'undefined') return
  const audio = ensureClip()
  audio.loop = false
  try {
    audio.currentTime = 0
  } catch {
    // Seek can throw before metadata arrives. play() still starts at 0.
  }
  void audio.play().catch(() => {
    // Autoplay can still reject if the gesture was lost. The entry continues.
  })
}

export function stopZModeStinger(): void {
  if (!clip) return
  clip.pause()
  try {
    clip.currentTime = 0
  } catch {
    // ignore
  }
}
