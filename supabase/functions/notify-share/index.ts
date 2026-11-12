// Tells a friend's phone that a word was shared.
// Deploy: npx supabase functions deploy notify-share --no-verify-jwt
// Secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT

import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

type ShareRow = {
  id: string
  from_user: string
  to_user: string
  word: string
  note: string | null
  status: string
}

type SubscriptionRow = {
  endpoint: string
  p256dh: string
  auth: string
}

type WebPush = {
  setVapidDetails: (subject: string, publicKey: string, privateKey: string) => void
  sendNotification: (
    subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
    payload: string,
  ) => Promise<unknown>
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function clip(value: string, max: number) {
  return value.replace(/\s+/g, ' ').trim().slice(0, max)
}

function pushLib(): WebPush {
  const mod = webpush as WebPush & { default?: WebPush }
  return mod.default ?? mod
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const vapidPublic = Deno.env.get('VAPID_PUBLIC_KEY')
  const vapidPrivate = Deno.env.get('VAPID_PRIVATE_KEY')
  const vapidSubject = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:retain@users.retain.app'
  if (!supabaseUrl || !serviceKey) return json({ error: 'Supabase is not configured' }, 500)
  if (!vapidPublic || !vapidPrivate) return json({ error: 'VAPID keys are not set' }, 500)

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  const { data: userData, error: userError } = await admin.auth.getUser(token)
  if (userError || !userData?.user) return json({ error: 'Sign in required' }, 401)

  let shareId = ''
  try {
    const body = await req.json()
    shareId = String(body?.shareId ?? '').trim()
  } catch {
    return json({ error: 'Invalid body' }, 400)
  }
  if (!/^[0-9a-f-]{36}$/i.test(shareId)) return json({ error: 'Missing share' }, 400)

  const { data: share, error: shareError } = await admin
    .from('shares')
    .select('id, from_user, to_user, word, note, status')
    .eq('id', shareId)
    .maybeSingle()
  if (shareError) return json({ error: 'Could not load the share' }, 500)
  const row = share as ShareRow | null
  if (!row || row.from_user !== userData.user.id || row.status !== 'pending') {
    return json({ error: 'That share cannot be announced' }, 403)
  }

  const [{ data: profile }, { count }, { data: subs, error: subsError }] = await Promise.all([
    admin.from('profiles').select('name').eq('user_id', row.from_user).maybeSingle(),
    admin
      .from('shares')
      .select('id', { count: 'exact', head: true })
      .eq('to_user', row.to_user)
      .eq('status', 'pending'),
    admin.from('push_subscriptions').select('endpoint, p256dh, auth').eq('user_id', row.to_user),
  ])
  if (subsError) {
    if (subsError.code === '42P01' || subsError.code === 'PGRST205') return json({ sent: 0 })
    return json({ error: 'Could not load devices' }, 500)
  }

  const devices = (subs ?? []) as SubscriptionRow[]
  if (devices.length === 0) return json({ sent: 0 })

  const name = clip(String((profile as { name?: string } | null)?.name ?? ''), 40) || 'A friend'
  // Never put the word itself in the notification — it stays a surprise
  // until the recipient scratches the card in their Inbox.
  const note = clip(row.note ?? '', 120)
  const badgeCount = Math.max(1, Math.min(99, count ?? 1))
  const payload = JSON.stringify({
    title: `${name} sent you a word`,
    body: note || 'A new word is waiting. Scratch to reveal it in your Inbox.',
    badgeCount,
    url: '/inbox',
    tag: row.id,
  })

  const wp = pushLib()
  wp.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate)

  let sent = 0
  await Promise.all(
    devices.map(async (device) => {
      try {
        await wp.sendNotification(
          { endpoint: device.endpoint, keys: { p256dh: device.p256dh, auth: device.auth } },
          payload,
        )
        sent += 1
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode
        if (status === 404 || status === 410) {
          await admin.from('push_subscriptions').delete().eq('endpoint', device.endpoint)
        } else {
          console.error('push failed', status ?? err)
        }
      }
    }),
  )

  return json({ sent })
})
