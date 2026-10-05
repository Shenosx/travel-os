import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'http://localhost/',
  pretendToBeVisual: true,
})

const { window } = dom

function assignGlobal(key, value) {
  try {
    globalThis[key] = value
    return
  } catch {
    // Node 22+ exposes some host getters as read-only.
  }
  try {
    Object.defineProperty(globalThis, key, {
      configurable: true,
      writable: true,
      value,
    })
  } catch {
    // ignore host-object getters that cannot be copied
  }
}

assignGlobal('window', window)
assignGlobal('document', window.document)
assignGlobal('navigator', window.navigator)
globalThis.IS_REACT_ACT_ENVIRONMENT = true

for (const key of Object.getOwnPropertyNames(window)) {
  if (key in globalThis) continue
  assignGlobal(key, window[key])
}
