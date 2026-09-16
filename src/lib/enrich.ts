import type { WordEnrichment } from '../types'

type DefinitionCandidate = {
  word: string
  pos: string
  definition: string
  examples: string[]
  phonetic: string
  synonyms: string[]
  score: number
  source: string
}

const POS_PRIORITY: Record<string, number> = {
  adjective: 0,
  verb: 1,
  adverb: 2,
  noun: 3,
  interjection: 4,
}

function cleanHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function articleFor(word: string): 'a' | 'an' {
  return /^[aeiou]/i.test(word) ? 'an' : 'a'
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function cleanSentence(text: string, word: string): string {
  let s = cleanHtml(text).trim().replace(/\s+/g, ' ')
  if (!s) return s
  s = s.charAt(0).toUpperCase() + s.slice(1)
  if (!/[.!?]$/.test(s)) s += '.'
  if (word && !new RegExp(`\\b${escapeRegExp(word)}\\b`, 'i').test(s)) {
    return s
  }
  return s
}

function scoreDefinition(pos: string, defText: string, hasExample: boolean): number {
  let score = 10 - (POS_PRIORITY[pos] ?? 5)
  if (hasExample) score += 3
  const length = defText.length
  if (length > 12 && length < 160) score += 2

  if (
    /\b(person|people|someone|ability|character|feeling|emotion|situation|difficult|idea|speak|clear|effective|manner)\b/i.test(
      defText,
    )
  ) {
    score += 4
  }

  if (/subkingdom|taxonomy|anatomy|zoology|obsolete|geometry|physics|biology/i.test(defText)) {
    score -= 6
  }
  if (/^\(?of objects|substance|material|elastic|shape after force/i.test(defText)) {
    score -= 5
  }
  return score
}

function pickBest(candidates: DefinitionCandidate[]): DefinitionCandidate | null {
  if (candidates.length === 0) return null
  return [...candidates].sort((a, b) => b.score - a.score)[0]
}

async function fetchWithTimeout(url: string, ms: number): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  try {
    return await fetch(url, {
      signal: controller.signal,
      mode: 'cors',
      headers: { Accept: 'application/json' },
    })
  } finally {
    clearTimeout(timer)
  }
}

/** Wiktionary REST — works in the browser and covers slang / modern words */
async function fetchWiktionary(word: string): Promise<DefinitionCandidate | null> {
  try {
    const slug = word.trim().replace(/\s+/g, '_')
    const url = `https://en.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(slug)}`
    const res = await fetchWithTimeout(url, 5000)
    if (!res.ok) return null
    const data = (await res.json()) as {
      en?: {
        partOfSpeech: string
        definitions?: {
          definition?: string
          examples?: string[]
          parsedExamples?: { example?: string }[]
        }[]
      }[]
    }
    const en = data?.en
    if (!Array.isArray(en) || en.length === 0) return null

    const candidates: DefinitionCandidate[] = []
    const allExamples: string[] = []

    for (const item of en) {
      const pos = (item.partOfSpeech || 'noun').toLowerCase()
      for (const defObj of item.definitions ?? []) {
        const rawDef = cleanHtml(defObj.definition || '')
        if (rawDef && rawDef.length > 3) {
          const exList: string[] = []
          if (Array.isArray(defObj.examples)) {
            for (const ex of defObj.examples) {
              const cleaned = cleanSentence(ex, word)
              if (cleaned && cleaned.length > 8) exList.push(cleaned)
            }
          }
          if (Array.isArray(defObj.parsedExamples)) {
            for (const pe of defObj.parsedExamples) {
              if (pe.example) {
                const cleaned = cleanSentence(pe.example, word)
                if (cleaned && cleaned.length > 8 && !exList.includes(cleaned)) {
                  exList.push(cleaned)
                }
              }
            }
          }
          exList.forEach((e) => {
            if (!allExamples.includes(e)) allExamples.push(e)
          })

          candidates.push({
            word,
            pos,
            definition: rawDef,
            examples: exList,
            phonetic: '',
            synonyms: [],
            score: scoreDefinition(pos, rawDef, exList.length > 0) + 2,
            source: 'Wiktionary',
          })
        }
      }
    }

    const best = pickBest(candidates)
    if (!best) return null
    const mergedExamples = [...best.examples, ...allExamples].slice(0, 2)
    return { ...best, examples: mergedExamples }
  } catch {
    return null
  }
}

/** Datamuse — reliable CORS JSON fallback with pronunciation tags */
async function fetchDatamuse(word: string): Promise<DefinitionCandidate | null> {
  try {
    const url = `https://api.datamuse.com/words?sp=${encodeURIComponent(word)}&md=d,p,r&max=1`
    const res = await fetchWithTimeout(url, 4000)
    if (!res.ok) return null
    const data = (await res.json()) as {
      word?: string
      defs?: string[]
      tags?: string[]
    }[]
    if (!Array.isArray(data) || data.length === 0) return null
    const item = data[0]
    const defs = item.defs ?? []
    if (defs.length === 0) return null

    const firstDefLine = defs[0]
    const [posCode, ...defParts] = firstDefLine.split('\t')
    const posMap: Record<string, string> = {
      n: 'noun',
      v: 'verb',
      adj: 'adjective',
      adv: 'adverb',
      u: 'interjection',
    }
    const pos = posMap[posCode] || 'noun'
    const def = defParts.join(' ').trim()
    if (!def) return null
    const pronTag = (item.tags ?? []).find((t) => t.startsWith('pron:'))
    const phonetic = pronTag ? `/${pronTag.replace(/^pron:/, '').trim()}/` : ''

    return {
      word: item.word || word,
      pos,
      definition: def,
      examples: [],
      phonetic,
      synonyms: [],
      score: scoreDefinition(pos, def, false),
      source: 'Datamuse',
    }
  } catch {
    return null
  }
}

async function fetchWikipedia(word: string): Promise<DefinitionCandidate | null> {
  try {
    const slug = word.trim().replace(/\s+/g, '_')
    const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(slug)}`
    const res = await fetchWithTimeout(url, 4000)
    if (!res.ok) return null
    const data = (await res.json()) as {
      type?: string
      title?: string
      description?: string
      extract?: string
    }
    if (data.type === 'disambiguation' || !data.extract) return null
    const def = data.description || `${data.extract.split('.')[0]}.`
    return {
      word: data.title || word,
      pos: 'noun',
      definition: def,
      examples: [],
      phonetic: '',
      synonyms: [],
      score: 3,
      source: 'Wikipedia',
    }
  } catch {
    return null
  }
}

async function translateToHindi(text: string): Promise<string> {
  if (!text || !text.trim()) return ''

  try {
    const mUrl = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text.slice(0, 450))}&langpair=en|hi`
    const mRes = await fetchWithTimeout(mUrl, 3500)
    if (mRes.ok) {
      const mData = (await mRes.json()) as {
        responseData?: { translatedText?: string }
      }
      const t = mData?.responseData?.translatedText?.trim()
      if (t && !/INVALID|QUERY LENGTH|MYMEMORY WARNING/i.test(t)) {
        return t
      }
    }
  } catch {}

  try {
    const gUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=hi&dt=t&q=${encodeURIComponent(text.slice(0, 450))}`
    const gRes = await fetchWithTimeout(gUrl, 1500)
    if (gRes.ok) {
      const contentType = gRes.headers.get('content-type') || ''
      if (contentType.includes('json') || contentType.includes('javascript')) {
        const gData = (await gRes.json()) as unknown[]
        const firstBlock = gData?.[0] as unknown[]
        const translated = (firstBlock?.[0] as string[])?.[0]?.trim()
        if (translated) return translated
      }
    }
  } catch {}

  return ''
}

function craftExamples(
  word: string,
  pos: string,
  meaning: string,
  synonyms: string[] = [],
): [string, string] {
  const w = word.toLowerCase()
  const art = articleFor(w)
  const syn = synonyms[0]
  const shortMeaning = meaning
    .replace(/^\([^)]*\)\s*/, '')
    .replace(/\.$/, '')
    .trim()
    .toLowerCase()

  const byPos: Record<string, [string, string]> = {
    adjective: [
      `She stayed ${w} during the tough discussion and explained her point calmly.`,
      `If you want to sound more ${w} in English, practice using the word in real conversations.`,
    ],
    verb: [
      `Could you ${w} that idea once more so everyone is clear on the plan?`,
      `He tried to ${w} his thoughts carefully before speaking in the meeting.`,
    ],
    adverb: [
      `She explained the update ${w}, and the whole team understood immediately.`,
      `If you speak ${w}, people follow your message with less effort.`,
    ],
    noun: [
      `That ${w} helped him express himself more confidently in English.`,
      `Noticing ${art} useful ${w} in daily conversation is a great way to grow your vocabulary.`,
    ],
  }

  const crafted =
    byPos[pos] ??
    ([
      `You can use “${word}” when you mean something like “${shortMeaning}”.`,
      syn
        ? `A natural spoken line: “Her point was ${w} — some people might say ${syn}.”`
        : `Try using “${word}” once today so the meaning stays fresh when you speak.`,
    ] as [string, string])

  return [cleanSentence(crafted[0], word), cleanSentence(crafted[1], word)]
}

function ensureTwoExamples(
  word: string,
  pos: string,
  meaning: string,
  synonyms: string[],
  fromDict: string[] = [],
): [string, string] {
  const crafted = craftExamples(word, pos, meaning, synonyms)
  const merged = [...fromDict, ...crafted]
  const unique: string[] = []
  for (const ex of merged) {
    const cleaned = cleanSentence(ex, word)
    if (!cleaned) continue
    if (!unique.some((u) => u.toLowerCase() === cleaned.toLowerCase())) {
      unique.push(cleaned)
    }
  }
  while (unique.length < 2) {
    unique.push(crafted[unique.length] ?? crafted[0])
  }
  return [unique[0], unique[1]]
}

/**
 * Look up a word using Wiktionary, Datamuse, and Wikipedia in parallel.
 * Does not depend on api.dictionaryapi.dev, which is often unreachable.
 */
export async function enrichWord(rawWord: string): Promise<WordEnrichment> {
  const trimmed = rawWord.trim()
  if (!trimmed) throw new Error('Enter a word first.')

  const normalizedKey = trimmed.toLowerCase()

  const [wiktionary, datamuse, wikipedia] = await Promise.all([
    fetchWiktionary(normalizedKey),
    fetchDatamuse(normalizedKey),
    fetchWikipedia(trimmed),
  ])

  let candidate = pickBest(
    [wiktionary, datamuse, wikipedia].filter((c): c is DefinitionCandidate => Boolean(c)),
  )

  if (!candidate && trimmed !== normalizedKey) {
    candidate = pickBest(
      (await Promise.all([fetchWiktionary(trimmed), fetchWikipedia(trimmed)])).filter(
        (c): c is DefinitionCandidate => Boolean(c),
      ),
    )
  }

  if (!candidate) {
    throw new Error(
      `Couldn’t find “${trimmed}” in online dictionaries. Check the spelling or enter details manually.`,
    )
  }

  const phonetic = candidate.phonetic || datamuse?.phonetic || ''

  const examples = ensureTwoExamples(
    candidate.word,
    candidate.pos,
    candidate.definition,
    candidate.synonyms,
    candidate.examples,
  )

  let meaningHi = ''
  try {
    const [wordHi, defHi] = await Promise.all([
      translateToHindi(candidate.word),
      translateToHindi(candidate.definition),
    ])
    if (wordHi && defHi && wordHi.toLowerCase() !== defHi.toLowerCase()) {
      meaningHi = `${wordHi} — ${defHi}`
    } else {
      meaningHi = defHi || wordHi || ''
    }
  } catch {}

  if (!meaningHi) {
    meaningHi = 'हिंदी अर्थ अभी उपलब्ध नहीं है'
  }

  return {
    word: candidate.word || trimmed,
    meaning: candidate.definition,
    meaningHi,
    examples,
    phonetic,
    partOfSpeech: candidate.pos,
  }
}
