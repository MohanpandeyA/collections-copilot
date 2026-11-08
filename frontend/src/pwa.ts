/** Registers the offline shell. Only in a production build: in dev a service worker would keep
 *  serving old files and hide changes. A failure is ignored, the app works the same without it. */
export function registerServiceWorker(prod = import.meta.env.PROD) {
  if (!prod || typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  const register = () => { navigator.serviceWorker.register(`/sw.js?v=${__BUILD_ID__}`).catch(() => undefined); };
  if (document.readyState === "complete") register();
  else window.addEventListener("load", register, { once: true });
}
