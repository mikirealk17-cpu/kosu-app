export function hasTimeOverlap(startTime, endTime, existingStartTime, existingEndTime) {
  const start = toMinutes(startTime)
  const end = toMinutes(endTime)
  const existingStart = toMinutes(existingStartTime)
  const existingEnd = toMinutes(existingEndTime)

  if ([start, end, existingStart, existingEnd].some(value => !Number.isFinite(value))) {
    return false
  }

  return start < existingEnd && end > existingStart
}

function toMinutes(time) {
  if (typeof time !== 'string') return Number.NaN
  const [hours, minutes] = time.slice(0, 5).split(':').map(Number)
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return Number.NaN
  return hours * 60 + minutes
}
