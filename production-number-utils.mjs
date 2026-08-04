const HYPHEN_LIKE_PATTERN = /[\u2010\u2011\u2012\u2013\u2014\u2015\u2212\u30fc\uff0d\u2500\u2043\u02d7]/g
const SPACE_PATTERN = /[\s\u3000]+/g

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
