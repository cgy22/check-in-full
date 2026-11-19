// 全局桥接请求队列。
// 页面 onLoad 可能早于 BridgeHost 挂载，所以先入队，等当前页面的
// BridgeHost 注册后再交给它。
const handlers = new Set()
const queue = []

function dispatch(payload) {
  for (const fn of handlers) {
    let handled = false
    try {
      handled = fn(payload) === true
    } catch (e) {
      handled = false
    }
    if (handled) return true
  }
  return false
}

function drain() {
  for (let i = 0; i < queue.length; i++) {
    if (dispatch(queue[i])) {
      queue.splice(i, 1)
      i--
    }
  }
}

export function setBridgeHandler(fn) {
  handlers.add(fn)
  drain()
}

export function clearBridgeHandler(fn) {
  handlers.delete(fn)
}

export function requestBridge(payload) {
  if (!payload || !payload.url) return () => {}
  if (dispatch(payload)) return () => {}
  queue.push(payload)
  return () => {
    const i = queue.indexOf(payload)
    if (i !== -1) queue.splice(i, 1)
  }
}
