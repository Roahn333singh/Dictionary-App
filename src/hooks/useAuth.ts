import { useSyncExternalStore } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

type AuthState = {
  session: Session | null
  loading: boolean
}

let state: AuthState = { session: null, loading: Boolean(supabase) }
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

const NAME_PATTERN = /^[a-z0-9][a-z0-9._-]{1,23}$/

export function normalizeName(raw: string) {
  return raw.trim().toLowerCase().replace(/\s+/g, '.')
}

function nameToEmail(name: string) {
  return `${name}@users.retain.app`
}

function friendlyAuthError(message: string): string {
  if (/invalid login credentials/i.test(message)) return 'Wrong name or password.'
  if (/already registered|already exists/i.test(message)) return 'That name is already taken. Try signing in instead.'
  if (/email not confirmed/i.test(message)) {
    return 'Account created, but Supabase still requires email confirmation. Turn off “Confirm email” in Supabase → Authentication → Sign In / Providers → Email.'
  }
  if (/password/i.test(message) && /least|short|characters/i.test(message)) return 'Password must be at least 6 characters.'
  if (/signups not allowed|signup is disabled/i.test(message)) return 'New accounts are turned off for this app.'
  return message
}

function validate(rawName: string, password: string) {
  const name = normalizeName(rawName)
  if (!NAME_PATTERN.test(name)) {
    throw new Error('Name must be 2–24 letters or numbers (dots, dashes and underscores allowed).')
  }
  if (password.length < 6) throw new Error('Password must be at least 6 characters.')
  return name
}

export async function signInWithName(rawName: string, password: string) {
  if (!supabase) throw new Error('Supabase is not configured')
  const name = validate(rawName, password)
  const { error } = await supabase.auth.signInWithPassword({ email: nameToEmail(name), password })
  if (error) throw new Error(friendlyAuthError(error.message))
}

export async function createAccount(rawName: string, password: string) {
  if (!supabase) throw new Error('Supabase is not configured')
  const name = validate(rawName, password)
  const { data, error } = await supabase.auth.signUp({
    email: nameToEmail(name),
    password,
    options: { data: { display_name: name } },
  })
  if (error) throw new Error(friendlyAuthError(error.message))
  if (!data.session) {
    throw new Error(
      'Account created, but Supabase still requires email confirmation. Turn off “Confirm email” in Supabase → Authentication → Sign In / Providers → Email, then sign in.',
    )
  }
}

export async function signOut() {
  if (!supabase) return
  await supabase.auth.signOut()
}
