# harness/ — the Agent Harness's native vessel

The Electron packaging root (#13033 under epic #13377): boots the harness app inside the shell
ADR 0034 specifies. This directory wraps explicitly allowlisted Body source and generated assets —
it never becomes a source hemisphere (ADR 0020 §3: own `package.json`, no source-tree mixing).

**Why a top-level `harness/` (operator decision, 2026-07-10):** Neo Body apps run WITHOUT a
harness — `apps/agentos` stays a plain web app (dev server, browser, no Electron required), and
this directory is the optional native embodiment wrapped around it: the ADR 0020 "Agent Harness"
made installable. It names the ROLE, not the vessel technology. The harness UI source never moves
in here (it lives in `apps/`); the Brain never moves in here (it lives in `ai/`). Over the ADR
0034 E-leaf arc this root accumulates the whole vessel: main process, preload capability contract,
Brain lifecycle glue, window policy, packaging/signing, updater, tray.

**Scope shipped here (slices 1–2 of the #13033 build plan):** the shell skeleton — privileged
`app://` origin serving an explicit renderer-content allowlist from the repo root, one harness
window, the fail-closed content/window/navigation/permission posture — and the multi-window proof:
a renderer-initiated `window.open` popup materializes through `setWindowOpenHandler` and joins the
SAME shared workers. **Not here yet:**
Agent-OS hosting (the in-process vs child-process topology spike is the next slice; ADR 0034 §2.1
frames it, #13033's intake carries the four-falsifier decision gate), tray/app lifecycle (E8),
packaging/signing (E6/E7).

## Run

```bash
cd /path/to/neo      # repo root
npm install         # source-mode runtime + canonical theme builder dependencies
cd harness
npm install
npm start          # prepares missing dev assets, then boots the harness window
npm run smoke      # boot + popup + shared-worker + clean-runtime evidence, JSON verdict
```

## Why the window loads DEV MODE (operator decision, 2026-07-10)

The harness window loads the zero-build SOURCE app (`app://neo/apps/agentos/index.html`), not
`dist/production`: the Neural Link's possession depth — `inspect_class`, `get_method_source`,
`patch_code` — needs real source ESM; minified bundles destroy it. The document root is the repo
root (the same source graph the dev http origin serves, narrowed to the shell's explicit renderer
allowlist), so required `dist/development/css/*` stays reachable. Recorded in ADR 0034 §2.6.

## Smoke verdict (recorded run — Electron 43.1.0 · Chromium 150.0.7871.47 · darwin)

| Observable | Value | Meaning |
|---|---|---|
| `boot1` | 253ms, 109 neo-nodes, `neo-viewport-1` | slice-1 AC: the shell boots the built-from-source app on `app://` |
| `boot2` | 251ms, 109 neo-nodes, `neo-viewport-2` | the popup boots the same app |
| `popupMaterialized` | true | renderer `window.open` → real `BrowserWindow` via the fail-closed handler |
| `sharedHeapEvidence` | true | the popup's viewport id CONTINUES the sequence — the ONE App worker numbered both windows |
| `requiredAssetsReady` | true | every boot-critical CSS/JSON/font/logo asset resolved on the packaged origin |
| `rendererErrors` | `[]` | no renderer error or unhandled rejection was observed |

## Field notes (hard-won; the next slice author reads these first)

1. **Hidden windows never mount.** Neo's main-thread delta application rides
   `requestAnimationFrame`; a `show: false` window boots its workers but the DOM stays empty.
   Smoke windows stay visible; `backgroundThrottling: false` guards occlusion.
2. **`webContents.executeJavaScript` wedges when issued DURING the module-graph boot** (never
   settles, no error, renderer alive). Post-boot calls work. The reliable observation channel is
   preload + IPC (`shell-boot-report`) — the ADR 0034 spike's reporting pattern.
3. **Renderer `window.open` needs a user gesture.** The popup blocker denies gesture-less opens
   (isolated-world attempts return `null`); `executeJavaScript(..., userGesture: true)` grants
   one. Real product popouts originate from real clicks, so this only affects automation.
4. **Never match `URL.origin` for custom schemes in the main process** — Node's parser returns
   `'null'` (it knows nothing of the renderer's privileged registration). The §2.3.2 allowlist
   matches `protocol` + `host`.
5. **`window-all-closed` default quits Electron.** The skeleton keeps quit-on-close deliberately
   (no tray yet); E8 lands ADR 0034 §2.1.5's suppress + tray + hide-never-destroy semantics.
