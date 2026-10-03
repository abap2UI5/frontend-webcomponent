/*
 * The frontend actions of profile/portable-v1.json, read tolerantly.
 *
 * The profile's `frontendActions` lists what a portable app may use. In its
 * first shape (`allowed`) the navigation family appears under its CLIENT
 * API names (SET_NAV_ROUTING, SET_PUSH_STATE, HASH_REPLACE,
 * HASH_ATTACH_CHANGED, SET_APP_STATE_ACTIVE), although a backend folds them
 * into the one ROUTER system action and only HASH_BACK travels as a
 * follow-up action (spec/actions.md; protocol open question 10, decided:
 * the profile separates client-API names from wire actions). This reader
 * accepts both shapes - and any grouping of string lists under
 * `frontendActions` - and answers what a renderer actually receives:
 *
 *   wire       the action names that arrive (ROUTER for the folded family)
 *   clientApi  the folded client-API names it found
 *   globals    allowedGlobals ({ TARGET: [methods] })
 *   noOp       noOpAllowed
 *   excluded   excluded
 */

/* client-API name -> the ROUTER option it becomes */
export const ROUTER_FOLDED = Object.freeze({
  SET_NAV_ROUTING: 'setNavRouting',
  SET_PUSH_STATE: 'setPushState',
  HASH_REPLACE: 'setHashReplace',
  HASH_ATTACH_CHANGED: 'setHashEvent',
  SET_APP_STATE_ACTIVE: 'setAppStateActive',
});

const NOT_ACTIONS = new Set(['excluded', 'noOpAllowed', 'allowedGlobals', 'note', 'notes', 'description']);

export function profileActions(profile) {
  const fa = (profile && profile.frontendActions) || {};
  const names = new Set();
  const collect = (v, key) => {
    if (NOT_ACTIONS.has(key)) return;
    if (typeof v === 'string') {
      names.add(v);
    } else if (Array.isArray(v)) {
      for (const x of v) {
        if (x && typeof x === 'object' && !Array.isArray(x) && typeof (x.name || x.action) === 'string') names.add(x.name || x.action);
        else collect(x);
      }
    } else if (v && typeof v === 'object') {
      for (const [k, x] of Object.entries(v)) collect(x, k);
    }
  };
  collect(fa);
  const wire = new Set();
  const clientApi = [];
  for (const n of names) {
    if (ROUTER_FOLDED[n]) {
      clientApi.push(n);
      wire.add('ROUTER');
    } else if (/^[a-z]\w*$/.test(n)) {
      // a ROUTER option name (setPushState, ...) in a shape that lists them
      wire.add('ROUTER');
    } else if (/^[A-Z][A-Z0-9_]*$/.test(n)) {
      wire.add(n);
    }
  }
  return {
    wire: [...wire].sort(),
    clientApi: clientApi.sort(),
    globals: fa.allowedGlobals || {},
    noOp: fa.noOpAllowed || [],
    excluded: fa.excluded || [],
  };
}
