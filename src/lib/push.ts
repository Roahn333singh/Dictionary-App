import { supabase } from './supabase'

const vapidPublicKey = String(import.meta.env.VITE_VAPID_PUBLIC_KEY ?? '').trim()

export type PushAvailability = 'ready' | 'prompt' | 'blocked' | 'install-first' | 'unsupported'
export type NotifyDelivery = 'sent' | 'no-device' | 'failed'
export type PushEnableResult = 'granted' | 'denied' | 'failed' | 'unsupported' | 'unconfigured'

export function syncAppBadge(count: number) {
  if (typeof navigator === 'undefined') return
  const nav = navigator as Navigator & {
    setAppBadge?: (contents?: number) => Promise<void>
    clearAppBadge?: () => Promise<void>
  }
  const next = Math.max(0, Math.min(99, Math.round(count)))
  const task = next === 0 ? nav.clearAppBadge?.() : nav.setAppBadge?.(next)
  void task?.catch(() => {})
}

export function getPushAvailability(): PushAvailability {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported'
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent)
  const standalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  const canPush = 'serviceWorker' in navigator && 'PushManager' in window
  if (!canPush) return ios && !standalone ? 'install-first' : 'unsupported'
  if (Notification.permission === 'granted') return 'ready'
  if (Notification.permission === 'denied') return 'blocked'
  return 'prompt'
}

function urlBase64ToUint8Array(value: string) {
  const padding = '='.repeat((4 - (value.length % 4)) % 4)
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const output = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i)
  return output
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null
  const existing = await navigator.serviceWorker.getRegistration()
  if (existing) return existing
  const started = Date.now()
  while (Date.now() - started < 8000) {
    await new Promise((resolve) => setTimeout(resolve, 300))
    const reg = await navigator.serviceWorker.getRegistration()
    if (reg) return reg
  }
  return null
}

async function saveSubscription(sub: PushSubscription) {
  if (!supabase) throw new Error('Supabase is not configured')
  const json = sub.toJSON()
  const endpoint = json.endpoint
  const p256dh = json.keys?.p256dh
  const auth = json.keys?.auth
  if (!endpoint || !p256dh || !auth) throw new Error('Incomplete push subscription')
  const { error } = await supabase.rpc('save_push_subscription', {
    p_endpoint: endpoint,
    p_p256dh: p256dh,
    p_auth: auth,
  })
  if (error) throw error
}

async function subscribeCurrentDevice() {
  const reg = await registration()
  if (!reg || !vapidPublicKey) return false
  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    })
  }
  await saveSubscription(sub)
  return true
}

let syncedAt = 0

/** Subscribe this phone when permission was already granted. Never prompts. */
export async function syncPushSubscription() {
  if (getPushAvailability() !== 'ready' || !vapidPublicKey) return
  if (Date.now() - syncedAt < 60_000) return
  try {
    const ok = await subscribeCurrentDevice()
    if (ok) syncedAt = Date.now()
  } catch (err) {
    console.warn('Could not refresh push subscription', err)
  }
}

/** Must be called from a tap. The permission prompt has to stay in that gesture. */
export function enablePush(): Promise<PushEnableResult> {
  if (!vapidPublicKey) return Promise.resolve('unconfigured')
  if (getPushAvailability() === 'unsupported' || getPushAvailability() === 'install-first') {
    return Promise.resolve('unsupported')
  }
  return Notification.requestPermission().then(async (permission) => {
    if (permission !== 'granted') return 'denied'
    try {
      const ok = await subscribeCurrentDevice()
      return ok ? 'granted' : 'failed'
    } catch (err) {
      console.warn('Could not enable notifications', err)
      return 'failed'
    }
  })
}

/** Drop this phone’s subscription while the user is still signed in. */
export async function forgetDevicePush() {
  if (!supabase || !('serviceWorker' in navigator)) return
  try {
    const reg = await navigator.serviceWorker.getRegistration()
    const sub = await reg?.pushManager.getSubscription()
    if (!sub) return
    await supabase.rpc('delete_push_subscription', { p_endpoint: sub.endpoint })
    await sub.unsubscribe()
  } catch (err) {
    console.warn('Could not remove push subscription', err)
  }
}

async function notifyShareOnce(shareId: string): Promise<NotifyDelivery> {
  if (!supabase) return 'failed'
  try {
    const { data, error } = await supabase.functions.invoke('notify-share', { body: { shareId } })
    if (error) return 'failed'
    const sent = Number((data as { sent?: number } | null)?.sent ?? 0)
    return sent > 0 ? 'sent' : 'no-device'
  } catch {
    return 'failed'
  }
}

export async function notifyShare(shareId: string): Promise<NotifyDelivery> {
  let last: NotifyDelivery = 'failed'
  for (let attempt = 0; attempt < 2; attempt++) {
    last = await notifyShareOnce(shareId)
    if (last !== 'failed') return last
  }
  return last
}
