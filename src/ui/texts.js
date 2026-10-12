/*
 * The few texts this frontend shows on its own - the message box titles and
 * action buttons, the error dialog, the "no data" and "search" texts of the
 * mappers, the diagnostics summary. The web components bring their own
 * translations; these are the ones the UI5 frontend takes from UI5's
 * resource bundle.
 *
 * textsFor(language) answers the bundle of the language (its primary
 * subtag: 'de-AT' -> 'de'), English for a language without one. A host
 * can add or override a language with defineTexts().
 */
export const EN = {
  'box.confirm': 'Confirmation',
  'box.error': 'Error',
  'box.warning': 'Warning',
  'box.success': 'Success',
  'box.information': 'Information',
  'box.alert': 'Alert',
  'action.OK': 'OK',
  'action.CANCEL': 'Cancel',
  'action.YES': 'Yes',
  'action.NO': 'No',
  'action.ABORT': 'Abort',
  'action.RETRY': 'Retry',
  'action.IGNORE': 'Ignore',
  'action.CLOSE': 'Close',
  'action.DELETE': 'Delete',
  'error.title': 'App Terminated',
  'error.restart': 'Restart',
  'error.retry': 'Retry',
  'error.close': 'Close',
  'noData': 'No data',
  'search': 'Search',
  'back': 'Back',
  'unsupported': 'unsupported control {0}',
  'diagnostics.one': '1 unsupported item - this frontend renders the portable profile',
  'diagnostics.many': '{0} unsupported items - this frontend renders the portable profile',
};

const DE = {
  'box.confirm': 'Bestätigung',
  'box.error': 'Fehler',
  'box.warning': 'Warnung',
  'box.success': 'Erfolg',
  'box.information': 'Information',
  'box.alert': 'Hinweis',
  'action.OK': 'OK',
  'action.CANCEL': 'Abbrechen',
  'action.YES': 'Ja',
  'action.NO': 'Nein',
  'action.ABORT': 'Abbrechen',
  'action.RETRY': 'Wiederholen',
  'action.IGNORE': 'Ignorieren',
  'action.CLOSE': 'Schließen',
  'action.DELETE': 'Löschen',
  'error.title': 'Anwendung beendet',
  'error.restart': 'Neu starten',
  'error.retry': 'Wiederholen',
  'error.close': 'Schließen',
  'noData': 'Keine Daten',
  'search': 'Suchen',
  'back': 'Zurück',
  'unsupported': 'nicht unterstütztes Control {0}',
  'diagnostics.one': '1 nicht unterstütztes Element - dieses Frontend rendert das portable Profil',
  'diagnostics.many': '{0} nicht unterstützte Elemente - dieses Frontend rendert das portable Profil',
};

const bundles = new Map([['en', EN], ['de', DE]]);

/** Add or extend the texts of a language (the primary subtag, 'fr'). */
export function defineTexts(language, texts) {
  const key = primary(language);
  bundles.set(key, { ...(bundles.get(key) || EN), ...texts });
}

export const primary = (language) => String(language || '').trim().toLowerCase().split(/[-_]/)[0];

/** The language this frontend shows its texts in: the one given, else the page's. */
export function resolveLanguage(explicit, doc = globalThis.document, nav = globalThis.navigator) {
  if (explicit) return String(explicit);
  const html = doc && doc.documentElement && doc.documentElement.lang;
  if (html) return html;
  return (nav && nav.language) || 'en';
}

/** A text function for a language: t(key, ...args) with `{0}`, `{1}` filled in. */
export function textsFor(language) {
  const bundle = bundles.get(primary(language)) || EN;
  const t = (key, ...args) => {
    const s = bundle[key] !== undefined ? bundle[key] : (EN[key] !== undefined ? EN[key] : key);
    return s.replace(/\{(\d+)\}/g, (m, i) => (args[i] !== undefined && args[i] !== null ? String(args[i]) : m));
  };
  t.language = language;
  return t;
}
