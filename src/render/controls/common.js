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

/**
 * A URL that runs script (javascript:, vbscript:) or opens markup of its own
 * (data:text/html) - read the way the browser reads it: the URL parser drops
 * every tab and line break and the control characters and spaces in front,
 * so "java\tscript:" and "\x01javascript:" are javascript: URLs as well.
 */
export function isScriptUrl(value) {
  // eslint-disable-next-line no-control-regex
  const v = String(value ?? '').replace(/[\t\n\r]/g, '').replace(/^[\x00-\x20]+/, '').toLowerCase();
  return /^(javascript|vbscript):/.test(v) || /^data:\s*text\/html/.test(v);
}

/** An image source a view may set: http(s), a data image, or a relative/absolute path - no script URL. */
export const isImageUrl = (v) => !!v && !isScriptUrl(v) && /^(https?:|data:image\/|\/|\.|[\w-]+[/.])/i.test(String(v));

/* the attributes that hold a URL the browser follows or loads */
const URL_ATTRIBUTES = ['href', 'src', 'xlink:href', 'action', 'formaction'];

/** Strip what must not run: scripts, event handlers, javascript: URLs, custom elements. */
export function sanitizeHtml(doc, html) {
  const tpl = doc.createElement('template');
  tpl.innerHTML = String(html ?? '');
  const walk = (node) => {
    for (const child of [...node.children]) {
      const tag = child.tagName.toLowerCase();
      // animate and set write an attribute of their parent - an SVG <a>'s
      // href - after this check has passed it. A custom element (a name
      // with a hyphen) runs the code its page defined for it on insertion:
      // <abap2ui5-app endpoint app> would start an app from any server in
      // the page - FormattedText's markup never names one, nor UI5's own
      if (['script', 'iframe', 'object', 'embed', 'link', 'meta', 'base', 'form', 'animate', 'set'].includes(tag)
        || tag.includes('-')) {
        child.remove();
        continue;
      }
      for (const a of [...child.attributes]) {
        const n = a.name.toLowerCase();
        // is="..." makes a built-in element a customized one - the same as above
        if (n.startsWith('on') || n === 'is' || (URL_ATTRIBUTES.includes(n) && isScriptUrl(a.value))) {
          child.removeAttribute(a.name);
        }
      }
      walk(child);
    }
  };
  walk(tpl.content);
  return tpl.content;
}
