export function makeError(code, message) {
  return Object.assign(new Error(message), { code })
}

export async function rpc(method, params = {}, accessToken = null) {
  let response
  try {
    response = await uniCloud.callFunction({
      name: 'valencia-checkin',
      data: { method, params, accessToken }
    })
  } catch (error) {
    console.warn('[uniCloud]', method, error?.errCode || error?.code || '')
    throw makeError('NETWORK_ERROR', '无法连接 uniCloud，请检查网络后重试')
  }
  const result = response.result
  if (!result || !result.ok) {
    throw makeError(result?.code || 'RPC_FAILED', result?.message || '操作失败，请稍后重试')
  }
  return result.data
}

export const getServerTime = () => rpc('get_server_time')
export const getMyProfile = accessToken => rpc('get_my_profile', {}, accessToken)
