# Changelog

## 0.1.0 - Unreleased

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
