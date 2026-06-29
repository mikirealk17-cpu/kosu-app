export const RATE_TYPES = [
  { value: 'hourly', label: '時間単価' },
  { value: 'fixed_per_entry', label: '固定単価（1入力ごと）' },
  { value: 'contract_by_seiban', label: '請負単価（製番ごと）' }
]

export function getRateTypeLabel(value) {
  return RATE_TYPES.find(type => type.value === value)?.label || '単価区分未設定'
}

export function fillRateTypeSelect(select, includeEmpty = true) {
  select.innerHTML = ''

  if (includeEmpty) {
    const emptyOption = document.createElement('option')
    emptyOption.value = ''
    emptyOption.textContent = '単価区分を選択'
    select.appendChild(emptyOption)
  }

  RATE_TYPES.forEach(type => {
    const option = document.createElement('option')
    option.value = type.value
    option.textContent = type.label
    select.appendChild(option)
  })
}

export function minutesToDecimalHours(minutes) {
  return Math.round((minutes / 60) * 100) / 100
}

export function roundBillingAmount(amount) {
  return Math.round(amount)
}

export function calculateBillingAmount(rateType, actualMinutes, unitPrice) {
  const price = Number(unitPrice) || 0
  if (rateType === 'hourly') {
    return roundBillingAmount(minutesToDecimalHours(actualMinutes) * price)
  }
  if (rateType === 'fixed_per_entry') {
    return roundBillingAmount(price)
  }
  return null
}

export function isContractRate(rateType) {
  return rateType === 'contract_by_seiban'
}
