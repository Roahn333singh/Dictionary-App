import { useSyncExternalStore } from 'react'
import type { Session } from '@supabase/supabase-js'
import { forgetDevicePush } from '../lib/push'
import { supabase } from '../lib/supabase'

type AuthState = {
  session: Session | null
  loading: boolean
}

/** Paint the signed-in shell on the first frame instead of waiting for getSession(). */
function readPersistedSession(): Session | null {
  if (typeof localStorage === 'undefined') return null
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key?.startsWith('sb-') || !key.endsWith('-auth-token')) continue
      const parsed = JSON.parse(localStorage.getItem(key) || 'null') as Session | null
      if (parsed?.user?.id && parsed.access_token) return parsed
    }
  } catch {
    // ignore corrupt storage
  }
  return null
}

const persistedSession = readPersistedSession()
let state: AuthState = {
  session: persistedSession,
  loading: Boolean(supabase) && !persistedSession,
}
const listeners = new Set<() => void>()

function set(next: AuthState) {
  state = next
  listeners.forEach((l) => l())
}

if (supabase) {
  supabase.auth.onAuthStateChange((_event, session) => {
    set({ session, loading: false })
  })
  supabase.auth
    .getSession()
    .then(({ data }) => set({ session: data.session, loading: false }))
    .catch(() => set({ session: null, loading: false }))
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function getSnapshot() {
  return state
}

export function useAuth() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{1,23}$/
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const LEGACY_EMAIL_DOMAIN = '@users.retain.app'

const USERNAME_RULE = 'Username must be 2–24 letters or numbers (dots, dashes and underscores allowed).'

export function normalizeUsername(raw: string) {
  return raw.trim().toLowerCase().replace(/\s+/g, '.')
}

export function isCompleteEmail(value: string) {
  const email = value.trim().toLowerCase()
  return email.length <= 254 && EMAIL_PATTERN.test(email)
}

/** Username shown in the app. Never the local-part of a real email address. */
export function accountUsername(user: { email?: string | null; user_metadata?: unknown } | null | undefined) {
  const meta = (user?.user_metadata ?? {}) as { display_name?: string; username?: string }
  const named = (meta.username || meta.display_name || '').trim()
  if (named) return named
  const email = (user?.email || '').toLowerCase()
  if (email.endsWith(LEGACY_EMAIL_DOMAIN)) return email.split('@')[0] || ''
  return ''
}

function friendlyAuthError(message: string): string {
  if (/invalid login credentials/i.test(message)) return 'Wrong email, username, or password.'
  if (/username_taken|profiles_username|profiles_name_key/i.test(message)) return 'That username is already taken.'
  if (/already registered|already been registered/i.test(message)) {
    return 'That email is already registered. Try signing in.'
  }
  if (/user not found/i.test(message)) return 'No account with that email or username.'
  if (/email not confirmed/i.test(message)) {
    return 'Account created, but Supabase still requires email confirmation. Turn off “Confirm email” in Supabase → Authentication → Sign In / Providers → Email.'
  }
  if (/password/i.test(message) && /least|short|weak|characters|different/i.test(message)) {
    return /different/i.test(message)
      ? 'Choose a different password than the current one.'
      : 'Password must be at least 6 characters.'
  }
  if (/signups not allowed|signup is disabled/i.test(message)) return 'New accounts are turned off for this app.'
  if (/redirect/i.test(message)) {
    return 'Reset email could not be sent because this app URL is not on the Supabase redirect allow list.'
  }
  if (/rate limit|too many/i.test(message)) return 'Too many emails were requested. Wait a little and try again.'
  if (/unable to validate email|invalid email/i.test(message)) return 'Enter a valid email address.'
  if (/auth session missing|session.*(missing|expired)|invalid.*(token|link|grant)/i.test(message)) {
    return 'This reset link is invalid or has expired. Request a new one from the sign-in screen.'
  }
  return 'Something went wrong. Please try again.'
}

function requirePassword(password: string) {
  if (password.length < 6) throw new Error('Password must be at least 6 characters.')
}

function legacyEmail(username: string) {
  return `${username}${LEGACY_EMAIL_DOMAIN}`
}

/** Exact username → that account's sign-in email. Null when nobody has it. Never a list. */
async function emailForUsername(username: string): Promise<string | null> {
  if (!supabase) throw new Error('Supabase is not configured')
  const { data, error } = await supabase.rpc('resolve_username_for_signin', { p_username: username })
  if (error) {
    // Old projects without the RPC still sign in legacy username accounts.
    if (error.code === 'PGRST202' || /could not find the function|schema cache/i.test(error.message)) {
      return legacyEmail(username)
    }
    throw new Error('Could not look up that username. Try again.')
  }
  if (typeof data === 'string' && data.includes('@')) return data.trim().toLowerCase()
  return null
}

async function emailForIdentifier(identifier: string): Promise<string> {
  const raw = identifier.trim()
  if (!raw) throw new Error('Enter your email or username.')
  if (raw.includes('@')) {
    const email = raw.toLowerCase()
    if (!isCompleteEmail(email)) throw new Error('Enter a valid email, or a username without @.')
    return email
  }
  const username = normalizeUsername(raw)
  if (!USERNAME_PATTERN.test(username)) throw new Error(USERNAME_RULE)
  const email = await emailForUsername(username)
  if (!email) throw new Error('No account with that username.')
  return email
}

export async function signIn(identifier: string, password: string) {
  if (!supabase) throw new Error('Supabase is not configured')
  requirePassword(password)
  const email = await emailForIdentifier(identifier)
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw new Error(friendlyAuthError(error.message))
}

export async function createAccount(rawEmail: string, rawUsername: string, password: string) {
  if (!supabase) throw new Error('Supabase is not configured')
  const email = rawEmail.trim().toLowerCase()
  const username = normalizeUsername(rawUsername)
  if (!isCompleteEmail(email)) throw new Error('Enter a valid email address.')
  if (email.endsWith(LEGACY_EMAIL_DOMAIN)) {
    throw new Error('Use your real email. Your username is separate from the address.')
  }
  if (!USERNAME_PATTERN.test(username)) throw new Error(USERNAME_RULE)
  requirePassword(password)

  const { data: available, error: availableError } = await supabase.rpc('username_available', {
    p_username: username,
  })
  if (availableError) throw new Error('Could not check that username. Try again.')
  if (available !== true) throw new Error('That username is already taken.')

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { display_name: username, username } },
  })
  if (error) throw new Error(friendlyAuthError(error.message))
  if (!data.session) {
    throw new Error(
      'Account created, but Supabase still requires email confirmation. Turn off “Confirm email” in Supabase → Authentication → Sign In / Providers → Email, then sign in.',
    )
  }
}

/**
 * Asks Supabase to email a recovery link to the account's real address.
 * Placeholder @users.retain.app accounts cannot receive mail; that is reported, not hidden.
 * Returns the message to show. Does not reveal a resolved address.
 */
export async function requestPasswordReset(identifier: string): Promise<string> {
  if (!supabase) throw new Error('Supabase is not configured')
  const raw = identifier.trim()
  if (!raw) throw new Error('Enter the email on the account, or the username.')

  let email: string
  if (raw.includes('@')) {
    email = raw.toLowerCase()
    if (!isCompleteEmail(email)) throw new Error('Enter a valid email address.')
  } else {
    const username = normalizeUsername(raw)
    if (!USERNAME_PATTERN.test(username)) throw new Error(USERNAME_RULE)
    const resolved = await emailForUsername(username)
    if (!resolved) throw new Error('No account with that username.')
    email = resolved
  }

  if (email.endsWith(LEGACY_EMAIL_DOMAIN)) {
    throw new Error(
      'This account has no real email yet, so a reset link can’t be delivered. Sign in with the username and password.',
    )
  }

  const redirectTo = `${window.location.origin}/reset-password`
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo })
  if (error) throw new Error(friendlyAuthError(error.message))
  return 'If that account can receive email, a reset link is on its way. It opens a page on this app where you choose a new password.'
}

export async function updatePassword(password: string) {
  if (!supabase) throw new Error('Supabase is not configured')
  requirePassword(password)
  const { error } = await supabase.auth.updateUser({ password })
  if (error) throw new Error(friendlyAuthError(error.message))
}

export async function signOut() {
  if (!supabase) return
  await forgetDevicePush()
  await supabase.auth.signOut()
}
