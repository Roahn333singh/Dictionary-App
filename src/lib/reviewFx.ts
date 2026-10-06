/** Crisp page-turn click + optional phone vibration. */

let audio: AudioContext | null = null

function context(): AudioContext | null {
  try {
    audio ??= new AudioContext()
    if (audio.state === 'suspended') void audio.resume()
    return audio
  } catch {
    return null
  }
}

export function unlockReviewFx() {
  context()
}

export function haptic(pattern: number | number[] = 12) {
  try {
    navigator.vibrate?.(pattern)
  } catch {
    // iOS Safari ignores this unless the page is installed; audio still ticks.
  }
}

/** Short paper-flick: noise burst + a falling tick. */
export function pageTurnSound() {
  const ac = context()
  if (!ac) return
  const t0 = ac.currentTime

  const dur = 0.11
  const buffer = ac.createBuffer(1, Math.floor(ac.sampleRate * dur), ac.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < data.length; i++) {
    const fall = 1 - i / data.length
    data[i] = (Math.random() * 2 - 1) * fall * fall * 0.55
  }
  const noise = ac.createBufferSource()
  noise.buffer = buffer
  const band = ac.createBiquadFilter()
  band.type = 'highpass'
  band.frequency.value = 900
  const ng = ac.createGain()
  ng.gain.setValueAtTime(0.0001, t0)
  ng.gain.exponentialRampToValueAtTime(0.28, t0 + 0.006)
  ng.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.1)
  noise.connect(band)
  band.connect(ng)
  ng.connect(ac.destination)
  noise.start(t0)
  noise.stop(t0 + dur)

  const tick = ac.createOscillator()
  tick.type = 'triangle'
  tick.frequency.setValueAtTime(1650, t0)
  tick.frequency.exponentialRampToValueAtTime(380, t0 + 0.09)
  const tg = ac.createGain()
  tg.gain.setValueAtTime(0.0001, t0)
  tg.gain.exponentialRampToValueAtTime(0.09, t0 + 0.004)
  tg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.09)
  tick.connect(tg)
  tg.connect(ac.destination)
  tick.start(t0)
  tick.stop(t0 + 0.1)
}

export function turnPageFx() {
  haptic([8, 24, 16])
  pageTurnSound()
}
