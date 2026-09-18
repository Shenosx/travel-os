/**
 * PWA shell hooks. Service worker registration lands here when offline caching ships.
 * Local mutations already succeed without a network.
 */
export function preparePwa() {
  if (typeof window === 'undefined') return
  if (!('serviceWorker' in navigator)) return
}
