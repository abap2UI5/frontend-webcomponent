/*
 * The frontend formatters of the portable profile (profiles/portable.md,
 * section 3 "frontend formatters"; portable-v1.json bindingForms
 * `formatter`): the curated date helpers of the UI5 frontend's
 * webapp/model/formatter.js, which a view wires in through
 * core:require="{Formatter: 'z2ui5/model/formatter'}" and references as
 * `formatter: 'Formatter.<name>'`.
 *
 * They turn ABAP date strings into JavaScript Dates for properties typed
 * as an object (DatePicker.dateValue, ...): the JSON model cannot carry a
 * Date, so the conversion happens at the binding. Same names, same
 * behaviour as the reference - an empty or initial ABAP date ("00000000")
 * is null, never an Invalid Date.
 *
 * Any other formatter (an app's own function, Formatter.expandInlineIcons)
 * is outside the profile: resolveFormatter() answers null and the binding
 * keeps its visible `[formatter <name>]` placeholder and reports it.
 */

const parseYmd = (d) => [Number(d.slice(0, 4)), Number(d.slice(4, 6)) - 1, Number(d.slice(6, 8))];

/* an ABAP date that carries no date: not 8 digits, or a zero year, month or day */
function isNoAbapDate(d) {
  const s = String(d ?? '');
  if (!/^\d{8}$/.test(s)) return true;
  return s.slice(0, 4) === '0000' || s.slice(4, 6) === '00' || s.slice(6, 8) === '00';
}

export const FORMATTERS = Object.freeze({
  /** Any string the Date constructor reads (ISO) -> Date; empty -> null. */
  DateCreateObject(s) {
    if (!s) return null;
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
  },
  /** ABAP DATS "YYYYMMDD" -> Date (local midnight); initial -> null. */
  DateAbapDateToDateObject(d) {
    if (isNoAbapDate(d)) return null;
    return new Date(...parseYmd(String(d)));
  },
  /** ABAP DATS + TIMS ("HHMMSS", empty = midnight) -> Date; initial date -> null. */
  DateAbapDateTimeToDateObject(d, t) {
    if (isNoAbapDate(d)) return null;
    const time = t ? String(t) : '000000';
    return new Date(...parseYmd(String(d)), Number(time.slice(0, 2)), Number(time.slice(2, 4)), Number(time.slice(4, 6)));
  },
});

/**
 * A formatter reference -> its function, or null when it is not one of the
 * profile's. Accepted: `Formatter.<name>` (the profile's spelling - the
 * core:require alias) and any other alias of the module path
 * (`z2ui5/model/formatter`, `formatter.<name>`).
 */
export function resolveFormatter(ref) {
  const m = /^(?:\.?(?:[\w$]+[./])*)?([A-Za-z]\w*)$/.exec(String(ref || '').trim());
  if (!m) return null;
  const prefix = String(ref).trim().slice(0, -m[1].length).replace(/[./]$/, '');
  if (!/(^|[./])formatter$/i.test(prefix)) return null;
  return Object.prototype.hasOwnProperty.call(FORMATTERS, m[1]) ? FORMATTERS[m[1]] : null;
}
