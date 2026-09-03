export const ACTIVE_COMPANY_STORAGE_KEY = 'kosu_active_company_id_v1'
export const EMPTY_COMPANY_ID = '00000000-0000-0000-0000-000000000000'

export function isCompanyAdminRole(role) {
  return role === 'company_admin'
}

export function isAdminRole(role) {
  return role === 'system_admin' || isCompanyAdminRole(role)
}

export function shouldScopeCompany(authContext) {
  return Boolean(authContext?.multiCompanyEnabled && authContext?.companyId)
}

export function scopeCompanyQuery(query, authContext) {
  if (!authContext?.multiCompanyEnabled) return query
  return query.eq('company_id', authContext.companyId || EMPTY_COMPANY_ID)
}

export function getCompanyInsertFields(authContext) {
  return shouldScopeCompany(authContext)
    ? { company_id: authContext.companyId }
    : {}
}

export function chooseActiveCompany(companies, storedCompanyId) {
  if (!Array.isArray(companies) || companies.length === 0) return null
  return companies.find(company => company.id === storedCompanyId) || companies[0]
}

export function isMissingMultiCompanyFunctionError(error) {
  const code = String(error?.code || '')
  const message = String(error?.message || '').toLowerCase()
  return code === 'PGRST202'
    || code === '42883'
    || (message.includes('multi_company_ready') && (
      message.includes('could not find')
      || message.includes('schema cache')
      || message.includes('does not exist')
    ))
}
