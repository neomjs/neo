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
npm start            # prepares missing dev assets, then boots the harness window (UI only)
npm run start:brain  # the window + the SUPERVISED Agent OS (Arm B — see below)
npm run smoke        # boot + popup + shared-worker + clean-runtime evidence, JSON verdict
npm run smoke:brain  # the full verdict incl. the Brain leg (up + clean teardown + no orphan)
```

Prerequisite for the Brain legs: a fresh per-clone `ai/config.mjs` — if the orchestrator child
crashes at import with `ERR_INVALID_ARG_TYPE` on a config path, run
`npm run prepare -- --migrate-config` from the repo root (the instance config drifted behind the
template; the daemon's own freshness assert fires too late to catch this because the Orchestrator
singleton constructs at module import).

## The Brain rides supervised (Arm B — the hosting-spike verdict)

The Electron main supervises system-Node children: the orchestrator daemon (which supervises the
rest of the Agent OS through its own `ProcessSupervisorService`) and the fleet HTTP transport the
Fleet Manager window consumes (`devFleetServer.mjs`, `POST /fleet`). Arm A (in-process) is
falsified in this repo by the native-ABI split: `better-sqlite3` builds for one ABI, and the
shared `node_modules` must keep serving the system-Node dev loop (the verdict + reproduction
probe live on the hosting-spike ticket).

**`start:brain` is ATTACH-OR-OWN (the dev-machine safety contract).** The orchestrator performs
single-instance TAKEOVER (on boot it SIGTERMs any PID in its PID file) and its supervisor REAPS
foreign listeners on supervised singleton ports — a second organism beside a live canonical Brain
is never safe, and never useful (the Fleet Manager should manage the REAL fleet). So the product
boot resolves the live state through the config SSOT and:

- **attach** — a live orchestrator is detected (PID file + command check): the harness starts
  only what is missing (the fleet transport, when `:8083` is not already listening) and on quit
  stops exactly what IT started. The canonical Brain is never touched.
- **own** — nothing is up (the fresh-machine / packaged-app shape): the harness starts the whole
  organism on the default canonical-layout paths, and quitting tears the full tree down.

**The smoke runs a fully ISOLATED organism instead.** `brain.mjs#buildBrainProfile` binds every
mutable path the spawned tree consumes under `harness/.brain/smoke/` (orchestrator data dir, the
graph sqlite, Chroma persist dir, fleet instance root, backup target, REM run-state), moves every
exercised listener to a runtime-allocated port, and gates every other lane OFF via its config
env switch (dev server, Neural Link, embed/message daemons, mlx/ollama/lms, swarm heartbeat, the
sync + enrichment lanes, deployment-state bridge). The matrix is EXECUTABLE, not documentation:
`resolveBrainPaths` re-resolves the leaves through `ai/config.mjs` itself under the profile env,
and the smoke fails on any leaf escaping the isolation root — by FILESYSTEM IDENTITY (ancestor
symlinks resolved on both sides), asserting what the tree actually consumes, not what the profile
intended.

**Readiness is service readiness, never PID existence.** The daemon writes its PID file before
config load and `Orchestrator.start()`, so the up-gates are: the orchestrator's own
`[Orchestrator] Started.` poll-loop marker, the isolated Chroma actually serving on its allocated
port, a real `{method: 'listAgents'}` wire round-trip against the fleet transport — and the smoke
re-runs that same verb FROM THE RENDERER (the AC's "window reaches the fleet transport"). Boot
promises reject deterministically on spawn error or early exit.

**Teardown owns the whole process TREE.** Children spawn `detached` into their own process group;
stop is group-SIGINT → bounded grace → group-SIGKILL, settled on group-empty, and the smoke's
exit additionally requires the unforced path plus released listeners. SIGINT (not SIGTERM) is the
graceful rung by measurement: the chromadb npm wrapper ignores group-SIGTERM indefinitely but
exits on SIGINT in milliseconds, and both supervised entries register the two identically. Every
smoke exit path (will-quit, verdict, timeout net, unhandled-rejection net) runs the teardown; a
crashed run's process groups are recorded in `.brain/smoke/run-state.json` WITH an ownership
token (the leader's entry script), cleared on clean stop, and swept on the next smoke boot only
after the recorded identity re-verifies — a bare PGID is an observation, not ownership. The same
rule governs attach: `fleetServing` requires the `listAgents` wire envelope, and a foreign
listener squatting the fleet port fails the product boot closed instead of reading as a Brain.

## Packaging (E6 — the unsigned leg)

```bash
cd harness
npm run dist    # pack.mjs stages the organism, electron-builder emits dist-artifacts/*.zip
```

The artifact is ONE double-clickable app (unsigned — signing/notarization is release-line,
operator-owned; never repo tooling) wrapping the ORGANISM: the renderer's source graph derived
from the contentPolicy allowlist (one authority — a new allowlist prefix ships automatically),
the Brain tree (`ai/`, minus examples and the not-yet-enabled temporal-summary daemon), a
GENERATED dependency manifest (this repo declares only devDependencies, so the runtime closure
is derived from the bundled trees' bare imports and pinned to repo-declared versions —
fail-loud on any undeclared import), and pack-time-fresh instance configs. **No checkout
instance overlay ever ships:** any `config.mjs` with a `config.template.mjs` sibling — the
top-level `ai/config.mjs` AND every per-server MCP overlay, all of which can carry hand-edited
operator credentials — is excluded by DERIVATION, a post-copy assertion fails the build on any
survivor, and the stage regenerates fresh template-defaults instances (which also means the
packaged first boot never writes into the possibly read-only resources dir).

**A packaged double-click BOOTS THE BRAIN by default** — Finder supplies no environment, so the
product default is the supervised organism; `NEO_HARNESS_BRAIN=0` is the explicit opt-out (a
checkout stays opt-in — see `brain.mjs#resolveBrainMode`). What it boots is
`brain.mjs#buildPackagedBrainEnv` — THE packaged product profile: every mutable path (graph
sqlite, Chroma, WAL, embed/message daemon state, backups, fleet root) under the per-user data
root, plus the artifact's honest lane closure — each gated lane names a resource the bundle does
not carry (webpack, git-checkout semantics, external model servers, cwd-relative writers); the
embed + message organism lanes run. A packaged own-mode boot FAILS CLOSED when a checkout Brain
already holds the Chroma port (the coexistence guard — the spawned supervisor would otherwise
reap it).

**The packaged runtime arm:** Brain children run on the bundled Electron via
`ELECTRON_RUN_AS_NODE`; the staged `node_modules` is rebuilt for Electron's ABI at pack time
(`@electron/rebuild`, scoped to the stage — never the checkout, which must keep serving the
system-Node dev loop). **A rebuild failure FAILS THE BUILD** — ABI-compat of a system-Node build
under electron-as-node is not a guaranteed contract, and a silently mis-built native is a broken
artifact. Shebang children (the chroma CLI) resolve `node` through the organism's `shims/`
entry, which execs the bundled binary — a stranger's machine carries no Node.

Verification: `NEO_HARNESS_SMOKE=1 "dist-artifacts/mac-arm64/Neo Harness.app/Contents/MacOS/Neo Harness"`
— no Brain env, deliberately: the smoke proves the double-click default and runs the EXACT
product profile (`profileMode: 'packaged-product'` in the verdict), shifted only in COORDINATES
(allocated ports + a throwaway data root) so a dev box's live Brain is never touched. The
checkout smoke keeps the fully isolated dev profile (`checkout-isolated`).
Known unsigned-leg limitation: a quarantined zip (browser download) may App-Translocate;
`xattr -d com.apple.quarantine` or moving the app clears it — signing (E7) dissolves this.

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
6. **Bare tool commands in the supervised tree resolve via PATH — guarantee it.** The
   orchestrator's `chroma` task works under `npm run` by accident of npm's `.bin` prepending; a
   packaged shell has no npm in the chain. `startBrainChild` prepends the repo's
   `node_modules/.bin` explicitly.
7. **Loopback bind family matters.** Chroma binds `localhost` → `::1` on macOS while the fleet
   transport binds `127.0.0.1`; probing the wrong family reads a listening server as dead. Port
   probes take an explicit `host`.
8. **The chromadb npm wrapper ignores SIGTERM** (measured: 40s+ alive after group-SIGTERM) but
   exits on SIGINT within milliseconds. Group-SIGINT is the graceful teardown rung; a cold Chroma
   start on a fresh persist dir takes ~a minute, so the smoke settles on chroma-listening before
   quitting and the Brain smoke's safety net allows 240s.
