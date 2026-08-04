export const ALLOWED_REDIRECT_PAGES = new Set([
  'index.html',
  'logs.html',
  'summary.html',
  'admin.html',
  'workers.html',
  'work-types.html',
  'seibans.html',
  'rates.html',
  'billing-companies.html'
])

export function getSafeLocalRedirect(path, currentLocation) {
  if (!path) return ''

  try {
    const current = new URL(
      typeof currentLocation === 'string' ? currentLocation : currentLocation.href
    )
    const candidate = new URL(path, current)
    const directory = current.pathname.slice(0, current.pathname.lastIndexOf('/') + 1)
    const page = candidate.pathname.split('/').pop()

    if (candidate.origin !== current.origin) return ''
    if (candidate.pathname !== `${directory}${page}`) return ''
    if (!ALLOWED_REDIRECT_PAGES.has(page)) return ''

    return `${page}${candidate.search}`
  } catch {
    return ''
  }
}
