/** One tile per letter occurrence, plus decoys on shorter words. */
export function buildLetterWheel(answer: string, seed: string): string[] {
  let hash = 2166136261
  for (const character of seed) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619)
  const decoys = Array.from('ABCDEFGHIJKLMNOPQRSTUVWXYZ').filter((letter) => !answer.includes(letter))
  const letters = [...answer]
  while (letters.length < 7 && decoys.length) {
    const index = (hash >>> 0) % decoys.length
    letters.push(decoys.splice(index, 1)[0])
    hash = Math.imul(hash ^ letters.length, 16777619)
  }
  return shuffleWheel(letters, () => {
    hash = Math.imul(hash ^ (hash >>> 13), 0x5bd1e995)
    return (hash >>> 0) / 4294967296
  })
}

export function shuffleWheel(letters: string[], random = Math.random): string[] {
  const shuffled = [...letters]
  for (let index = shuffled.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1))
    ;[shuffled[index], shuffled[other]] = [shuffled[other], shuffled[index]]
  }
  if (shuffled.every((letter, index) => letter === letters[index])) {
    shuffled.push(shuffled.shift()!)
  }
  return shuffled
}
