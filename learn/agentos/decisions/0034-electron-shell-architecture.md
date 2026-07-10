# ADR 0034: Electron Shell Architecture — Process Model, Window Topology, Security Posture, Distribution

> Architectural Decision Record settling the six load-bearing questions every Electron-shell leaf
> inherits (epic #13377): how the main process hosts the Brain and what its window/app lifecycle
> means for the organism, under which constraints Chromium shares Neo's SharedWorkers across OS
> windows (verified empirically, not asserted), the fail-closed renderer security contract, the
> dock/OS-window fusion mapping, the distribution channel, and dev/prod parity. Everything here is
> **additive on ADR 0020 §3** (the shell decision itself — Electron, decided) and consumes the
> landed window-manager substrate as boundaries — it reopens nothing.

| Attribute | Value |
|---|---|
| **Status** | Proposed — 2026-07-10 (#14786; pending human merge gate per ADR-0005 lifecycle). |
| **Author** | @neo-opus-vega (Vega, Claude Fable 5, Claude Code) — #13377 epic steward. |
| **Resolves** | #14786 — the #13377 gate leaf: settle the shared shell questions ONCE, decision-record tier, before the E-leaves multiply incoherently (the ADR-0029 settle-shared-questions pattern). |
| **Parent epic** | #13377 (*Electron shell — package + host the Agent OS*) under #13012 (Agent Harness). |
| **Depends on** | **ADR 0020** (the embodiment vessel — extended, never superseded; §3 fixes the shell decision, the in-process target + child-process fallback, source-tree discipline, and PATs-Brain-side); **ADR 0029** (docking design — its §2.1 state-class table, window-manager boundaries, and semantic-restore rules are consumed, not reopened). |
| **Connects to** | #13033 (build-root leaf, owner @neo-opus-ada — its live Contract Ledger is consumed AS-IS; §5 maps the refinement leaves that follow it) · #13025 / #13028 (landed window-manager leaves, consumed as boundaries) · #13446 (NL window ops — gains an Electron backend per §2.4) · #14793 (native-shell UX spec — consumes §2.1's lifecycle decisions) · #14230 (fork-path onboarding — stays the contributor door per §2.5). |
| **Empirical anchor** | In-tree spike `spikes/14786-electron-sharedworker/` (merged with this record): pinned Electron 43.1.0 · Chromium 150.0.7871.47 · Node 24.18.0 · darwin 25.5.0; raw committed run: `spike-results.json`. Reproduce: `npm install && npm start`. Re-run trigger: every Electron major bump BEFORE adoption; owner: the §5 E2 leaf owner. (The pre-review branch `spike/14786-electron-sharedworker` is superseded by the in-tree copy.) |
| **Implemented by** | the §5 decomposition — one Contract-Ledgered leaf per row, mapped on the #13377 epic; each cites its section here as upstream contract. |
| **Anti-anchor for** | **file:// harness loading** (falsified: kills worker sharing, §2.2); **a second window manager** (Electron materializes, the Neo window substrate owns semantics); **serialize-and-recreate across BrowserWindows** (components exist once in the shared App-Worker heap — ADR 0029); **a Brain-daemon fork** (one lifecycle owner, §2.1); **per-window session partitions** (§2.2); **credential or token bytes in renderer-readable state** (§2.3); **auto-spawning OS windows on perspective restore** (ADR 0029's rule, re-bound §2.4). |

---

## 1. Context

ADR 0020 §3 decided the shell (operator, 2026-06-12): **Electron — always Chromium + always
Node.js**, Tauri retired, Agent OS **in-process in the Electron main as target** with
**child-process supervision as the sanctioned fallback**, and web-served mode staying the dev
convenience. The #13377 epic added the decisive boundary (operator correction, 2026-06-15):
**Electron is the shell only — it does not own the additional windows.** Multi-window remains
Chromium popups on Neo's own window substrate (browser-native → Electron-agnostic → the web
version stays alive).

What no record settles is everything a *packaged* shell adds on top of those two anchors: the exact
constraints under which Chromium shares Neo's SharedWorkers across OS windows (the whole
architecture rides this — asserted often, verified never), what last-window-close means when the
shell hosts the Brain, the renderer security contract, how `window.open` popups materialize, what
artifact a stranger downloads, and how the packaged boot path stays identical to `npm run dev`.
Six questions, named by #14786; made implicitly per-leaf, they diverge — the access-ban lesson
(disconnected surfaces, no coherent shell) repeats at the OS level. This record settles them once.

## 2. Decision

### §2.1 Process model — the Brain rides in the shell, one lifecycle owner (Q1)

**Settled frame (carrying ADR 0020 §3, not re-deciding it):** the packaged app boots the whole
organism — the Electron main process *hosts* the Agent OS (orchestrator + MCP servers) in-process
as the target topology, or *supervises it as a child process* as the sanctioned fallback. Which arm
wins is **#13033's spike outcome and stays that leaf's property**; this ADR binds what is true in
EITHER arm:

1. **One lifecycle owner.** The main process is the single authority for Brain start/stop/restart —
   whether that means in-process module lifecycles or child-process supervision. No second
   supervisor, no daemon fork: a packaged install and an externally-run daemon topology never
   manage the same Brain state concurrently. Attach-to-external stays a **dev-mode** capability
   (§2.6), never a packaged-app default.
2. **Restart affordances settle-or-reject.** Runtime MCP-server restarts resolve or reject every
   pending promise (the #13015 lifecycle guardrail, carried from ADR 0020 §4) — no orphaned
   in-flight calls across a restart, in either hosting arm.
3. **Data-root resolution moves to the app tier.** The Memory Core owns SQLite/Chroma paths under
   `.neo-ai-data/`; a packaged app resolves that root against the OS user-data directory
   (`app.getPath('userData')`), a repo checkout resolves it repo-relative. The resolution seam is
   ONE injectable path — Brain services never hardcode either root.
4. **Port discipline.** Brain-side listeners (NL WebSocket, MCP HTTP, the fleet dev transport) bind
   loopback-only in the packaged app (§2.3) with ports chosen/managed by the lifecycle owner, so
   two installs (or install + dev repo) fail loudly at boot instead of silently cross-talking.
5. **App lifecycle: the organism outlives its windows.** The shell suppresses Electron's default
   quit-on-`window-all-closed` (the spike documents that default silently emptying a multi-window
   app). Closing the last window leaves the Brain running with the tray as its handle; **Brain
   teardown happens ONLY on explicit quit** (tray/app-menu). The cockpit window itself is hidden
   on close, never destroyed while the app runs: SharedWorker lifetime is client-scoped, so
   destroying the last window would kill the App-Worker heap (stores, undo state, live UI) while
   the tray still claims the institution is running. The UX surface of these semantics (tray
   triad, first-run, window defaults) is #14793's spec; the SEMANTICS are bound here.

**Falsifier:** if #13033's spike shows in-process hosting cannot satisfy settle-or-reject restarts
(e.g. MCP server state cannot be torn down cleanly in-process), the child-process arm becomes the
recorded topology — this section's five bindings survive unchanged; only the arm flips.

### §2.2 Window topology — the SharedWorker constraint set, verified (Q2)

Neo boots **separate SharedWorker identities per role** — App, VDom, Data, Canvas (as configured)
— and same-origin windows share EACH of those identities. That per-worker sharing is what the
multi-window architecture rides, and inside Electron it survives **only under specific, now-named
constraints** — established empirically (in-tree spike `spikes/14786-electron-sharedworker/`,
raw run committed as `spike-results.json`; method + full matrix in its README):

| Constraint | Empirical basis |
|---|---|
| **C1 — Real origin required, with the full privilege set.** The harness MUST be served from a standard-scheme origin: a custom privileged scheme (`app://` via `protocol.registerSchemesAsPrivileged([{scheme, privileges: {standard: true, secure: true, supportFetchAPI: true}}])` + `protocol.handle`) or localhost HTTP. **`supportFetchAPI: true` is normative** — `data.Store` `url` seeds and every fetch-consuming surface depend on it (the spike's working privilege set includes it; the fetch smoke consumes it). **`file://` loading silently isolates every window's workers** — the app renders, boots, and shares nothing. | `file2win`/`filepopup` = ISOLATED; `app2win`/`http2win` = SHARED; `fetchsmoke` = `fetchOk: true` |
| **C2 — One session partition, positively verified.** SharedWorker scope is partition-bound: with origin, page URL, and preload held constant and ONLY the partition varied, the second window reports a FRESH worker (count 1) — on both sharing origins. Every harness window lives in the default (or one named) partition. | `partitionapp` + `partitionhttp` = both windows report (1, 1) |
| **C3 — The popup path is preserved.** `window.open()` — issued on the main thread by `Neo.Main.windowOpen()` — joins the same workers when the shell allows it via `setWindowOpenHandler({action: 'allow', overrideBrowserWindowOptions})`. The popup materializes as an Electron-managed `BrowserWindow`; the same-origin `window.opener` relationship survives. | `apppopup`/`httppopup` = SHARED |
| **C4 — Secure defaults cost nothing.** All of the above holds under `contextIsolation: true`, sandbox on, `nodeIntegration: false` — worker topology and the §2.3 security posture are decoupled. | entire matrix ran on default secure flags |
| **C5 — Worker identity is `(origin, URL)` per worker.** The packaged origin must be *stable* across windows and app restarts (one canonical `app://` host + path scheme), or windows resolve different identities for the SAME worker role. | phase-scoped worker URLs isolate by construction |
| **C6 — Protocol handlers are session-specific.** `protocol.handle` on the default session does not serve other partitions; a window in a `persist:` partition cannot even LOAD `app://` without its own registration. Operationally this reinforces C2: one partition, one registration. | the `partitionapp` control required `session.fromPartition(...).protocol.handle` before window B loaded at all |

**The seam, restated under the shell-only boundary — who owns what:**

| Concern | Owner (current source) | In the shell |
|---|---|---|
| Popup creation | `Neo.Main.windowOpen()` (main thread) owns the actual `window.open(url, name, features)` call; App-Worker code (e.g. `dashboard.Container.openWidgetInPopup()`) reaches it as a remote method | unchanged — the same call, materialized per C3 |
| Window observation + choreography | `Neo.manager.Window` (App Worker) — connected-window registry, geometry, `getWindowAt(x, y)`, with `main.addon.WindowPosition` | unchanged — gains precision via the §2.4 enhancement points |
| Detach semantics | `DockZoneModel.detachItem()` — catalog/tree state only | unchanged |

The shell's contribution is exactly two enhancement classes: **materialization** (the
`setWindowOpenHandler` path turning the main-thread `window.open` into a real `BrowserWindow`
without browser popup ceremony) and **OS chrome control** (exact spawn-at-position, native
move/resize events, frame options — the enhancement points #13025/#13028/#13030 named and
#13446's NL window ops consume). The shell never grows placement policy, z-order arbitration, or
window state of its own.

**Falsifier:** a future Electron major changing SharedWorker scoping or protocol/session semantics
— the in-tree spike is the re-run gate (§6); the E2 leaf owner runs it on every major bump before
adoption.

### §2.3 Security posture — fail-closed everywhere, credentials never renderer-readable (Q3)

1. **Renderer flags:** `contextIsolation: true`, sandbox **on**, `nodeIntegration: false` for every
   window — including popups (enforced centrally in the `setWindowOpenHandler` override). §2.2 C4
   proves this costs the architecture nothing; there is no worker-topology excuse for weakening it.
2. **Fail-closed window policy:** `setWindowOpenHandler` ALLOWS only same-origin harness URLs (an
   explicit origin/path allowlist) and DENIES everything else; `will-navigate` denies any
   off-origin navigation in every window. The allow path IS the C3 popup contract; everything else
   fails closed.
3. **Permissions and content:** a `setPermissionRequestHandler` that denies by default with a
   named, minimal allowlist (empty until a leaf needs one — additions amend this section); a
   restrictive CSP served by the `app://` handler for every document; no remote content inside
   harness windows.
4. **IPC discipline:** one minimal `contextBridge` preload exposing named, capability-shaped
   affordances — never `ipcRenderer` raw, never Node. Main-process handlers validate
   `event.senderFrame` origin against the packaged origin before acting. The Brain-side
   `FleetControlBridge` allowlist choke-point (`FLEET_WIRE_METHODS`) is the in-repo model for this
   capability-allowlist discipline.
5. **Brain endpoints bind loopback TCP** (`127.0.0.1`), never `0.0.0.0`, never unix sockets —
   renderer `WebSocket`/`fetch` cannot reach unix sockets, and the NL/MCP endpoints must stay
   reachable from the harness renderer and local tooling alike. When the Brain rides in-app,
   endpoint auth uses a **per-boot token whose bytes never enter renderer-readable state**: the
   preload/main capability attaches it to outbound requests internally; the renderer invokes named
   capabilities and never sees the secret. Loopback alone does not authenticate against other
   local processes.
6. **Credential custody (ADR 0020 §3, re-bound and made honest):** PATs live Brain-side. The
   TARGET ingress is a shell-owned surface where credential bytes flow preload/main → Brain and
   never enter App-Worker state. The CURRENT `Accounts` add-agent path — a PAT collected in an
   App-Worker form field and submitted once through the registry bridge (ephemeral, fail-closed,
   never stored Body-side) — is **transitional drift against this posture**, acceptable only in
   the dev-server topology; the packaged shell migrates credential entry to the shell-owned
   surface as part of the §5 E5 leaf. The Add-Peer **curated-intent boundary** (Body submits
   `{harnessType, id, repo/account facts}` — never command/args/env) is the design contract that
   surface implements.

**Falsifier:** any leaf needing a renderer capability the preload cannot express through a named,
allowlisted intent amends THIS section first (ADR-0005 lifecycle) — it never flips a window to
`nodeIntegration: true`, widens the window allowlist, or moves secret bytes into renderer state
as a leaf-local decision.

### §2.4 Dock/OS-window fusion — same semantics, richer vessel (Q4)

`detachItem` → OS window today spawns a browser popup; **inside the shell it stays exactly that
call chain** — App-Worker intent → `Neo.Main.windowOpen()` → `window.open` — materialized by
Electron per §2.2 C3 as a real `BrowserWindow`. The mapping, named:

| Layer | Owner | In the shell |
|---|---|---|
| Detach semantics (`detachItem`, catalog membership, placement hints) | `dockZone.v1` + ADR 0029 §2.1 | unchanged — worker-owned shared truth |
| Popup issuing | `Neo.Main.windowOpen()` (main thread), reached as a remote method | unchanged — same API, same events |
| Window observation / God-View | `Neo.manager.Window` + `main.addon.WindowPosition` | unchanged |
| Materialization | browser popup ceremony | `setWindowOpenHandler` → `BrowserWindow` (no popup blocker, no chrome-strip ceremony), under the §2.3.2 allowlist |
| OS affordances | unavailable | exact spawn-at-position, native move/resize events, frame control — consumed via the #13446 NL window-op backend and the #13025/#13028/#13030 enhancement points |

The **embodiment vessel contract (ADR 0020) is extended, never superseded**: a docked pane
detaches into a real OS window and returns as the same live heap object (ADR 0029's
no-serialize-and-recreate anti-anchor re-bound here). **ADR 0029's semantic-restore rule carries
over explicitly:** perspective restore re-enters items at their semantic `fallbackTarget` and
NEVER auto-spawns OS windows — the shell's removal of popup ceremony makes auto-spawn *possible*,
which is exactly why the prohibition is restated here rather than left implicit. What changes in
the shell is vessel *quality* — frameless windows, precise placement, native drag events — never
vessel *semantics*.

**Falsifier:** if a fusion leaf finds `BrowserWindow` materialization breaking an ADR 0029 §2.1
state-class boundary (e.g. render-projection state needing main-process persistence), that leaf
amends ADR 0029 and this section together, before implementation.

### §2.5 Distribution — signed installers for strangers, the repo for contributors (Q5)

1. **Artifact:** platform-native installers — macOS `dmg` (signed + notarized), Windows `exe`
   (signed), Linux `AppImage` — built by an electron-builder-class pipeline from the packaging
   root (own `package.json`, wraps BUILT Body + Brain; ADR 0020 §3 source-tree discipline). "The
   stranger downloads the harness" = one double-clickable artifact; **the `npx` bootstrap and the
   #14230 fork-path stay the contributor door** — the two doors never merge.
2. **Signing reality is a release-line concern:** cert provisioning/notarization credentials are
   operator-owned (human-only, like the merge gate); CI produces unsigned artifacts for
   verification, the release pipeline signs. No leaf embeds signing material in repo tooling.
3. **Two-speed updates, decoupled by design:** the SHELL updates rarely (Electron/Chromium security
   cadence — autoUpdater-class mechanism, its own channel); the ORGANISM (harness app + Brain)
   ships with the shell version it was packaged with and updates by shipping a new package. No
   self-mutating installed app in v1: partial in-place organism updates (pulling new Brain/Body
   into an installed shell) are explicitly deferred — they reintroduce the drift matrix
   (shell×organism version pairs) that packaged-together avoids, and nothing in H1 needs them.
4. **Update cadence ≠ repo release cadence:** packaged releases cut from the release line
   (`main`), on their own schedule, versioned independently of npm releases.

**Falsifier:** if H1 adoption data shows install-base staleness hurting (users stuck on old
organisms), §2.5.3's deferral is the named revisit point — the two-speed split is the decision,
partial updates are the recorded alternative.

### §2.6 Dev/prod parity — one harness root, two origins, identical topology (Q6)

1. **One boot path:** `npm run dev` (webpack-serve, localhost HTTP) and the packaged app
   (`app://`, §2.2) load the **same built harness app root** — #13033's build-root is the
   substrate; this section binds it. No packaged-only entry file, no dev-only worker wiring:
   `neo-config` + worker URLs resolve identically relative to either origin.
2. **Parity is achievable BECAUSE of C1:** both origins are standard-scheme with fetch support
   (`supportFetchAPI` normative — JSON seeds via `data.Store` `url` behave identically), so every
   SharedWorker identity the app boots (App/VDom/Data/Canvas) shares the same way dev↔packaged.
   The spike's http/app rows agreeing — including the fetch smoke — is the empirical parity floor.
3. **Web-served mode stays the dev convenience + goodie** (ADR 0020 §3) — the shell never becomes
   a dev-loop dependency; nothing in `src/` or `apps/` may import from or feature-detect the
   packaging root (the hemisphere discipline, enforced at review).
4. **Brain parity:** dev attaches to externally-run daemons (today's topology); packaged hosts per
   §2.1. The seam that makes both true is §2.1.3's injectable data-root + §2.1.4's managed ports —
   the SAME Brain code, two lifecycle owners, never both at once.

**Falsifier:** any leaf introducing a `process.versions.electron` branch inside `src/` or `apps/`
violates this section on its face — shell awareness lives in the packaging root and
`main.addon.*` enhancement points only.

## 3. Consequences

- Every #13377 E-leaf cites its §2 section as upstream contract; changing a §2 decision amends
  this ADR first (ADR-0005 lifecycle), never lands leaf-local.
- #13033 implements against §2.1/§2.6 **as its live Contract Ledger stands** and records the
  hosting-arm outcome; §5 maps the refinement leaves that follow it.
- The `app://` scheme handler (with C1's full privilege set + §2.3.3 CSP), the materialization +
  window-policy bridge, and the preload capability contract each become one leaf (§5).
- The in-tree spike is the regression gate: **the E2 leaf owner re-runs it on every Electron major
  bump** before adoption (§2.2 falsifier; committed raw run + pinned versions make drift visible).
- Web portability is structurally guaranteed: because the shell only materializes and decorates,
  removing it leaves a working web app — the boundary that keeps the future web version alive.

## 4. Prior art & rejected shapes

- **Tauri / WebKitGTK** — retired at ADR 0020 (worker-topology determinism + Node-in-process beat
  binary-size aesthetics).
- **Electron owning the windows** — rejected (operator, 2026-06-15); would fork window management
  into a web arm and a shell arm and kill web portability.
- **`file://` + `loadFile()` packaging** — the naive Electron default, **empirically falsified**
  (§2.2 C1): boots, renders, silently loses worker sharing.
- **Localhost HTTP as the packaged origin** — works (spike), rejected operationally: port
  collisions, firewall prompts, and any local process gaining harness-origin access for free.
- **Unix sockets for Brain endpoints** — unreachable from renderer WebSocket/fetch; loopback TCP
  + non-renderer-readable per-boot token instead (§2.3.5).
- **Serialize-and-recreate popout state** — rejected at ADR 0029; re-bound here because Electron
  makes it *tempting* (BrowserWindows feel ownable from main).
- **Renderer-readable bearer tokens** — rejected during review of this record: a token the
  renderer can read still crosses the boundary; capability-internal attachment replaced it.

## 5. Decomposition — the E-leaf gate (map lives on the #13377 epic)

| Leaf | Scope | Upstream contract |
|---|---|---|
| E1 — build root (#13033, exists, owner @neo-opus-ada) | **as its live Contract Ledger stands:** packaging root + main entry, hosting-arm spike, Agent-OS boot, first harness window, popup windows joining the shared workers, and the window-management bridge enhancement points | §2.1, §2.6 (frame only — the leaf's ledger is consumed unchanged) |
| E2 — origin + scheme hardening (post-E1) | `app://` privileged scheme with C1's FULL privilege set (`supportFetchAPI` normative), stable origin, CSP delivery, the fetch/JSON smoke, spike re-run ownership | §2.2 C1/C5/C6, §2.3.3, §2.6 |
| E3 — window policy + materialization hardening (post-E1) | fail-closed `setWindowOpenHandler` allowlist, `will-navigate` denial, secure-flag enforcement on popups, OS-chrome enhancement points, #13446 NL backend | §2.2 C3, §2.3.1–.4, §2.4 |
| E4 — Brain lifecycle service | start/stop/restart with settle-or-reject, port management, data-root injection | §2.1.1–.4 |
| E5 — preload capability contract + credential ingress | the one `contextBridge` surface + allowlist, sender validation, token custody, the shell-owned credential surface retiring the transitional Accounts path | §2.3.4–.6 |
| E6 — packaging + signing pipeline | electron-builder config, per-platform artifacts, unsigned-CI/signed-release split | §2.5 |
| E7 — update channel | shell autoUpdater wiring, two-speed policy | §2.5.3 |
| E8 — app lifecycle + tray | `window-all-closed` suppression, explicit-quit-only teardown, hide-not-destroy cockpit close, tray handle — the #14793 UX spec implements against it | §2.1.5 |

E2–E8 are filed on demand under #13377 (epic bodies never enumerate subs — ADR 0020 §6); each
carries its own Contract Ledger and cites this table row. E2/E3 refine what E1 lands — they never
reopen its ledger.

## 6. Verification

- **Empirical:** in-tree spike `spikes/14786-electron-sharedworker/` — 9-phase matrix (two-window
  + popup paths × file/app/http origins, TWO one-variable partition controls on sharing origins
  with both windows reporting, the `app://` fetch smoke), pinned Electron 43.1.0 / Chromium
  150.0.7871.47 / Node 24.18.0 / darwin 25.5.0, raw run committed (`spike-results.json`).
  Re-run owner + trigger: the E2 leaf owner, every Electron major bump before adoption.
- **Authority chain:** ADR 0020 §3 (shell decision, hosting arms, source discipline, PATs) ·
  #13377 epic body (shell-only boundary, operator 2026-06-15; cites this record as design
  authority) · ADR 0029 §2.1 (state classes, window-manager boundaries, semantic restore) ·
  `Neo.Main.windowOpen` / `Neo.manager.Window` / `DockZoneModel.detachItem` ownership verified
  at source during review cycle 2.
- **AC mapping (#14786):** six questions → §2.1–§2.6, each with named constraints + falsifiers;
  anti-anchor row carries the three ticket-named minimums (no serialize-and-recreate, no second
  window manager, no Brain-daemon fork) plus the review-added ones; the SharedWorker constraint
  set verified in the committed spike, not asserted; #13377 cites this ADR (updated with the
  resolving PR, status-honest as Proposed until merge).
