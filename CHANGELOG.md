# Changelog

## Unreleased

- **Profile** re-copied from protocol 604d267 (spec revision 0.3): the
  additive `actions.api` / `actions.wire` split; `scripts/profile-actions.mjs`
  reads `actions.api` too.
- **Vendored agent modules** re-pinned to abap2UI5/mcp-server a4d9f07 (PR
  #44): viewxml, snapshot and appclient follow the protocol's frontend rules
  there too; this frontend's own session already did and is unchanged.
- **The URL hash** (`src/core/router.js`, spec/navigation.md): the `ROUTER`
  system action applied once per response after rendering - `KEEP` routes
  `#/app/<CLASS>/<DRAFT>` and `FRESH` routes `#/app/<CLASS>` that follow every
  draft id, a routed `nav_app_call` repoints the caller's entry and pushes a
  history entry, browser Back/Forward (or a manual edit) sends the
  app-start-shaped restore (no `ID`, the new `HASH`), the app-state hash
  `#/z2ui5-xapp-state=<DRAFT>` written and cleared, app-owned hashes
  (`setPushState` / `setHashReplace`, the `setHashEvent` listener raised on a
  change from outside, parked while a roundtrip runs), `HASH_BACK` with its
  fallback route, the launchpad shell part kept. Every request of the
  standalone page carries the hash as `S_FRONT.HASH`.
- **Embedded routing**: new attribute `routing` (`hash` | `events` | `off`).
  Embedded (the default `events`) the element never touches the host's URL
  and sends no `HASH`; it emits `abap2ui5-route` (`push` / `replace` /
  `back`) instead, and the host hands its own hash changes back with the new
  method `navigate(hash)`.
- **Error body verbatim**: a failed roundtrip shows the response body exactly
  as it came, as text - no markup stripped, no entities decoded
  (spec/errors.md); `HTTP <status>` for an empty body. The session no longer
  uses the vendored `errorText` (the vendored copy is unchanged).
- **Frontend formatters** of the portable profile: `Formatter.DateCreateObject`,
  `Formatter.DateAbapDateToDateObject`, `Formatter.DateAbapDateTimeToDateObject`
  (with `parts`); other formatters keep the placeholder and the report.
- `DatePicker` / `DateTimePicker` / `TimePicker` `dateValue` (one-way, from a
  formatter) and `minDate` / `maxDate`.
- Table and List **growing**: `growing`, `growingThreshold`,
  `growingTriggerText`, `growingScrollToLoad` (`ui5-table-growing`, the
  list's `growing` mode).
- `CONTROL_GLOBAL INVISIBLE_MESSAGE announce` (an aria-live region); the
  navigation family under its client-API names (`SET_PUSH_STATE`,
  `HASH_REPLACE`, `HASH_ATTACH_CHANGED`, `SET_NAV_ROUTING`,
  `SET_APP_STATE_ACTIVE`) handed to the router when it arrives as an `.eF`
  wire. `CONTROL_BY_ID` and `BINDING_CALL` stay unsupported - the portable
  profile excludes them.
- `profile/portable-v1.json` re-copied from abap2UI5/protocol main
  (`d125109`, unchanged content) by the new `scripts/vendor-profile.mjs`;
  `scripts/profile-actions.mjs` reads the profile's action list in both
  shapes (client-API names, or wire actions and client-API names apart).
- Demo: Z2UI5_CL_SMP_APP_480 (+469, hash routing KEEP) and
  Z2UI5_CL_SMP_APP_498 (app state in the URL), with e2e tests - Back and
  Forward, reload, and a cross-check of the restore request against the UI5
  SPA; an embedded routing e2e test.
- Protocol frontend conformance suite (`--adapter webcomponent`): 0 MUST
  failures (before: 4 failures, 1 warning).

## 0.1.0 - first version (PR #1, not published)

First version.

- **Core protocol client** (`src/core/`): app start with location and
  `S_DEVICE`, events with `T_EVENT_ARG` and the model delta of the edited
  paths (`__delta` rows for table cells), the draft id, the five view slots
  (response bookkeeping by the vendored `applyResponse`), POPUP/POPOVER torn
  down on an `APP` change, the app stack followed through `S_FRONT.APP`, the
  `PROTOCOL` check, error texts of failed roundtrips with Restart, one
  roundtrip at a time with the queue-last and no-busy wire flags; fetch
  transport with `sap-contextid`, the CSRF token handshake, credentials and
  extra headers.
- **Renderer** (`src/render/`): view XML to UI5 Web Components through a
  control registry - all 65 controls of portable profile v1 plus 31 more;
  unknown controls as a visible box with their children still rendered, and
  a diagnostics panel / console / `abap2ui5-diagnostic` event.
- **Bindings**: paths, list bindings with templates, element binding,
  two-way binding of value-like properties, typed display formatting,
  expression bindings in the profile grammar (own parser, no eval),
  composite parts, the `device>` model; formatters as visible placeholders.
- **Frontend actions**: message toast and box (incl. client-composed texts,
  custom actions, `onClose`), popup/popover close, `SET_TITLE`,
  `START_TIMER`, `SET_FOCUS`, clipboard, URL actions with the UI5 frontend's
  URL rules, theming, busy indicator.
- **Packaging**: `dist/abap2ui5-wc.js` (registers `<abap2ui5-app>`),
  `dist/index.html` (standalone start, `?app_start=`), on-demand chunks for
  icons, CLDR data and themes; embedding examples.
- **Demo and tests**: 14 sample apps of abap2UI5/samples on
  `@abap2ui5/node-runtime` 1.146.0; Playwright tests of every app with a
  cross-check of the request bodies and models against the official UI5 SPA
  served by the same backend; unit tests on node:test and happy-dom;
  screenshots in `docs/screenshots/`; CI.
