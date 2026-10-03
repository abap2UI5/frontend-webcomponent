/*
 * The value maps and specs many mappers share.
 */

/** sap.ui.core.ValueState -> the web components' ValueState. */
export const VALUE_STATE = {
  None: 'None', Success: 'Positive', Warning: 'Critical', Error: 'Negative', Information: 'Information',
  Positive: 'Positive', Critical: 'Critical', Negative: 'Negative',
};

/** sap.m.ButtonType -> ButtonDesign. */
export const BUTTON_DESIGN = {
  Default: 'Default', Accept: 'Positive', Reject: 'Negative', Emphasized: 'Emphasized', Transparent: 'Transparent',
  Ghost: 'Default', Attention: 'Attention', Success: 'Positive', Negative: 'Negative', Critical: 'Attention',
  Neutral: 'Default', Back: 'Transparent', Up: 'Transparent', Unstyled: 'Transparent',
};

/** `sap-icon://add` -> `add` (the default collection); other collections pass through as `coll/name`. */
export function iconName(v) {
  const s = String(v ?? '');
  if (!s) return '';
  const m = /^sap-icon:\/\/(?:([^/]+)\/)?(.+)$/.exec(s);
  if (!m) return s;
  if (!m[1]) return m[2];
  if (m[1] === 'SAP-icons-TNT') return `tnt/${m[2]}`;
  if (m[1] === 'BusinessSuiteInAppSymbols') return `business-suite/${m[2]}`;
  return `${m[1]}/${m[2]}`;
}

export const enabled = { attr: 'disabled', bool: true, invert: true };
export const editable = { attr: 'readonly', bool: true, invert: true };
export const valueState = { attr: 'value-state', map: VALUE_STATE };
export const text = { text: true };
export const width = { style: 'width' };
export const height = { style: 'height' };
export const icon = { attr: 'icon', convert: iconName };

/** The value-state message slot of an input-like web component. */
export const valueStateText = {
  set(el, v) {
    let msg = el.querySelector(':scope > [slot="valueStateMessage"]');
    if (!v) {
      if (msg) msg.remove();
      return;
    }
    if (!msg) {
      msg = el.ownerDocument.createElement('div');
      msg.setAttribute('slot', 'valueStateMessage');
      el.appendChild(msg);
    }
    msg.textContent = String(v);
  },
};

/** UI5 CSS size ('100%', '20rem', 'auto') or nothing. */
export const cssSize = (v) => (v === undefined || v === null || v === '' || v === 'auto' ? '' : String(v));

/** Strip what must not run: scripts, event handlers, javascript: URLs. */
export function sanitizeHtml(doc, html) {
  const tpl = doc.createElement('template');
  tpl.innerHTML = String(html ?? '');
  const walk = (node) => {
    for (const child of [...node.children]) {
      const tag = child.tagName.toLowerCase();
      if (['script', 'iframe', 'object', 'embed', 'link', 'meta', 'base', 'form'].includes(tag)) {
        child.remove();
        continue;
      }
      for (const a of [...child.attributes]) {
        const n = a.name.toLowerCase();
        if (n.startsWith('on') || ((n === 'href' || n === 'src' || n === 'xlink:href' || n === 'action') && /^\s*(javascript|vbscript|data:text\/html)/i.test(a.value))) {
          child.removeAttribute(a.name);
        }
      }
      walk(child);
    }
  };
  walk(tpl.content);
  return tpl.content;
}
