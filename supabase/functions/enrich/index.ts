// Supabase Edge Function: looks up a word with Gemini and caches the result.
// Deploy: npx supabase functions deploy enrich
// Secret: npx supabase secrets set GEMINI_API_KEY=your-key

import { createClient } from 'npm:@supabase/supabase-js@2'

const CACHE_VERSION = 1

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

type Enrichment = {
  found: boolean
  word: string
  partOfSpeech: string
  phonetic: string
  meaning: string
  meaningHi: string
  examples: string[]
}

const responseSchema = {
  type: 'OBJECT',
  properties: {
    found: { type: 'BOOLEAN' },
    word: { type: 'STRING' },
    partOfSpeech: { type: 'STRING' },
    phonetic: { type: 'STRING' },
    meaning: { type: 'STRING' },
    meaningHi: { type: 'STRING' },
    examples: { type: 'ARRAY', items: { type: 'STRING' } },
  },
  required: ['found', 'word', 'partOfSpeech', 'phonetic', 'meaning', 'meaningHi', 'examples'],
}

function buildPrompt(word: string): string {
  return `You are a precise English–Hindi dictionary for an Indian learner who wants to use English words while speaking.

Look up: "${word}"

Return JSON with:
- found: false only if this is not a real English word, phrase, idiom, or common slang (and cannot be fixed as an obvious typo).
- word: the correctly spelled word or phrase (fix obvious typos, keep the user's form otherwise, lowercase unless it is a proper noun).
- partOfSpeech: one of adjective, verb, noun, adverb, phrase, idiom, interjection — for the most common everyday sense.
- phonetic: IPA pronunciation like /ˈwɜːd/.
- meaning: the most common everyday meaning in simple, clear English, one sentence, max 25 words. No examples here.
- meaningHi: accurate Hindi in Devanagari, formatted as "<1–3 common Hindi equivalents separated by commas> — <short Hindi explanation>". Use natural, everyday Hindi that matches the same sense as the English meaning; never transliterate the English word.
- examples: exactly 2 natural, everyday English sentences using the word in that sense, 8–20 words each, as spoken in real conversation.`
}

function sanitize(raw: Enrichment, fallbackWord: string): Enrichment {
  const examples = (Array.isArray(raw.examples) ? raw.examples : [])
    .map((e) => String(e).trim())
    .filter(Boolean)
    .slice(0, 2)
  return {
    found: Boolean(raw.found) && Boolean(String(raw.meaning ?? '').trim()),
    word: String(raw.word || fallbackWord).trim(),
    partOfSpeech: String(raw.partOfSpeech || '').trim().toLowerCase(),
    phonetic: String(raw.phonetic || '').trim(),
    meaning: String(raw.meaning || '').trim(),
    meaningHi: String(raw.meaningHi || '').trim(),
    examples,
  }
}

async function askGemini(word: string, apiKey: string): Promise<Enrichment> {
  const models = [Deno.env.get('GEMINI_MODEL'), 'gemini-flash-latest', 'gemini-2.5-flash'].filter(
    (m, i, all): m is string => Boolean(m) && all.indexOf(m) === i,
  )

  let lastError = 'Gemini request failed'
  for (const model of models) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: buildPrompt(word) }] }],
            generationConfig: {
              temperature: 0.2,
              responseMimeType: 'application/json',
              responseSchema,
            },
          }),
          signal: AbortSignal.timeout(15000),
        },
      )
      if (!res.ok) {
        lastError = `${model}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`
        continue
      }
      const data = await res.json()
      const text: string | undefined = data?.candidates?.[0]?.content?.parts
        ?.map((p: { text?: string }) => p.text ?? '')
        .join('')
      if (!text) {
        lastError = `${model}: empty response`
        continue
      }
      return sanitize(JSON.parse(text) as Enrichment, word)
    } catch (err) {
      lastError = `${model}: ${err instanceof Error ? err.message : String(err)}`
    }
  }
  throw new Error(lastError)
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const geminiKey = Deno.env.get('GEMINI_API_KEY')
  if (!geminiKey) return json({ error: 'GEMINI_API_KEY is not set' }, 500)

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  const { data: userData, error: userError } = await admin.auth.getUser(token)
  if (userError || !userData?.user) return json({ error: 'Sign in required' }, 401)

  let word = ''
  try {
    const body = await req.json()
    word = String(body?.word ?? '').trim().replace(/\s+/g, ' ')
  } catch {
    return json({ error: 'Invalid body' }, 400)
  }
  if (!word || word.length > 60) return json({ error: 'Enter a word (max 60 characters)' }, 400)

  const key = `v${CACHE_VERSION}:${word.toLowerCase()}`

  const { data: cached } = await admin.from('word_cache').select('data').eq('word', key).maybeSingle()
  if (cached?.data) return json({ ...(cached.data as Enrichment), cached: true })

  try {
    const result = await askGemini(word, geminiKey)
    if (result.found && result.examples.length >= 1) {
      await admin.from('word_cache').upsert({ word: key, data: result })
    }
    return json(result)
  } catch (err) {
    console.error(err)
    return json({ error: 'Lookup service unavailable' }, 502)
  }
})
