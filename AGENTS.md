# AGENTS.md

Single source of truth for agents working on **abap2UI5 frontend-webcomponent**
- the abap2UI5 frontend that renders portable-profile views with UI5 Web
Components, standalone or embedded as `<abap2ui5-app>`.

> These instructions OVERRIDE any default behavior and must be followed exactly.

## Language

**This entire project is in English** - code, comments, commit messages, PR
texts, documentation, and every text the frontend shows.

## What this repository is (and is not)

- A **frontend** of the [abap2UI5 protocol](https://github.com/abap2UI5/protocol):
  the core protocol in full, the **portable view profile** for rendering.
  The authority for both is the protocol repository (`spec/`,
  `profiles/portable.md`, `profiles/portable-v1.json`); this repository
  follows it. A behaviour the protocol does not describe is a question for
  the protocol repository, not a local invention.
- **Not** a second UI5 frontend: never load the UI5 core, never emulate UI5
  controls beyond what a portable-profile control needs, never add a
  control-method whitelist (`CONTROL_BY_ID`). A view outside the profile
  renders the visible *unsupported control* box and a diagnostic - it must
  never crash the view or the session.
- **No backend code here.** The demo backend is `@abap2ui5/node-runtime`
  from npm with sample classes of abap2UI5/samples transpiled on top.

## Layout

| Path | |
|---|---|
| `src/core/` | the protocol client, DOM-free: `session.js` (start, fire, slots, delta, app stack), `transport.js` (fetch, `sap-contextid`, CSRF), `actions.js` (frontend actions) |
| `src/bindings/` | models, property/list bindings, the expression grammar, typed display formatting |
| `src/render/` | the renderer, event-arg computation (`wires.js`), the control registry and one mapper per control in `controls/`, the web-component imports (`webcomponents.js` + `webcomponents-tags.js`) |
| `src/ui/` | `app.js` (slots, popups, messages, busy, errors, diagnostics), `styles.js` |
| `src/element.js`, `src/index.js` | `<abap2ui5-app>` and the ESM entry |
| `src/vendor/agent/` | **vendored** viewxml/snapshot/appclient of abap2UI5/mcp-server - never edit |
| `profile/portable-v1.json` | the profile's machine-readable control list, copied from the protocol repository (`profile/source.json`) |
| `demo/` | `apps.json` (the demo apps), `abap/` (**vendored** sample classes), `build-backend.mjs`, `server.mjs` |
| `examples/` | embedding examples (`plain.html` is served and tested) |
| `test/unit/` | node:test - pure modules, and the renderer on happy-dom over `test/fixtures/views/` |
| `test/e2e/` | Playwright against `demo/server.mjs`: every demo app, the UI5-SPA cross-check, embedding, screenshots |
| `scripts/` | vendoring, fixture recording, coverage table, bundle size report |

## Rules

- **Vendored files are never edited by hand**: `src/vendor/agent/*`
  (`npm run vendor`), `demo/abap/*` (`scripts/vendor-samples.mjs`),
  `profile/portable-v1.json`. Their hashes are tested. A fix goes upstream,
  then re-vendor. Functionality the vendored modules lack is written next to
  them (example: `src/bindings/expression.js` - the profile's expression
  grammar is a superset of viewxml's evaluator).
- **A new control** = a mapper in `src/render/controls/` (status `full` or
  `basic` with a `note` saying what is left out), its web component imported
  in `webcomponents.js` and listed in `webcomponents-tags.js`, a renderer
  unit test, and `node scripts/generate-coverage.mjs` for the README table.
  `npm test` fails on a missing import or a stale table.
- **Two-way bindings write before wires fire** (capture listeners): the
  delta of an event must contain the value the user just entered, exactly
  as the UI5 frontend sends it. A change to delta/wire behaviour needs an
  e2e cross-check against the UI5 SPA.
- **Security:** view XML and models are backend data. No `eval` /
  `new Function`; `core:HTML` and FormattedText are sanitized; navigation
  actions keep the UI5 frontend's URL rules (same origin, http(s) only).
- **Keep the bundle lean:** import only the web components a mapper creates;
  report the size (`npm run build` prints it) when it changes notably.
- The e2e tests run with **one worker** - one backend process, see README
  "Limits".

## Checks (CI = `.github/workflows/ci.yml`)

`npm run lint`, `npm test`, `npm run vendor:check` (needs the mcp-server
commit: CI reads it from GitHub), `npm run build`, then
`npm run demo:build` and `npm run e2e`. All must be green before a merge.

## Commits

Commit messages in English, imperative subject. No PR without the checks
above green locally.
