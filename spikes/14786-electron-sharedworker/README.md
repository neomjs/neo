# Spike: SharedWorker constraints inside Electron (#14786 / ADR 0034)

Empirical verification for the Electron shell architecture ADR (ADR 0034; #14786 under epic
#13377): under which origin classes, window-creation paths, and session partitions do two
Electron-hosted pages reach **one** SharedWorker instance — the load-bearing prerequisite for
Neo's shared-worker multi-window architecture (ADR 0020 §3).

Run: `npm install && npm start` (Electron is **pinned exactly**; all windows are `show: false` —
nothing appears on screen; results print to stdout as a `SPIKE_RESULTS_JSON` block).
**Raw committed evidence:** [spike-results.json](./spike-results.json) — the verbatim result
object of the recorded run, including exact runtime versions.

**Re-run trigger:** every Electron major bump, BEFORE adoption — owner: the E2 (origin + scheme
server) leaf owner under epic #13377; binding lives in ADR 0034 §6.

## Method

`worker.js` counts `onconnect` events per instance and echoes the count to each connecting page.
Two pages reporting `{1, 2}` reached the SAME instance (**SHARED**); both reporting `{1, 1}` means
each got its own (**ISOLATED**) — every verdict requires BOTH windows to report; silence is never
evidence. Pages report via a `contextBridge` preload; `window.open()` popups (which carry no
preload) relay through their same-origin opener. SharedWorker identity is `(origin, URL)`, so each
phase uses a phase-scoped worker URL — no cross-phase bleed. All windows use Electron's default
secure flags: `contextIsolation: true`, sandbox on, `nodeIntegration: false`.

The partition controls are **one-variable**: a SHARING origin, the same page URL, the same preload
— only window B's `partition` differs. The `app://` control additionally requires registering the
protocol handler on the control partition's session (see findings). A `mode=fetch` smoke phase
proves the packaged origin serves JSON via `fetch()` — the `data.Store` `url` seed path.

## Results — Electron 43.1.0 · Chromium 150.0.7871.47 · Node 24.18.0 · darwin 25.5.0 (2026-07-10)

| Phase | Origin | Variable under test | Verdict |
|---|---|---|---|
| `file2win` | `file://` | two `BrowserWindow`s | **ISOLATED** (1, 1) |
| `filepopup` | `file://` | `window.open()` popup | **ISOLATED** (1, 1) |
| `app2win` | `app://` (privileged standard scheme) | two `BrowserWindow`s | **SHARED** (1, 2) |
| `apppopup` | `app://` | `window.open()` popup | **SHARED** (1, 2) |
| `http2win` | `http://127.0.0.1` | two `BrowserWindow`s | **SHARED** (1, 2) |
| `httppopup` | `http://127.0.0.1` | `window.open()` popup | **SHARED** (1, 2) |
| `partitionapp` | `app://` (sharing origin) | window B on `persist:other` — ONLY partition varies | **ISOLATED** (1, 1) — both windows report |
| `partitionhttp` | `http://127.0.0.1` (sharing origin) | window B on `persist:other` | **ISOLATED** (1, 1) — both windows report |
| `fetchsmoke` | `app://` | `fetch('data.json')` | **fetchOk: true** |

## The findings ADR 0034 binds

1. **`file://` loading breaks worker sharing.** File pages are opaque origins in Chromium: every
   window gets a private SharedWorker instance — silently. A naively packaged Electron app that
   `loadFile()`s the harness would boot, render, and have NO shared worker state.
2. **A real origin restores sharing.** Both a custom privileged standard scheme
   (`protocol.registerSchemesAsPrivileged([{scheme, privileges: {standard: true, secure: true,
   supportFetchAPI: true}}])` + `protocol.handle`) and localhost HTTP share correctly.
   **`supportFetchAPI: true` is part of the working privilege set** — the fetch smoke consumes it.
3. **The Neo popup pattern works under real origins.** `window.open()` — issued main-thread by
   `Neo.Main.windowOpen()` — joins the same worker when allowed via
   `setWindowOpenHandler({action: 'allow'})`, with the popup materialized as an Electron-managed
   `BrowserWindow`. The same-origin `window.opener` relationship survives.
4. **Default secure flags cost nothing.** Sharing works with `contextIsolation: true` + sandbox on.
5. **Sharing is partition-scoped — positively observed.** With origin, URL, and preload held
   constant, a window in a different session partition reports a FRESH worker (count 1, both
   partition controls, both sharing origins). All harness windows must live in ONE partition.
6. **Protocol handlers are session-specific.** `protocol.handle('app', …)` on the default session
   does NOT serve a `persist:` partition — its windows cannot load `app://` at all until the
   handler is registered on that session too (`session.fromPartition(...).protocol.handle`).
   Reinforces finding 5 operationally: one partition, one registration.

## Electron-runner gotchas (recorded for the next spike author)

- Electron's default `window-all-closed` behavior quits the app the first time a multi-phase
  harness destroys its windows — subscribe `app.on('window-all-closed', () => {})` or every phase
  after the first silently never runs (exit code 0, no output).
- When merging `BrowserWindow` options, strip `webPreferences` from the extra object BEFORE
  spreading the rest — a plain `...extra` after the `webPreferences` block replaces the whole
  object and silently drops the preload (v0.0.1 of this spike lost its partition-control report
  channel exactly this way).
