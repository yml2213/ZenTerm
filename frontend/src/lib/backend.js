const missingBackendMessage = '当前未检测到 Wails 后端，请通过 Wails 运行 ZenTerm。'

function getAppBinding() {
  return window.go?.main?.App
}

function getRuntimeBinding() {
  return window.runtime
}

export function isBackendAvailable() {
  return Boolean(getAppBinding())
}

async function callApp(method, ...args) {
  const binding = getAppBinding()
  const fn = binding?.[method]

  if (typeof fn !== 'function') {
    if (method === 'ListHosts' || method === 'ListSessions') {
      return []
    }

    throw new Error(missingBackendMessage)
  }

  return fn(...args)
}

export function onRuntimeEvent(eventName, handler) {
  const runtime = getRuntimeBinding()
  const on = runtime?.EventsOn
  const off = runtime?.EventsOff

  if (typeof on !== 'function') {
    return () => {}
  }

  const unsubscribe = on(eventName, handler)
  if (typeof unsubscribe === 'function') {
    return unsubscribe
  }

  return () => {
    if (typeof off === 'function') {
      off(eventName)
    }
  }
}

export async function unlock(password) {
  return callApp('Unlock', password)
}

export async function listHosts() {
  return callApp('ListHosts')
}

export async function addHost(host, identity) {
  return callApp('AddHost', host, identity)
}

export async function updateHost(host, identity) {
  return callApp('UpdateHost', host, identity)
}

export async function deleteHost(hostID) {
  return callApp('DeleteHost', hostID)
}

export async function connect(hostID) {
  return callApp('Connect', hostID)
}

export async function acceptHostKey(hostID, key) {
  return callApp('AcceptHostKey', hostID, key)
}

export async function rejectHostKey(hostID) {
  return callApp('RejectHostKey', hostID)
}

export async function sendInput(sessionID, data) {
  return callApp('SendInput', sessionID, data)
}

export async function resizeTerminal(sessionID, cols, rows) {
  return callApp('ResizeTerminal', sessionID, cols, rows)
}

export async function disconnect(sessionID) {
  return callApp('Disconnect', sessionID)
}

export async function listSessions() {
  return callApp('ListSessions')
}
