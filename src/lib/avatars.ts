export type AvatarGender = 'boy' | 'girl'

export type AvatarOption = {
  id: string
  gender: AvatarGender
  src: string
  label: string
}

const BOY_LABELS = [
  'Wavy cool',
  'Curls + glasses',
  'Fade hoodie',
  'Headphones',
  'Clean cut',
  'Beanie',
  'Soft smile',
  'Undercut',
  'Neat wave',
  'Soft wrap',
  'Round glasses',
  'Buzz',
  'Afro curls',
  'Dyed tips',
  'Big cans',
  'Jacket smile',
]

const GIRL_LABELS = [
  'Bob clips',
  'Long waves',
  'Bun glasses',
  'Curtain bangs',
  'Braids',
  'High pony',
  'Fringe hoodie',
  'Pixie',
  'Long dark',
  'Modern hijab',
  'Braid glasses',
  'Shoulder waves',
  'Space buns',
  'Headband',
  'Denim vibe',
  'Soft earrings',
]

function buildSet(gender: AvatarGender, set: 1 | 2, labels: string[], labelOffset: number): AvatarOption[] {
  return Array.from({ length: 8 }, (_, i) => {
    const n = i + 1
    return {
      id: `${gender}-${set}-${n}`,
      gender,
      src: `/avatars/${gender}-${set}-${n}.png`,
      label: labels[labelOffset + i] ?? `${gender} ${n}`,
    }
  })
}

export const AVATARS: AvatarOption[] = [
  ...buildSet('boy', 1, BOY_LABELS, 0),
  ...buildSet('boy', 2, BOY_LABELS, 8),
  ...buildSet('girl', 1, GIRL_LABELS, 0),
  ...buildSet('girl', 2, GIRL_LABELS, 8),
]

export const DEFAULT_AVATAR_ID = 'boy-1-1'

const byId = new Map(AVATARS.map((a) => [a.id, a]))

export function isAvatarId(value: string | null | undefined): value is string {
  return Boolean(value && byId.has(value))
}

export function getAvatar(id: string | null | undefined): AvatarOption {
  if (id && byId.has(id)) return byId.get(id)!
  return byId.get(DEFAULT_AVATAR_ID)!
}

export function avatarsByGender(gender: AvatarGender): AvatarOption[] {
  return AVATARS.filter((a) => a.gender === gender)
}

/** Last chosen face for one account. `pending` means the server has not confirmed it yet. */
export type AvatarCache = {
  id: string
  savedAt: number
  pending: boolean
}

const AVATAR_CACHE_PREFIX = 'retain-avatar-id'

function cacheKey(userId: string) {
  return `${AVATAR_CACHE_PREFIX}:${userId}`
}

function parseAvatarCache(raw: string | null): AvatarCache | null {
  if (!raw) return null
  try {
    if (raw.startsWith('{')) {
      const parsed = JSON.parse(raw) as { id?: unknown; savedAt?: unknown; pending?: unknown }
      const id = typeof parsed.id === 'string' ? parsed.id : null
      if (isAvatarId(id)) {
        return {
          id,
          savedAt: typeof parsed.savedAt === 'number' ? parsed.savedAt : 0,
          pending: Boolean(parsed.pending),
        }
      }
      return null
    }
  } catch {
    // Older builds stored the bare id.
  }
  return isAvatarId(raw) ? { id: raw, savedAt: 0, pending: false } : null
}

export function readAvatarCache(userId: string): AvatarCache | null {
  try {
    return parseAvatarCache(localStorage.getItem(cacheKey(userId)))
  } catch {
    return null
  }
}

export function writeAvatarCache(userId: string, cache: AvatarCache) {
  if (!isAvatarId(cache.id)) return
  const payload = JSON.stringify(cache)
  try {
    localStorage.setItem(cacheKey(userId), payload)
    localStorage.setItem(`${AVATAR_CACHE_PREFIX}:last`, JSON.stringify({ ...cache, userId }))
  } catch {
    // private mode / quota
  }
}

/** User id from the persisted Supabase session, available before `getSession()` resolves. */
export function cachedUserId(): string | null {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key?.startsWith('sb-') || !key.endsWith('-auth-token')) continue
      const parsed = JSON.parse(localStorage.getItem(key) || 'null') as { user?: { id?: unknown } } | null
      const id = parsed?.user?.id
      if (typeof id === 'string' && id) return id
    }
  } catch {
    // ignore
  }
  return null
}

/** Face to paint on the first frame, before auth or the profile request returns. */
export function readBootAvatarId(): string | null {
  const uid = cachedUserId()
  const local = uid ? readAvatarCache(uid) : null
  if (local) return local.id
  try {
    const raw = localStorage.getItem(`${AVATAR_CACHE_PREFIX}:last`)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { id?: unknown; userId?: unknown }
    const id = typeof parsed.id === 'string' ? parsed.id : null
    if (!isAvatarId(id)) return null
    if (uid && parsed.userId && parsed.userId !== uid) return null
    return id
  } catch {
    return null
  }
}

/**
 * Pick the face to show.
 * A just-saved (pending) id wins over a stale response.
 * An empty, invalid, or default server id never clears a cached custom face.
 * A different non-default id from the server is an explicit newer choice.
 */
export function reconcileAvatar(local: AvatarCache | null, serverId: string | null | undefined): string {
  const server = isAvatarId(serverId) ? serverId : null
  const cached = local && isAvatarId(local.id) ? local : null
  if (cached?.pending) return cached.id
  if (server && server !== DEFAULT_AVATAR_ID && server !== cached?.id) return server
  if (cached) return cached.id
  if (server) return server
  return DEFAULT_AVATAR_ID
}
