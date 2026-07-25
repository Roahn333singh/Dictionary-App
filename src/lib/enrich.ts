import type { WordEnrichment } from '../types'

type DictDefinition = {
  definition: string
  example?: string
  synonyms?: string[]
}

type DictMeaning = {
  partOfSpeech: string
  definitions: DictDefinition[]
  synonyms?: string[]
}

type DictEntry = {
  word: string
  phonetic?: string
  phonetics?: { text?: string; audio?: string }[]
  meanings: DictMeaning[]
}

const POS_PRIORITY: Record<string, number> = {
  adjective: 0,
  verb: 1,
  adverb: 2,
  noun: 3,
  interjection: 4,
}

function articleFor(word: string): 'a' | 'an' {
  return /^[aeiou]/i.test(word) ? 'an' : 'a'
}

function cleanSentence(text: string, word: string): string {
  let s = text.trim().replace(/\s+/g, ' ')
  if (!s) return s
  s = s.charAt(0).toUpperCase() + s.slice(1)
  if (!/[.!?]$/.test(s)) s += '.'
  // Prefer full-word mention; keep as-is otherwise
  if (!new RegExp(`\\b${escapeRegExp(word)}\\b`, 'i').test(s)) {
    return s
  }
  return s
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function pickPhonetic(entry: DictEntry): string {
  if (entry.phonetic) return entry.phonetic
  const withText = entry.phonetics?.find((p) => p.text)
  return withText?.text ?? ''
}

function scoreDefinition(pos: string, def: DictDefinition): number {
  let score = 10 - (POS_PRIORITY[pos] ?? 5)
  if (def.example) score += 3
  const text = def.definition
  const length = text.length
  if (length > 12 && length < 160) score += 2

  // Prefer senses useful for speaking / people / situations
  if (
    /\b(person|people|someone|ability|character|feeling|emotion|situation|difficult|idea|speak|clear|effective|manner)\b/i.test(
      text,
    )
  ) {
    score += 4
  }

  // Downrank niche / physical / scientific senses
  if (
    /subkingdom|taxonomy|anatomy|zoology|obsolete|geometry|physics|biology/i.test(
      text,
    )
  ) {
    score -= 6
  }
  if (/^\(?of objects|substance|material|elastic|shape after force/i.test(text)) {
    score -= 5
  }
  return score
}

function pickBestSense(entries: DictEntry[]): {
  pos: string
  definition: string
  examples: string[]
  synonyms: string[]
} {
  const candidates: {
    pos: string
    definition: string
    example?: string
    synonyms: string[]
    score: number
  }[] = []

  for (const entry of entries) {
    for (const meaning of entry.meanings ?? []) {
      const pos = (meaning.partOfSpeech || 'noun').toLowerCase()
      for (const def of meaning.definitions ?? []) {
        candidates.push({
          pos,
          definition: def.definition,
          example: def.example,
          synonyms: [
            ...(meaning.synonyms ?? []),
            ...(def.synonyms ?? []),
          ].slice(0, 6),
          score: scoreDefinition(pos, def),
        })
      }
    }
  }

  candidates.sort((a, b) => b.score - a.score)
  const best = candidates[0]
  if (!best) {
    throw new Error('No definition found for this word.')
  }

  const word = entries[0]?.word ?? ''
  // Prefer the winning definition's own example; avoid mixing other senses
  const unique: string[] = []
  if (best.example) {
    unique.push(cleanSentence(best.example, word))
  }

  return {
    pos: best.pos,
    definition: best.definition.replace(/\s+/g, ' ').trim(),
    examples: unique,
    synonyms: best.synonyms,
  }
}

async function translateToHindi(text: string): Promise<string> {
  const url =
    'https://api.mymemory.translated.net/get?q=' +
    encodeURIComponent(text) +
    '&langpair=en|hi'

  const res = await fetch(url)
  if (!res.ok) throw new Error('Translation failed')
  const data = (await res.json()) as {
    responseData?: { translatedText?: string }
    responseStatus?: number
  }
  if (data.responseStatus && data.responseStatus !== 200) {
    throw new Error('Translation unavailable')
  }
  const translated = data.responseData?.translatedText?.trim() ?? ''
  // MyMemory sometimes echoes INVALID or QUOTA messages
  if (!translated || /INVALID|QUERY LENGTH|MYMEMORY WARNING/i.test(translated)) {
    throw new Error('Translation unavailable')
  }
  return translated
}

function craftExamples(
  word: string,
  pos: string,
  meaning: string,
  synonyms: string[],
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
      `You can use “${word}” when you mean something like “${shortMeaning}".`,
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
  fromDict: string[],
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

export async function enrichWord(rawWord: string): Promise<WordEnrichment> {
  const word = rawWord.trim().toLowerCase()
  if (!word) throw new Error('Enter a word first.')
  if (!/^[a-z][a-z\s'-]*$/i.test(word)) {
    throw new Error('Use English letters only for lookup.')
  }

  const dictUrl = `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`
  const dictRes = await fetch(dictUrl)

  if (dictRes.status === 404) {
    throw new Error(`Couldn’t find “${word}”. Check the spelling and try again.`)
  }
  if (!dictRes.ok) {
    throw new Error('Dictionary lookup failed. Please try again.')
  }

  const entries = (await dictRes.json()) as DictEntry[]
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error(`Couldn’t find “${word}”.`)
  }

  const sense = pickBestSense(entries)
  const phonetic = pickPhonetic(entries[0])
  const examples = ensureTwoExamples(
    word,
    sense.pos,
    sense.definition,
    sense.synonyms,
    sense.examples,
  )

  let meaningHi = ''
  try {
    const [wordHi, defHi] = await Promise.all([
      translateToHindi(word),
      translateToHindi(sense.definition),
    ])
    meaningHi =
      wordHi.toLowerCase() === defHi.toLowerCase()
        ? defHi
        : `${wordHi} — ${defHi}`
  } catch {
    meaningHi = 'हिंदी अर्थ अभी उपलब्ध नहीं है'
  }

  return {
    word: entries[0].word || word,
    meaning: sense.definition,
    meaningHi,
    examples,
    phonetic,
    partOfSpeech: sense.pos,
  }
}
