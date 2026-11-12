// Sends a custom Retain announcement to every subscribed phone.
// Only the owner can call this: the request must carry the ANNOUNCE_SECRET
// in the x-announce-secret header. Normal signed-in users cannot broadcast.
// Deploy: npx supabase functions deploy announce --no-verify-jwt
// Secret:  npx supabase secrets set ANNOUNCE_SECRET=<secret>

import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-announce-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
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

function clip(value: unknown, max: number) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : ''
}

function pushLib(): WebPush {
  const mod = webpush as WebPush & { default?: WebPush }
  return mod.default ?? mod
}

function sameSecret(given: string, expected: string) {
  if (!given || given.length !== expected.length) return false
  let diff = 0
  for (let i = 0; i < expected.length; i++) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i)
  return diff === 0
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const secret = Deno.env.get('ANNOUNCE_SECRET')
  if (!secret) return json({ error: 'ANNOUNCE_SECRET is not set' }, 500)
  if (!sameSecret(req.headers.get('x-announce-secret') ?? '', secret)) {
    return json({ error: 'Not allowed' }, 403)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const vapidPublic = Deno.env.get('VAPID_PUBLIC_KEY')
  const vapidPrivate = Deno.env.get('VAPID_PRIVATE_KEY')
  const vapidSubject = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:retain@users.retain.app'
  if (!supabaseUrl || !serviceKey) return json({ error: 'Supabase is not configured' }, 500)
  if (!vapidPublic || !vapidPrivate) return json({ error: 'VAPID keys are not set' }, 500)

  let title = ''
  let body = ''
  let url = '/'
  try {
    const input = await req.json()
    title = clip(input?.title, 60)
    body = clip(input?.body, 180)
    const rawUrl = clip(input?.url, 80)
    url = rawUrl.startsWith('/') && !rawUrl.startsWith('//') ? rawUrl : '/'
  } catch {
    return json({ error: 'Invalid body' }, 400)
  }
  if (!title || !body) return json({ error: 'Give a title and a message' }, 400)

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })
  const { data: subs, error } = await admin
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .limit(500)
  if (error) {
    if (error.code === '42P01' || error.code === 'PGRST205') return json({ sent: 0, devices: 0 })
    return json({ error: 'Could not load devices' }, 500)
  }

  const devices = (subs ?? []) as SubscriptionRow[]
  const payload = JSON.stringify({
    title,
    body,
    url,
    tag: `retain-announce-${Date.now()}`,
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
          console.error('announce push failed', status ?? err)
        }
      }
    }),
  )

  return json({ sent, devices: devices.length })
})
