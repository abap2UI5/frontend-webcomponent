/*
 * A browser-like global environment for the renderer tests: happy-dom's
 * window, its document and the globals the renderer reaches for. The ui5-*
 * tags stay unknown elements - the tests check what the renderer builds,
 * not how the web components draw it.
 */
import { Window } from 'happy-dom';

export function installDom() {
  const window = new Window({ url: 'http://localhost/', width: 1280, height: 800 });
  const g = globalThis;
  for (const k of ['window', 'document', 'HTMLElement', 'customElements', 'CustomEvent', 'MutationObserver', 'Node', 'requestAnimationFrame']) {
    if (!(k in g) || ['window', 'document', 'CustomEvent'].includes(k)) {
      Object.defineProperty(g, k, { value: k === 'window' ? window : window[k], configurable: true, writable: true });
    }
  }
  if (!g.requestAnimationFrame) g.requestAnimationFrame = (fn) => setTimeout(fn, 0);
  return window;
}
