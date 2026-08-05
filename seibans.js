import { supabase } from './supabaseClient.js'
import { requireAuth, ROLES } from './auth.js'
import {
  createProductionNumberKey,
  normalizeProductionNumber
} from './production-number-utils.mjs'

const authContext = await requireAuth([ROLES.ADMIN])

window.loadSeibans = async function() {
  const list = document.getElementById('seiban_list')
  list.innerHTML = ''

  const { data, error } = await fetchSeibans()
  const actorNames = await fetchActorNames(data || [])

  if (error || !data) {
    console.error('製番の取得に失敗しました', error)
    list.appendChild(createListMessage('読み込みに失敗しました'))
    return
  }

  if (data.length === 0) {
    list.appendChild(createListMessage('製番が登録されていません'))
    return
  }

  data.forEach(seiban => {
    const item = document.createElement('div')
    item.className = 'master-item'
    if (seiban.status === 'pending') item.classList.add('is-pending')

    const text = document.createElement('div')
    text.className = 'master-text'

    const name = document.createElement('strong')
    name.textContent = seiban.seiban

    const sub = document.createElement('span')
    const isActive = seiban.is_active !== false
    const status = seiban.status || 'confirmed'
    const createdBy = actorNames.get(seiban.created_by) || '登録者不明'
    const createdAt = formatDateTime(seiban.created_at)
    sub.textContent = [
      seiban.equipment_name || '設備名未設定',
      seiban.customer_name || '客先名未設定',
      status === 'pending' ? '未確認' : '確認済み',
      isActive ? '使用中' : '非表示',
      status === 'pending' ? `登録者: ${createdBy}` : '',
      status === 'pending' && createdAt ? `登録日時: ${createdAt}` : ''
    ].filter(Boolean).join(' / ')

    const actions = document.createElement('div')
    actions.className = 'master-actions'

    if (status === 'pending') {
      const confirmButton = document.createElement('button')
      confirmButton.textContent = '確認済みにする'
      confirmButton.addEventListener('click', () => confirmSeiban(seiban))
      actions.append(confirmButton)

      const mergeButton = document.createElement('button')
      mergeButton.className = 'secondary-btn'
      mergeButton.textContent = '統合'
      mergeButton.addEventListener('click', () => mergeSeiban(seiban))
      actions.append(mergeButton)
    }

    const editButton = document.createElement('button')
    editButton.textContent = '編集'
    editButton.addEventListener('click', () => editSeiban(seiban))

    const visibilityButton = document.createElement('button')
    visibilityButton.className = isActive ? 'danger-btn' : ''
    visibilityButton.textContent = isActive ? '非表示' : '再表示'
    visibilityButton.addEventListener('click', () => toggleSeibanVisibility(seiban))

    text.append(name, sub)
    actions.append(editButton, visibilityButton)
    item.append(text, actions)
    list.appendChild(item)
  })
}

window.addSeiban = async function() {
  const seiban = normalizeProductionNumber(document.getElementById('new_seiban').value)
  const equipmentName = document.getElementById('new_equipment_name').value.trim()
  const customerName = document.getElementById('new_customer_name').value.trim()

  if (!seiban || !equipmentName) {
    showMessage('⚠️ 製番と設備名を入力してください', 'error')
    return
  }

  const existing = await findSeibanByKey(seiban)
  if (existing.error) {
    console.error('製番の重複確認に失敗しました', existing.error)
    showMessage('❌ 重複確認に失敗しました', 'error')
    return
  }
  if (existing.data) {
    showMessage('⚠️ 同じ生産番号が登録済みです。既存の製番を編集してください', 'error')
    return
  }

  const { error } = await insertSeiban({ seiban, equipment_name: equipmentName, customer_name: customerName || null })

  if (error) {
    console.error('製番の追加に失敗しました', error)
    showMessage('❌ 追加に失敗しました', 'error')
    return
  }

  document.getElementById('new_seiban').value = ''
  document.getElementById('new_equipment_name').value = ''
  document.getElementById('new_customer_name').value = ''
  showMessage('✅ 追加しました', 'success')
  window.loadSeibans()
}

async function fetchSeibans() {
  const result = await supabase
    .from('seiban_master')
    .select('id, seiban, seiban_key, equipment_name, customer_name, status, created_by, created_at, confirmed_by, confirmed_at, is_active')
    .order('status', { ascending: false })
    .order('is_active', { ascending: false })
    .order('seiban')

  if (!isMissingMetadataColumnError(result.error)) return result

  return supabase
    .from('seiban_master')
    .select('id, seiban, equipment_name')
    .order('seiban')
}

async function insertSeiban(payload) {
  const seiban = normalizeProductionNumber(payload.seiban)
  const result = await supabase
    .from('seiban_master')
    .insert({
      ...payload,
      seiban,
      seiban_key: createProductionNumberKey(seiban),
      status: 'confirmed',
      is_active: true,
      created_by: authContext.session.user.id,
      confirmed_by: authContext.session.user.id,
      confirmed_at: new Date().toISOString()
    })

  if (!isMissingMetadataColumnError(result.error)) return result

  return supabase
    .from('seiban_master')
    .insert({ seiban, equipment_name: payload.equipment_name })
}

async function editSeiban(current) {
  const seiban = prompt('製番を入力してください', current.seiban)
  if (!seiban || !seiban.trim()) return
  const normalizedSeiban = normalizeProductionNumber(seiban)
  if (!normalizedSeiban) {
    showMessage('⚠️ 製番を入力してください', 'error')
    return
  }

  const equipmentName = prompt('設備名を入力してください', current.equipment_name || '')
  if (!equipmentName || !equipmentName.trim()) return
  const customerName = prompt('客先名を入力してください（任意）', current.customer_name || '')

  const existing = await findSeibanByKey(normalizedSeiban)
  if (existing.error) {
    console.error('製番の重複確認に失敗しました', existing.error)
    showMessage('❌ 重複確認に失敗しました', 'error')
    return
  }
  if (existing.data && existing.data.id !== current.id) {
    showMessage('⚠️ 同じ生産番号が登録済みです。必要な場合は統合してください', 'error')
    return
  }

  const updatePayload = {
    seiban: normalizedSeiban,
    seiban_key: createProductionNumberKey(normalizedSeiban),
    equipment_name: equipmentName.trim(),
    customer_name: customerName?.trim() || null
  }

  let { error } = await supabase
    .from('seiban_master')
    .update(updatePayload)
    .eq('id', current.id)

  if (isMissingMetadataColumnError(error)) {
    const fallback = await supabase
      .from('seiban_master')
      .update({
        seiban: normalizedSeiban,
        equipment_name: equipmentName.trim()
      })
      .eq('id', current.id)
    error = fallback.error
  }

  if (error) {
    console.error('製番の更新に失敗しました', error)
    showMessage('❌ 更新に失敗しました', 'error')
    return
  }

  showMessage('✅ 更新しました', 'success')
  window.loadSeibans()
}

async function confirmSeiban(seiban) {
  if (!confirm(`「${seiban.seiban}」を確認済みにしますか？`)) return

  const { error } = await supabase
    .from('seiban_master')
    .update({
      status: 'confirmed',
      confirmed_by: authContext.session.user.id,
      confirmed_at: new Date().toISOString()
    })
    .eq('id', seiban.id)

  if (error) {
    console.error('製番の確認済み更新に失敗しました', error)
    showMessage('❌ 確認済みにできませんでした', 'error')
    return
  }

  showMessage('✅ 確認済みにしました', 'success')
  window.loadSeibans()
}

async function mergeSeiban(source) {
  const targetInput = prompt('統合先の正しい製番を入力してください', '')
  const targetKey = normalizeProductionNumber(targetInput)
  if (!targetKey) return

  const { data: target, error } = await findSeibanByKey(targetKey)
  if (error) {
    console.error('統合先製番の検索に失敗しました', error)
    showMessage('❌ 統合先の検索に失敗しました', 'error')
    return
  }

  if (!target) {
    showMessage('⚠️ 統合先の製番が見つかりません', 'error')
    return
  }

  if (target.id === source.id) {
    showMessage('⚠️ 同じ製番には統合できません', 'error')
    return
  }

  const ok = confirm([
    '未確認の生産番号を既存の生産番号へ統合しますか？',
    `統合元：${source.seiban}`,
    `統合先：${target.seiban}`,
    'この操作では工数データの参照先を統合先へ付け替えてから、統合元を削除します。'
  ].join('\n'))
  if (!ok) return

  const { error: mergeError } = await supabase.rpc('merge_pending_seiban', {
    source_id: source.id,
    target_id: target.id
  })

  if (mergeError) {
    console.error('製番の統合に失敗しました', mergeError)
    showMessage('❌ 統合に失敗しました。SUPABASE_SEIBAN_PRODUCTION_NUMBER_SETUP.sqlの実行状態と権限を確認してください', 'error')
    return
  }

  showMessage('✅ 統合しました', 'success')
  window.loadSeibans()
}

async function toggleSeibanVisibility(seiban) {
  const isActive = seiban.is_active !== false
  const action = isActive ? '非表示' : '再表示'
  if (!confirm(`この製番を${action}にしますか？`)) return

  const { error } = await supabase
    .from('seiban_master')
    .update({ is_active: !isActive })
    .eq('id', seiban.id)

  if (error) {
    console.error(`製番の${action}に失敗しました`, error)
    if (isMissingMetadataColumnError(error)) {
      showMessage('❌ 非表示機能を使うには、先にSUPABASE_SEIBAN_ACTIVE_SETUP.sqlを実行してください', 'error')
      return
    }
    showMessage(`❌ ${action}に失敗しました`, 'error')
    return
  }

  showMessage(`✅ ${action}にしました`, 'success')
  window.loadSeibans()
}

async function findSeibanByKey(value) {
  const key = createProductionNumberKey(value)
  const result = await supabase
    .from('seiban_master')
    .select('id, seiban, seiban_key, equipment_name, customer_name, status, is_active')
    .eq('seiban_key', key)
    .maybeSingle()

  if (!isMissingMetadataColumnError(result.error)) return result

  return supabase
    .from('seiban_master')
    .select('id, seiban, equipment_name, is_active')
    .eq('seiban', key)
    .maybeSingle()
}

async function fetchActorNames(seibans) {
  const authIds = [...new Set(seibans.map(row => row.created_by).filter(Boolean))]
  const map = new Map()
  if (authIds.length === 0) return map

  const { data: profiles } = await supabase
    .from('user_profiles')
    .select('auth_user_id, worker_id, role')
    .in('auth_user_id', authIds)

  const workerIds = [...new Set((profiles || []).map(profile => profile.worker_id).filter(Boolean))]
  let workerMap = new Map()
  if (workerIds.length > 0) {
    const { data: workers } = await supabase
      .from('worker_master')
      .select('id, name')
      .in('id', workerIds)
    workerMap = new Map((workers || []).map(worker => [worker.id, worker.name]))
  }

  ;(profiles || []).forEach(profile => {
    map.set(
      profile.auth_user_id,
      workerMap.get(profile.worker_id) || (profile.role === 'system_admin' ? '管理者' : '作業者')
    )
  })

  return map
}

function formatDateTime(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hour = String(date.getHours()).padStart(2, '0')
  const minute = String(date.getMinutes()).padStart(2, '0')
  return `${month}/${day} ${hour}:${minute}`
}

function isMissingMetadataColumnError(error) {
  if (!error) return false
  const message = String(error.message || '')
  return error.code === '42703'
    || message.includes('seiban_key')
    || message.includes('customer_name')
    || message.includes('status')
    || message.includes('created_by')
    || message.includes('is_active')
}

function showMessage(text, type) {
  const el = document.getElementById('message')
  el.textContent = text
  el.className = type
  setTimeout(() => {
    el.textContent = ''
    el.className = ''
  }, 3000)
}

function createListMessage(text) {
  const message = document.createElement('p')
  message.className = 'list-message'
  message.textContent = text
  return message
}

window.loadSeibans()
