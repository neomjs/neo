# ADR 0034: Electron Shell Architecture — Process Model, Window Topology, Security Posture, Distribution

> Architectural Decision Record settling the six load-bearing questions every Electron-shell leaf
> inherits (epic #13377): how the main process hosts the Brain, under which constraints Chromium
> shares Neo's one SharedWorker heap across OS windows (verified empirically, not asserted), the
> renderer security stance, the dock/OS-window fusion mapping, the distribution channel, and
> dev/prod parity. Everything here is **additive on ADR 0020 §3** (the shell decision itself —
> Electron, decided) and consumes the landed window-manager substrate as boundaries — it reopens
> nothing.

| Attribute | Value |
|---|---|
| **Status** | Proposed — 2026-07-10 (#14786; pending human merge gate per ADR-0005 lifecycle). |
| **Author** | @neo-opus-vega (Vega, Claude Fable 5, Claude Code) — #13377 epic steward. |
| **Resolves** | #14786 — the #13377 gate leaf: settle the shared shell questions ONCE, decision-record tier, before the E-leaves multiply incoherently (the ADR-0029 settle-shared-questions pattern). |
| **Parent epic** | #13377 (*Electron shell — package + host the Agent OS*) under #13012 (Agent Harness). |
| **Depends on** | **ADR 0020** (the embodiment vessel — extended, never superseded; §3 fixes the shell decision, the in-process target + child-process fallback, source-tree discipline, and PATs-Brain-side); **ADR 0029** (docking design — its §2.1 state-class table and window-manager boundaries are consumed, not reopened). |
| **Connects to** | #13033 (build-root spike leaf, owner @neo-opus-ada — carries the *hosting-topology* spike; §2.1 frames it, never pre-empts it) · #13025 / #13028 (landed window-manager leaves, consumed as boundaries) · #13446 (NL window ops — gains an Electron backend per §2.4) · #14230 (fork-path onboarding — stays the contributor door per §2.5) · Discussion #10119 (Neural Link thesis). |
| **Empirical anchor** | Spike branch `spike/14786-electron-sharedworker` @ `8bf8a915d` — the §2.2 SharedWorker constraint matrix (Electron v43.1.0, macOS, 2026-07-10). Reproduce: `cd spikes/14786-electron-sharedworker && npm install && npm start`. |
| **Implemented by** | the §5 decomposition — one Contract-Ledgered leaf per row, mapped on the #13377 epic; each cites its section here as upstream contract. |
| **Anti-anchor for** | **file:// harness loading** (falsified: kills the shared heap, §2.2); **a second window manager** (Electron materializes, `Neo.manager.Window` owns choreography); **serialize-and-recreate across BrowserWindows** (components exist once in the SharedWorker heap — ADR 0029); **a Brain-daemon fork** (one lifecycle owner, §2.1); **per-window session partitions** (§2.2); **credentials in the renderer** (PATs never transit the browser — ADR 0020 §3). |

---

## 1. Context

ADR 0020 §3 decided the shell (operator, 2026-06-12): **Electron — always Chromium + always
Node.js**, Tauri retired, Agent OS **in-process in the Electron main as target** with
**child-process supervision as the sanctioned fallback**, and web-served mode staying the dev
convenience. The #13377 epic added the decisive boundary (operator correction, 2026-06-15):
**Electron is the shell only — it does not own the additional windows.** Multi-window remains
Chromium popups managed by `Neo.manager.Window` (browser-native → Electron-agnostic → the web
version stays alive).

What no record settles is everything a *packaged* shell adds on top of those two anchors: the exact
constraints under which Chromium shares one SharedWorker across OS windows (Neo's whole
architecture rides this — asserted often, verified never), the renderer security flags, how
`window.open` popups materialize, what artifact a stranger downloads, and how the packaged boot
path stays identical to `npm run dev`. Six questions, named by #14786; made implicitly per-leaf,
they diverge — the access-ban lesson (disconnected surfaces, no coherent shell) repeats at the OS
level. This record settles them once.

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

**Falsifier:** if #13033's spike shows in-process hosting cannot satisfy settle-or-reject restarts
(e.g. MCP server state cannot be torn down cleanly in-process), the child-process arm becomes the
recorded topology — this section's four bindings survive unchanged; only the arm flips.

### §2.2 Window topology — the SharedWorker constraint set, verified (Q2)

The one-heap multi-window architecture survives inside Electron **only under specific, now-named
constraints** — established empirically (spike branch `spike/14786-electron-sharedworker`
@ `8bf8a915d`, Electron v43.1.0; method + raw matrix in its README):

| Constraint | Empirical basis |
|---|---|
| **C1 — Real origin required.** The harness MUST be served from a standard-scheme origin: a custom privileged scheme (`app://` via `protocol.registerSchemesAsPrivileged([{scheme, privileges: {standard: true, secure: true}}])` + `protocol.handle`) or localhost HTTP. **`file://` loading silently isolates every window's SharedWorker** — the app renders, boots, and has no shared heap. | `file2win`/`filepopup` = ISOLATED; `app2win`/`http2win` = SHARED |
| **C2 — One session partition.** SharedWorker scope is partition-bound; every harness window lives in the default (or one named) partition. Per-window partitions sever the heap. | `partition` control = no cross-partition join |
| **C3 — The popup path is preserved.** `window.open()` from a renderer — the `Neo.manager.Window` pattern — joins the same heap when the shell allows it via `setWindowOpenHandler({action: 'allow', overrideBrowserWindowOptions})`. The popup materializes as an Electron-managed `BrowserWindow`; the same-origin `window.opener` relationship survives. | `apppopup`/`httppopup` = SHARED |
| **C4 — Secure defaults cost nothing.** All of the above holds under `contextIsolation: true`, sandbox on, `nodeIntegration: false` — worker topology and the §2.3 security posture are decoupled. | entire matrix ran on default secure flags |
| **C5 — Worker identity is `(origin, URL)`.** The packaged origin must be *stable* across windows and app restarts (one canonical `app://` host + path scheme), or windows resolve different worker identities. | phase-scoped worker URLs isolate by construction |

**The seam, restated under the shell-only boundary:** `Neo.manager.Window` keeps the God-View —
placement intent, `getWindowAt(x, y)`, drag choreography, popup lifecycles (`#8164`→`#9498`
lineage). Electron's contribution is exactly two enhancement classes: **materialization** (the
`setWindowOpenHandler` path turning `window.open` into a real `BrowserWindow` without the browser
popup-blocker ceremony) and **OS chrome control** (exact spawn-at-position, move events, frame
options — the enhancement points #13025/#13028/#13030 named and #13446's NL window ops consume).
The shell never grows placement policy, z-order arbitration, or window state of its own.

**Decision within C1:** the packaged app serves the built harness over a **custom privileged
scheme** (working name `app://`), not a localhost HTTP server — no port to collide, no firewall
prompt, no other-local-process access to the harness origin, and offline-clean. Localhost HTTP
remains the dev-mode origin (§2.6); the spike proves both share identically, so the choice is
operational, not architectural.

**Falsifier:** a future Electron major changing SharedWorker scoping (e.g. site-isolation changes
re-keying workers) — the spike is the regression harness; §5 binds re-running it on every Electron
major bump.

### §2.3 Security posture — isolated renderers, loopback Brain, credentials never cross (Q3)

1. **Renderer flags:** `contextIsolation: true`, sandbox **on**, `nodeIntegration: false` for every
   window — including popups (enforced centrally in the `setWindowOpenHandler` override). §2.2 C4
   proves this costs the architecture nothing; there is no worker-topology excuse for weakening it.
2. **Preload surface:** one minimal `contextBridge` API, capability-shaped and allowlisted —
   the renderer gets named shell affordances (window placement enhancement, lifecycle intents),
   never `ipcRenderer` raw, never Node. The existing Brain-side pattern is the model: the
   `FleetControlBridge` allowlist choke-point (`FLEET_WIRE_METHODS`) already demonstrates
   capability-allowlist discipline for exactly this class of boundary.
3. **Brain endpoints bind loopback TCP** (`127.0.0.1`), never `0.0.0.0`, never unix sockets —
   renderer `WebSocket`/`fetch` cannot reach unix sockets, and the NL/MCP endpoints must stay
   reachable from the harness renderer and local tooling alike. When the Brain rides in-app
   (§2.1), endpoints additionally carry a **per-boot bearer token** injected into the harness via
   the preload (never persisted to renderer-readable storage): loopback alone does not
   authenticate against other local processes.
4. **Credentials (PATs) stay Brain-side** (ADR 0020 §3, re-bound here): they never transit the
   renderer, never appear in preload-exposed state, never echo through bridge responses. The
   Add-Peer curated-intent boundary (Body submits `{harnessType, id, repo/account facts}` only —
   never command/args/env) is the shipped precedent this posture generalizes.

**Falsifier:** any leaf needing a renderer capability the preload cannot express through a named,
allowlisted intent amends THIS section first (ADR-0005 lifecycle) — it never flips a window to
`nodeIntegration: true` as a leaf-local decision.

### §2.4 Dock/OS-window fusion — same semantics, richer vessel (Q4)

`detachItem` → OS window today spawns a browser popup; **inside the shell it stays exactly that
call** — `window.open` through `Neo.manager.Window` — materialized by Electron per §2.2 C3 as a
real `BrowserWindow`. The mapping, named:

| Layer | Owner | In the shell |
|---|---|---|
| Detach semantics (`detachItem`, catalog membership, placement hints) | `dockZone.v1` + ADR 0029 §2.1 | unchanged — worker-owned shared truth |
| Popup lifecycle + God-View | `Neo.manager.Window` | unchanged — same API, same events |
| Materialization | browser popup ceremony | `setWindowOpenHandler` → `BrowserWindow` (no popup blocker, no chrome-strip ceremony) |
| OS affordances | unavailable | exact spawn-at-position, native move/resize events, frame control — consumed via the #13446 NL window-op backend and `main.addon.WindowPosition` enhancement points |

The **embodiment vessel contract (ADR 0020) is extended, never superseded**: a docked pane
detaches into a real OS window and returns as the same live heap object (ADR 0029's
no-serialize-and-recreate anti-anchor re-bound here). What changes in the shell is vessel
*quality* — frameless windows, precise placement, native drag events — never vessel *semantics*.

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
2. **Parity is achievable BECAUSE of C1:** both origins are standard-scheme; the worker topology
   (App/VDom/Data/Canvas on one SharedWorker heap) is byte-identical dev↔packaged. The spike's
   http/app rows agreeing is the empirical parity floor.
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
- #13033 implements against §2.1/§2.6 and records the hosting-arm outcome; its spike scope is
  unchanged by this record.
- The `app://` scheme handler, the `setWindowOpenHandler` materialization path, and the preload
  contract each become one leaf (§5).
- The spike branch is a permanent regression harness: **every Electron major bump re-runs it**
  before adoption (§2.2 falsifier).
- Web portability is structurally guaranteed: because the shell only materializes and decorates,
  removing it leaves a working web app — the boundary that keeps the future web version alive.

## 4. Prior art & rejected shapes

- **Tauri / WebKitGTK** — retired at ADR 0020 (worker-topology determinism + Node-in-process beat
  binary-size aesthetics).
- **Electron owning the windows** — rejected (operator, 2026-06-15); would fork window management
  into a web arm and a shell arm and kill web portability.
- **`file://` + `loadFile()` packaging** — the naive Electron default, **empirically falsified**
  (§2.2 C1): boots, renders, silently loses the shared heap.
- **Localhost HTTP as the packaged origin** — works (spike), rejected operationally: port
  collisions, firewall prompts, and any local process gaining harness-origin access for free.
- **Unix sockets for Brain endpoints** — unreachable from renderer WebSocket/fetch; loopback TCP
  + per-boot token instead (§2.3.3).
- **Serialize-and-recreate popout state** — rejected at ADR 0029; re-bound here because Electron
  makes it *tempting* (BrowserWindows feel ownable from main).

## 5. Decomposition — the E-leaf gate (map lives on the #13377 epic)

| Leaf | Scope | Upstream contract |
|---|---|---|
| E1 — build root (#13033, exists) | packaging root, main entry, hosting-arm spike, boot | §2.1, §2.6 |
| E2 — origin + scheme server | `app://` privileged scheme, `protocol.handle` over the built root, stable origin | §2.2 C1/C5, §2.6 |
| E3 — window materialization bridge | `setWindowOpenHandler` path, secure-flag enforcement on popups, OS-chrome enhancement points, #13446 NL backend | §2.2 C3, §2.3.1, §2.4 |
| E4 — Brain lifecycle service | start/stop/restart with settle-or-reject, port management, data-root injection | §2.1 |
| E5 — preload capability contract | the one `contextBridge` surface + allowlist | §2.3.2 |
| E6 — packaging + signing pipeline | electron-builder config, per-platform artifacts, unsigned-CI/signed-release split | §2.5 |
| E7 — update channel | shell autoUpdater wiring, two-speed policy | §2.5.3 |

Leaves E2–E7 are filed on demand under #13377 (epic bodies never enumerate subs — ADR 0020 §6);
each carries its own Contract Ledger and cites this table row.

## 6. Verification

- **Empirical:** spike branch `spike/14786-electron-sharedworker` @ `8bf8a915d` — 7-phase
  SharedWorker matrix (two-window + popup paths × file/app/http origins + partition control),
  Electron v43.1.0, default secure flags, results in its README. Re-run on Electron major bumps.
- **Authority chain:** ADR 0020 §3 (shell decision, hosting arms, source discipline, PATs) ·
  #13377 epic body (shell-only boundary, operator 2026-06-15) · ADR 0029 §2.1 (state classes,
  window-manager boundaries) — all consumed, none reopened.
- **AC mapping (#14786):** six questions → §2.1–§2.6, each with named constraints + falsifiers;
  anti-anchor section = the attribute-table row (all three ticket-named minimums present:
  no serialize-and-recreate, no second window manager, no Brain-daemon fork);
  SharedWorker constraint set verified in the spike branch, not asserted; epic body update to cite
  this ADR follows on the resolving PR.
