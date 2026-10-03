/*
 * The HTTP transport of the core protocol: one POST of `{ value: <body> }`
 * per roundtrip, the way the UI5 frontend's core/Server.js sends it.
 *
 *   - `sap-contextid-accept: header` on every request; the `sap-contextid`
 *     a stateful backend answers is kept and sent back from then on (only a
 *     valid one - never "", never "undefined"), and a response without the
 *     header does not wipe it;
 *   - CSRF: a token layer in front of the backend (SAP approuter, Gateway)
 *     answers 403 with `X-CSRF-Token: Required`; then the token is fetched
 *     (HEAD with `X-CSRF-Token: Fetch`) and the SAME body sent once more.
 *     `csrf` = 'auto' (that handshake, the default), 'fetch' (fetch a token
 *     before the first POST), 'none', or a token string to send as it is;
 *   - `credentials` is fetch's (same-origin, include, omit) - 'include' for
 *     a backend on another origin that authenticates by cookie;
 *   - `headers` extra request headers (an Authorization header, sap-client).
 *
 * endSession() is the best-effort HEAD with `sap-terminate: session`.
 */

/* the UI5 frontend's rule (core/Lib.js isValidContextId) */
export const isValidContextId = (v) => typeof v === 'string' && v !== '' && v !== 'undefined';

export function createFetchTransport({
  endpoint,
  credentials = 'same-origin',
  csrf = 'auto',
  headers = {},
  fetchImpl = (...a) => globalThis.fetch(...a),
  timeoutMs = 600000,
} = {}) {
  if (!endpoint) throw new Error('abap2ui5-wc: no endpoint');
  const state = {
    contextId: null,
    csrfToken: csrf && !['auto', 'fetch', 'none'].includes(csrf) ? csrf : '',
    fetchedOnce: false,
  };

  const requestHeaders = () => {
    const h = { 'Content-Type': 'application/json', 'sap-contextid-accept': 'header', ...headers };
    if (isValidContextId(state.contextId)) h['sap-contextid'] = state.contextId;
    if (state.csrfToken) h['X-CSRF-Token'] = state.csrfToken;
    return h;
  };

  async function fetchToken(signal) {
    state.csrfToken = '';
    try {
      const res = await fetchImpl(endpoint, { method: 'HEAD', headers: { 'X-CSRF-Token': 'Fetch', ...headers }, credentials, signal });
      const token = ((res.headers && res.headers.get('x-csrf-token')) || '').trim();
      if (res.ok && token && !['required', 'fetch'].includes(token.toLowerCase())) state.csrfToken = token;
    } catch (e) {
      if (e && e.name !== 'AbortError') console.warn('[abap2ui5-wc] CSRF token fetch failed', e);
    }
    return state.csrfToken !== '';
  }

  const tokenRequired = (res) => res.status === 403
    && ((res.headers && res.headers.get('x-csrf-token')) || '').trim().toLowerCase() === 'required';

  /** One roundtrip: `body` is the request object (wrapped in { value }). */
  async function roundtrip(body, { signal } = {}) {
    const sig = signal || AbortSignal.timeout(timeoutMs);
    const text = JSON.stringify({ value: body });
    if (csrf === 'fetch' && !state.fetchedOnce) {
      state.fetchedOnce = true;
      await fetchToken(sig);
    }
    const post = () => fetchImpl(endpoint, { method: 'POST', headers: requestHeaders(), body: text, credentials, signal: sig });
    let res = await post();
    if (csrf !== 'none' && tokenRequired(res) && (await fetchToken(sig))) res = await post();
    const ctxId = res.headers && res.headers.get('sap-contextid');
    if (isValidContextId(ctxId)) state.contextId = ctxId;
    return { status: res.status, ok: res.ok, body: await res.text(), bytes: text.length };
  }

  function endSession() {
    if (!isValidContextId(state.contextId)) return;
    try {
      fetchImpl(endpoint, {
        method: 'HEAD',
        keepalive: true,
        credentials,
        headers: { 'sap-terminate': 'session', 'sap-contextid': state.contextId, 'sap-contextid-accept': 'header', ...headers },
      }).catch(() => {});
    } catch {
      /* the page is going away */
    }
    state.contextId = null;
  }

  return { roundtrip, endSession, state };
}
