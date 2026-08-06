const HYPHEN_LIKE_PATTERN = /[\u2010\u2011\u2012\u2013\u2014\u2015\u2212\u30fc\uff0d\u2500\u2043\u02d7]/g
const SPACE_PATTERN = /[\s\u3000]+/g
const RECENT_PRODUCTION_NUMBER_STORAGE_KEY = 'kosu_recent_seiban_keys_v1'

export const PRODUCTION_NUMBER_CANDIDATE_LIMIT = 8

export function normalizeProductionNumber(value) {
  return String(value || '')
    .trim()
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, char => (
      String.fromCharCode(char.charCodeAt(0) - 0xfee0)
    ))
    .replace(HYPHEN_LIKE_PATTERN, '-')
    .replace(SPACE_PATTERN, '')
    .toUpperCase()
    .replace(/-+/g, '-')
}

export function createProductionNumberKey(value) {
  return normalizeProductionNumber(value)
}

export function isSimilarProductionNumber(inputKey, existingKey) {
  if (!inputKey || !existingKey || inputKey === existingKey) return false

  const inputBare = inputKey.replaceAll('-', '')
  const existingBare = existingKey.replaceAll('-', '')

  if (inputBare && inputBare === existingBare) return true
  if (inputKey.includes(existingKey) || existingKey.includes(inputKey)) return true
  if (inputBare.includes(existingBare) || existingBare.includes(inputBare)) return true
  if (hasSharedPrefix(inputBare, existingBare)) return true
  return hasOneCharacterDifference(inputBare, existingBare)
}

function hasSharedPrefix(a, b) {
  const length = Math.min(a.length, b.length)
  if (length < 4) return false
  return a.slice(0, length) === b.slice(0, length)
}

function hasOneCharacterDifference(a, b) {
  if (a.length !== b.length || a.length < 3) return false

  let differences = 0
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) differences += 1
    if (differences > 1) return false
  }
  return differences === 1
}

export function getProductionNumberKey(row) {
  return row?.seiban_key || createProductionNumberKey(row?.seiban)
}

export function formatProductionNumberLabel(row) {
  const parts = [
    row?.seiban || '',
    row?.equipment_name || '',
    row?.customer_name || ''
  ].filter(Boolean)
  return parts.join('　')
}

export function compareProductionNumberCandidates(a, b) {
  return String(a?.seiban || '').localeCompare(String(b?.seiban || ''), 'ja')
}

export function sortProductionNumberCandidatesByRecent(rows, recentKeys = getRecentProductionNumberKeys()) {
  const recentRank = new Map(recentKeys.map((key, index) => [key, index]))
  return [...rows].sort((a, b) => {
    const aKey = getProductionNumberKey(a)
    const bKey = getProductionNumberKey(b)
    const aRank = recentRank.has(aKey) ? recentRank.get(aKey) : Number.MAX_SAFE_INTEGER
    const bRank = recentRank.has(bKey) ? recentRank.get(bKey) : Number.MAX_SAFE_INTEGER
    if (aRank !== bRank) return aRank - bRank
    return compareProductionNumberCandidates(a, b)
  })
}

export function getRecentProductionNumberKeys(storage = getBrowserStorage()) {
  if (!storage) return []

  try {
    const parsed = JSON.parse(storage.getItem(RECENT_PRODUCTION_NUMBER_STORAGE_KEY) || '[]')
    return Array.isArray(parsed) ? parsed.filter(Boolean).slice(0, PRODUCTION_NUMBER_CANDIDATE_LIMIT) : []
  } catch {
    return []
  }
}

export function rememberRecentProductionNumber(row, storage = getBrowserStorage()) {
  if (!storage) return

  const key = getProductionNumberKey(row)
  if (!key) return

  try {
    const keys = [key, ...getRecentProductionNumberKeys(storage).filter(item => item !== key)]
      .slice(0, PRODUCTION_NUMBER_CANDIDATE_LIMIT)
    storage.setItem(RECENT_PRODUCTION_NUMBER_STORAGE_KEY, JSON.stringify(keys))
  } catch {
    // localStorage が使えない環境では、候補表示だけ継続します。
  }
}

function getBrowserStorage() {
  return globalThis.localStorage || null
}
