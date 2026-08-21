import ActivityStream                           from './ActivityStream.mjs';
import AddAgentForm                             from './AddAgentForm.mjs';
import AgentDetail                              from './AgentDetail.mjs';
import Button                                   from '../../../../src/button/Base.mjs';
import CatchUpPane                              from './CatchUpPane.mjs';
import Component                                from '../../../../src/component/Base.mjs';
import Container                                from '../../../../src/container/Base.mjs';
import DockLayoutAdapter                        from '../../../../src/dashboard/DockLayoutAdapter.mjs';
import DockMotionSignal                         from '../../../../src/dashboard/DockMotionSignal.mjs';
import DockPerspectiveStore                     from '../../../../src/dashboard/DockPerspectiveStore.mjs';
import DockPreviewProducer                      from '../../../../src/dashboard/DockPreviewProducer.mjs';
import DockProjectionReconciler                 from '../../../../src/dashboard/DockProjectionReconciler.mjs';
import DockService                              from '../../../../src/ai/client/DockService.mjs';
import DockZoneModel                            from '../../../../src/dashboard/DockZoneModel.mjs';
import FleetCockpitController                   from './FleetCockpitController.mjs';
import FleetGrid                                from './FleetGrid.mjs';
import FleetRoster                              from '../../store/FleetRoster.mjs';
import MemoriesPane                             from './MemoriesPane.mjs';
import OperatorMailbox                          from './OperatorMailbox.mjs';
import ViewerWakeFeed                           from '../../store/ViewerWakeFeed.mjs';
import WakeRoutePane                            from './WakeRoutePane.mjs';
import StateProvider                            from '../../../../src/state/Provider.mjs';
import cockpitDockDocument                      from './cockpitDockDocument.mjs';
import cockpitPresetCollection                  from './cockpitPresets.mjs';
import {createDockTearOutHandlers}              from '../../../../src/dashboard/DockTearOut.mjs';
import {DAEMON_FAULT_STATES, deriveSpineBanner} from './spineBanner.mjs';
import {describeViewerWakeTelltale}             from './viewerWakeTelltale.mjs';
import {mapFleetSessionHealth}                  from './sourceHealth.mjs';
import {previewToOperation}                     from '../../../../src/dashboard/dockPreviewContract.mjs';
import '../../../../src/tab/Container.mjs'; // registers the `tab-container` ntype the dock projection emits for tab zones

/**
 * The liveness re-poll cadence (ms). Slow enough that the cockpit is not a load generator against
 * the fleet bridge, fast enough that a transport death is named while the operator is still looking
 * at the surface that died.
 * @type {Number}
 */
/**
 * Brain daemon states the shell lifecycle owner can report. Mirrors `BRAIN_STATES` in
 * `harness/appLifecycle.mjs` — the hemisphere boundary forbids importing it (apps code stays
 * shell-agnostic), so the vocabulary is duplicated here and anything outside it is unknown → silent.
 * @type {String[]}
 */
const BRAIN_HEALTH_STATES = Object.freeze(['degraded', 'running', 'stopped']);

const LIVENESS_POLL_INTERVAL = 15000;

/**
 * The bounded window (ms) a single liveness read gets before it is treated as a degrade.
 *
 * Deliberately shorter than {@link LIVENESS_POLL_INTERVAL}: the window must close before the next
 * tick, or a hung read would still be holding its surface's slot when the cadence comes round.
 * @type {Number}
 */
const LIVENESS_READ_TIMEOUT = 10000;

/**
 * Longest safe reason rendered on the spine banner — a transport error can carry an entire response
 * body, and this line is one row of shell chrome, not a log viewer.
 * @type {Number}
 */
const MAX_DEGRADED_REASON_LENGTH = 120;

/**
 * @summary Reduces an untrusted transport failure to one safe, operator-readable clause.
 *
 * A transport error is peer/network-authored text this shell republishes into operator-visible
 * chrome, so it is redacted and bounded before it can ever render: credential-bearing forms are the
 * realistic payload of a failing authenticated request (a bearer header or PAT echoed back in an
 * error body), and the scheme rule must precede the `key: value` rule or `Authorization: Bearer x`
 * matches `authorization`, stops at the space, and republishes the secret intact.
 * @param {*} error Untrusted failure — an Error, a string reason, or anything else.
 * @returns {String|null} A safe single-line clause, or `null` when the cause is unknowable (the
 *     banner then renders its generic copy rather than inventing a cause).
 * @private
 */
function toSafeDegradedReason(error) {
    const raw = typeof error === 'string' ? error : error?.message;

    if (typeof raw !== 'string' || !raw.trim()) return null;

    const safe = raw
        .replace(/\b(?:authorization\s*[:=]\s*)?bearer\s+[^\s,;)]+/gi, 'authorization=[redacted]')
        .replace(/\b(authorization|token|secret|password|pat|credential)\s*[:=]\s*[^\s,;)]+/gi, '$1=[redacted]')
        .replace(/\bgh[pousr]_[A-Za-z0-9_]+/g, '[redacted-token]')
        .replace(/\bglpat-[A-Za-z0-9_-]+/g, '[redacted-token]')
        .replace(/\s+/g, ' ')
        .trim();

    return safe ? safe.slice(0, MAX_DEGRADED_REASON_LENGTH) : null
}

/**
 * @summary Bounds one liveness read: it may fail, it may never hang.
 *
 * A hung read is not a slow read — it is a read that never answers, and an unbounded one poisons
 * every mechanism built on top of it. The in-flight latch releases in a `.finally()`, so a promise
 * that never settles holds its surface's slot **forever**: every later tick is suppressed, the
 * surface stays last-known-live, and the liveness owner silently stops being live — the original
 * defect, rebuilt from the other side. Bounding the read is what makes the latch safe to hold.
 *
 * The loser of the race is not aborted (the wire has no abort seam yet). It does not need to be:
 * the generation fence already makes a late arrival unable to write. This only guarantees the
 * SLOT comes back.
 * @param {Promise} read
 * @param {Number} timeout ms
 * @returns {Promise} settles with the read, or rejects with a timeout error inside `timeout` ms
 * @private
 */
function boundedRead(read, timeout, onWireSettled) {
    let timerId;

    // the WIRE's own settle — independent of who wins the race. The accumulation bound counts this,
    // because a timed-out wrapper does not free the socket the read is still holding.
    read.then(onWireSettled, onWireSettled);

    return Promise.race([
        read.finally(() => clearTimeout(timerId)),
        new Promise((resolve, reject) => {
            timerId = setTimeout(() => reject(new Error(`fleet read exceeded ${timeout}ms`)), timeout)
        })
    ])
}

/**
 * Recent fleet activity for the fixture-fed stream — the live A2A / PR / lane adapters
 * are the sibling leaves; this seeds the §01 activity zone with representative events (newest last;
 * ActivityStream reverses to newest-first).
 * @type {Object[]}
 */
const FIXTURE_ACTIVITY = [
    {type: 'lane-activity',   agentId: 'neo-fable-clio',occurredAt: '2026-07-05T07:15:00.000Z', payload: {text: 'Clio → CrossWindowDragTarget docking, awaiting cross-family'}},
    {type: 'a2a-activity',    agentId: 'neo-opus-ada',  occurredAt: '2026-07-05T08:30:00.000Z', payload: {text: 'Ada → control-plane restart actuator merged'}},
    {type: 'pr-activity',     agentId: 'neo-opus-vega', occurredAt: '2026-07-05T09:40:00.000Z', payload: {text: 'Vega merged — FM fleet grid + health bar'}},
    {type: 'pr-activity',     agentId: 'neo-gpt',       occurredAt: '2026-07-05T10:11:00.000Z', payload: {text: 'Euclid opened a PR — roadmap cornerstone-4 hygiene'}},
    {type: 'review-activity', agentId: 'neo-opus-vega', occurredAt: '2026-07-05T10:26:00.000Z', payload: {text: 'Vega → APPROVED — transaction archive Architectural Pillar'}},
    {type: 'a2a-activity',    agentId: 'neo-opus-vega', occurredAt: '2026-07-05T10:52:00.000Z', payload: {text: 'Vega → AGENT:* [lane-claim] harness-UI shell + nav'}}
];

/**
 * @summary The Fleet keeper-view — the FM cockpit's default mission-control surface (design SSOT §01),
 * composed as a LIVE DOCK PROJECTION: the fleet zone (a density-ranked card roster + the
 * scale-to-a-glance health bar) over the live activity stream in the SSOT's ~1.55fr / 1fr split,
 * with the secondary chrome panes (agent detail, perspectives) auto-hidden onto the right edge rail.
 *
 * The layout SSOT is the committed `neo.harness.dockZone.v1` document ({@link #dockModel}, seeded
 * from {@link module:cockpitDockDocument}); the visible tree is
 * {@link Neo.dashboard.DockLayoutAdapter}'s projection of it. The commit loop follows the proven
 * dashboard-dock pattern — a clean reducer / view-sync split:
 * - {@link #applyDockZoneOperation} is the **reducer**: a pure `DockZoneModel.applyOperation` over
 *   the current document — splitter drags, cross-zone tab drops and NL-driven operations all
 *   funnel through it;
 * - {@link #onDockZoneDocumentChange} is the **view-sync**: it stores the committed document and
 *   reconciles one tick deferred (the committing splitter must finish its own `onDragEnd` before
 *   its retired shell destroys it — use-after-destroy otherwise; `isDestroyed` guards teardown).
 *
 * Reconciliation retains existing pane and tab-chrome identities. Runtime pane state still lives
 * on THIS owner, never only on instances: {@link #resolveDockComponentRef} materializes genuinely
 * absent panes from held state ({@link #gridAdapterState} / {@link #streamAdapterState} /
 * {@link #streamEvents}), and the panes stay layout-blind per the docking design's pane contract —
 * ordinary configs only, no dock wiring reaches them.
 *
 * The roster data layer is ONE {@link AgentOS.store.FleetRoster} Store of
 * {@link AgentOS.model.FleetAgent} records, hosted by THIS view's `state.Provider` (`stores`
 * block — the provider is the sharing scope and survives every re-projection; store classes are
 * never singletons). The provider `autoLoad`s the honestly-labelled JSON sample seed, the
 * projected {@link FleetGrid} binds the instance via `bind: {store: 'stores.fleetRoster'}`, and
 * {@link #loadRoster} re-points it at the running fleet when the registry bridge wires up. The
 * activity zone composes {@link ActivityStream} → EventChip the same way ({@link #loadActivity}).
 *
 * @class AgentOS.view.fleet.FleetCockpit
 * @extends Neo.container.Base
 */
class FleetCockpit extends Container {
    static config = {
        /**
         * @member {String} className='AgentOS.view.fleet.FleetCockpit'
         * @protected
         */
        className: 'AgentOS.view.fleet.FleetCockpit',
        /**
         * @member {String} ntype='fm-fleet-cockpit'
         * @protected
         */
        ntype: 'fm-fleet-cockpit',
        /**
         * The dock motion/token contract (`--dock-transition-*`, reveal keyframes, splitter
         * cursors) lives in the `Neo.dashboard.Container` theme file — the projected dock tree is
         * plain containers, so per-class loading never fetches it; the consuming workspace
         * declares the dependency (the projection root carries the matching `.neo-dashboard`
         * scope class itself).
         * Theme files this view needs that its own namespace does not pull in. `SpineBanner` and
         * `ViewerWakeTelltale` are here because both are plain component slots
         * (`fleet-spine-banner`, `viewer-wake-telltale`) rather than their own classes — nothing
         * requests their namespaces, so without these entries the stylesheets are built and never
         * loaded, and the chrome renders unstyled. Any future class-less slot with its own SCSS
         * needs the same registration.
         * @member {String[]} additionalThemeFiles=['Neo.dashboard.Container','AgentOS.view.fleet.SpineBanner','AgentOS.view.fleet.ViewerWakeTelltale']
         */
        additionalThemeFiles: ['Neo.dashboard.Container', 'AgentOS.view.fleet.SpineBanner', 'AgentOS.view.fleet.ViewerWakeTelltale'],
        /**
         * @member {String[]} baseCls=['fm-fleet-cockpit']
         */
        baseCls: ['fm-fleet-cockpit'],
        /**
         * The roster-source admission mode. `sample` is the zero-call cold-first-run authority: an
         * empty first bridge answer cannot erase the honestly labelled bundled fleet. `selected`
         * means the operator/product composition explicitly chose the wired source, so even an
         * empty first snapshot is authoritative. A populated snapshot promotes this mode while
         * {@link #rosterWired} keeps every later snapshot (including empty) authoritative.
         *
         * Non-reactive on purpose: this is an ingress policy, not render state. Instance config and
         * `Neo.overwrites` may select it without introducing a hidden hardware/product constant.
         * @member {'sample'|'selected'} rosterSourceMode='sample'
         */
        rosterSourceMode: 'sample',
        /**
         * The B4÷C2 composition root: catches each card's `lifecycleIntent` and the whole-fleet
         * "▶ Start fleet" click, driving both through the C2 adapter to honest per-card
         * round-trip state. See {@link AgentOS.view.fleet.FleetCockpitController}.
         * @member {Neo.controller.Component} controller=FleetCockpitController
         */
        controller: FleetCockpitController,
        /**
         * The bounded connect window (ms) an opened detail vessel gets before the
         * `failed-timeout` edge fires and the admission rolls back to docked. Boundedness is the
         * contract — an admission may fail, it may never hang. Non-reactive class-config default:
         * `Neo.overwrites`-eligible and instance-configurable (witnesses pass a short window at
         * creation).
         *
         * Calibration: a healthy heap-join measures ~1.3s born→windowed, but a loaded/cold seat
         * legitimately exceeds 10s — twice-observed live: a 10s window flapped the same pop-out
         * a 20s window let survive, minutes apart on one seat. 20s ≈ 15x healthy headroom — the
         * cold-provider-beats-default class, the same widening shape as the Memory Core
         * embed-write canary. A genuinely dead connect still rolls back at the bound.
         * @member {Number} detailVesselConnectWindowMs=20000
         */
        detailVesselConnectWindowMs: 20000,
        /**
         * The cockpit-level roster host — ONE provider-owned {@link AgentOS.store.FleetRoster}
         * instance (autoLoaded from the JSON sample seed) that the grid + health bar bind; the
         * provider is the sharing scope, never a store singleton.
         * @member {Object} stateProvider
         */
        stateProvider: {
            module: StateProvider,
            data  : {
                /**
                 * The per-viewer wake-push truths, stamped by the composition root from the
                 * stream consumer's OWN observations. `stream` carries the
                 * consumer's liveness vocabulary verbatim (`alive: true|'unknown'` + reason);
                 * `catchUp` keeps failed ≠ empty ≠ fresh as three states by construction, with
                 * `state: null` as the honest absence of any observation.
                 */
                viewerWake: {
                    stream : {alive: 'unknown', reason: 'wake stream not started', capturedAt: null},
                    catchUp: {state: null, at: null, pending: null}
                }
            },
            stores: {
                fleetRoster: {
                    autoLoad: true,
                    module  : FleetRoster
                },
                viewerWakeFeed: {
                    module: ViewerWakeFeed
                }
            }
        },
        /**
         * Vertical stack: the control bar over the dock projection (which owns the fleet-over-
         * activity split per the committed document).
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
         * @reactive
         */
        layout: {ntype: 'vbox', align: 'stretch'}
        // `items` is built in construct() — not here — so each projection can carry the
        // instance-bound applyDockZoneOperation + onDockZoneDocumentChange callbacks the resize
        // commit loop needs.
    }

    /**
     * The live committed dock-zone document — the layout SSOT this view projects from. Seeded
     * from {@link module:cockpitDockDocument}; advanced by {@link #onDockZoneDocumentChange} on
     * each committed operation.
     * @member {Object|null} dockModel=null
     */
    dockModel = null
    /**
     * The serialized deferred projection queue. Each commit captures its document snapshot and
     * chains behind the prior staged transaction, so rapid splitter/preset changes cannot overlap
     * shells or resolve absent panes from a newer document.
     * @member {Promise|null} refreshPromise=null
     * @protected
     */
    refreshPromise = null
    /**
     * The named preset library — a {@link Neo.dashboard.DockPerspectiveStore} over the seeded
     * workspace-scope collection ({@link module:cockpitPresets}). The store is the preset SSOT;
     * {@link #dockModel} stays the LIVE layout SSOT — presets are snapshots the switch restores
     * from, never live-bound mirrors.
     * @member {Neo.dashboard.DockPerspectiveStore|null} perspectiveStore=null
     * @protected
     */
    perspectiveStore = null
    /**
     * The last refused preset switch, rendered in the control bar (fail-closed VISIBLY: a
     * refused restore must never look like a no-op). Cleared by the next successful switch.
     * @member {String|null} presetError=null
     * @protected
     */
    presetError = null
    /**
     * The cross-zone drop producer instance (pointer → placement grammar), owned per cockpit.
     * @member {Neo.dashboard.DockPreviewProducer|null} dockPreviewProducer=null
     * @protected
     */
    dockPreviewProducer = null
    /**
     * Monotonic read-fence for the Brain-health pulls — an immediate first read, an interval tick,
     * and a timed-out-but-still-pending read can coexist; only the newest generation may write, so
     * a late answer can never overwrite newer truth.
     * @member {Number} brainHealthReadGeneration=0
     * @protected
     */
    brainHealthReadGeneration = 0
    /**
     * Unsettled Brain-health reads on the wire — counted like {@link #streamReadInFlight}, capped at
     * {@link #maxReadsInFlight} by the liveness tick, and released only on the read's OWN settle
     * (never on the bounded-race timeout), so hung pulls can never accumulate unboundedly while a
     * timed-out slot still frees the surface to keep re-reading.
     * @member {Number} brainHealthReadInFlight=0
     * @protected
     */
    brainHealthReadInFlight = 0
    /**
     * The retained diagnosis pointer for the DAEMON surface — the "why" the spine banner names
     * instead of generic copy. Per-surface like {@link #gridDegradedReason}: a transport sibling
     * must never be able to supply or silence this cause. Written only by {@link #applyBrainHealth},
     * from the lifecycle owner's retained cause (its detail, falling back to its source key).
     * @member {String|null} daemonDegradedReason=null
     * @protected
     */
    daemonDegradedReason = null
    /**
     * Brain daemon health for the spine banner's third surface — `'running'|'degraded'|'stopped'`,
     * mirroring the shell lifecycle owner's state vocabulary.
     *
     * **`null` by default, and that silence is deliberate rather than a placeholder.** Defaulting to
     * `'running'` would have the banner assert "the organism is fine" on the strength of never
     * having asked — the fabrication this cockpit's render discipline exists to prevent. `null`
     * renders nothing and claims nothing; `deriveSpineBanner` treats absence as UNKNOWN.
     *
     * Fed by {@link #loadBrainHealth}: a pull on the shell's named health capability riding the
     * liveness cadence — deliberately NOT a main→renderer push channel, and deliberately NOT the
     * per-agent fleet wire, whose process rows answer "which agents run", never "is the organism
     * impaired".
     * @member {String|null} daemonState=null
     * @protected
     */
    daemonState = null
    /**
     * The shell's transport-boot fact for the spine banner's cold-case guidance — the
     * `{phase, mode, up, fleetPort, reason, error}` snapshot the lifecycle owner attaches to the
     * brain-health wire payload (`transport`), or `null` where no shell fact exists (the plain
     * browser, or a shell the pull could not reach — an unreachable shell has no standing to keep
     * asserting one). `null` deliberately renders the browser copy: absence of a shell is not a
     * shell fault. Written only by {@link #applyBrainHealth}; render-only truth like its daemon
     * siblings.
     * @member {Object|null} shellTransport=null
     * @protected
     */
    shellTransport = null
    /**
     * The grid's held `adapterState` — absent-item materialization reads from HERE, so a committed
     * layout change can never reset a live grid back to its sample badge.
     * @member {String} gridAdapterState='sample'
     * @protected
     */
    gridAdapterState = 'sample'
    /**
     * The retained safe reason for the ROSTER surface's current degrade — the honest "why" the spine
     * banner names instead of generic copy. `null` = this surface is either fine, or degraded for a
     * cause the owner never learned (the banner then falls back to generic copy rather than
     * inventing one).
     *
     * PER-SURFACE, not shared, and that is the whole point. One `degradedReason` for two
     * independently-answering surfaces cannot know whose cause it holds: a healthy roster completing
     * after a not-wired activity would clear the ACTIVITY's reason and drop the banner back to
     * "Fleet server offline" — the exact lie the retained reason exists to prevent. Splitting the
     * field makes that unrepresentable instead of merely guarded.
     * @member {String|null} gridDegradedReason=null
     * @protected
     */
    gridDegradedReason = null
    /**
     * Monotonic read counter for the ROSTER surface — the async-ingress fence.
     *
     * {@link #startLiveness} re-drives both seams on a cadence, so two reads of the SAME surface can
     * be in flight at once and complete in any order. Without a fence the LOSER writes last: a slow
     * poll that failed lands after a fast one that succeeded, and the surface regresses `live` →
     * `stale` on strictly older news. Every read captures its generation and drops itself if a newer
     * read started meanwhile — the same latch {@link AgentOS.view.fleet.AgentDetail} uses for the
     * mailbox mirror, which this owner needed and did not have.
     * @member {Number} gridReadGeneration=0
     * @protected
     */
    gridReadGeneration = 0
    /**
     * Count of UNDERLYING roster reads still unresolved on the wire — the accumulation bound.
     *
     * Counts the WIRE, not the wrapper, and that distinction is the whole fix. `boundedRead` settles
     * its own promise on timeout, so releasing the slot there bounded nothing: the underlying read
     * kept hanging while every tick launched another. Five ticks, five hung reads, zero settled.
     * Decremented only when the real read settles, so the cap counts what is actually outstanding.
     *
     * Capped at {@link #maxReadsInFlight} rather than one, because with no abort seam on the wire a
     * single slot cannot both bound accumulation AND survive a permanent hang — one hung read would
     * hold the only slot forever and liveness would stop. A cap above one keeps a recovery probe
     * alive through N-1 hangs while proving the cap never grows.
     *
     * Only {@link #startLiveness} honours it: a direct call (boot, an explicit refresh) is
     * operator-meant and never suppressed.
     * @member {Number} gridReadInFlight=0
     * @protected
     */
    gridReadInFlight = 0
    /**
     * The retained safe reason for the ACTIVITY surface's current degrade. See
     * {@link #gridDegradedReason} for why these are per-surface rather than one shared field.
     * @member {String|null} streamDegradedReason=null
     * @protected
     */
    streamDegradedReason = null
    /**
     * Monotonic read counter for the ACTIVITY surface. See {@link #gridReadGeneration}.
     * @member {Number} streamReadGeneration=0
     * @protected
     */
    streamReadGeneration = 0
    /**
     * Count of UNDERLYING activity reads still unresolved on the wire. See {@link #gridReadInFlight}.
     * @member {Number} streamReadInFlight=0
     * @protected
     */
    streamReadInFlight = 0
    /**
     * The cap on concurrent UNDERLYING reads per surface. Above one so a permanently hung read cannot
     * consume the last slot and stop liveness; small so a hung wire cannot accumulate. Injectable so
     * witnesses pin it instead of inferring it.
     * @member {Number} maxReadsInFlight=2
     * @protected
     */
    maxReadsInFlight = 2
    /**
     * The last authoritative (bridge-sourced) roster snapshot, kept so a slower store load — the
     * JSON sample seed racing {@link #loadRoster} — can never overwrite live truth
     * (see {@link #onRosterStoreLoad}).
     * @member {Object[]|null} lastLiveRows=null
     * @protected
     */
    lastLiveRows = null
    /**
     * The liveness re-poll cadence (ms). Injectable so specs pin a deterministic cadence instead of
     * sleeping on the production one.
     * @member {Number} livenessPollInterval=LIVENESS_POLL_INTERVAL
     * @protected
     */
    livenessPollInterval = LIVENESS_POLL_INTERVAL
    /**
     * The bounded window (ms) ONE liveness read gets before it is treated as a degrade. Boundedness
     * is the contract — a read may fail, it may never hang — the same shape and the same reason as
     * {@link #detailVesselConnectWindowMs}. Injectable so specs pin a short window instead of
     * sleeping on the production one.
     * @member {Number} livenessReadTimeout=LIVENESS_READ_TIMEOUT
     * @protected
     */
    livenessReadTimeout = LIVENESS_READ_TIMEOUT
    /**
     * The liveness re-poll timer id, owned for exact-once teardown. `null` = not running — the
     * cockpit is pre-start or destroyed. It dies with {@link #destroy}; it deliberately SURVIVES
     * pop-out and reattach, because those reparent the AgentDetail and leave this cockpit alive as
     * its holder — a timer stopped there would strand the surface it still speaks for.
     * @member {Number|null} livenessTimerId=null
     * @protected
     */
    livenessTimerId = null
    /**
     * The live per-viewer wake-stream consumer, opened through the bridge's `openWakeStream`
     * capability (direct-browser topology only). `null` is the honest not-wired state — the
     * packaged shell carries no such capability, and a bearer-less bridge's stream is refused
     * server-side and observed as such.
     * @member {Object|null} viewerWakeConsumer=null
     * @protected
     */
    viewerWakeConsumer = null
    /**
     * The exact bridge object {@link #viewerWakeConsumer} was opened from. Custody heals by
     * REPLACING the published bridge (verify-then-promote), so identity comparison per liveness
     * tick is the rebuild trigger — a consumer must never outlive the closure custody it rode.
     * @member {Object|null} viewerWakeBridge=null
     * @protected
     */
    viewerWakeBridge = null
    /**
     * Injectable connection catch-up seam, passed through to the stream consumer's `pollDigest`
     * option when supplied. The browser page holds no plane credential BY DESIGN (mints live in
     * transport closures), so no default exists here: compositions that own a plane-side
     * poll-digest authority (tests, tooling hosts) inject it; every other topology renders the
     * consumer's honest catch-up absence instead of a fabricated drain.
     * @member {Function|null} wakePollDigest=null
     */
    wakePollDigest = null
    /**
     * Re-entrancy latch for {@link #onRosterStoreLoad}: the store fires `load` for its own
     * mutations (mutate → onCollectionMutate → load), so the guard's reconciliation adds/removals
     * re-trigger the very listener that issued them — unlatched, that recursion is a real stack
     * overflow (~524 frames on a 5k-row snapshot).
     * @member {Boolean} reconcilingRoster=false
     * @protected
     */
    reconcilingRoster = false
    /**
     * Set once {@link #loadRoster} has replaced the sample seed with a wired roster payload —
     * subsequent wired payloads MERGE onto the existing records (runtime status refresh) instead of
     * re-seeding the store.
     * @member {Boolean} rosterWired=false
     * @protected
     */
    rosterWired = false
    /**
     * The stream's held `adapterState` — the absent-item source of truth, like
     * {@link #gridAdapterState}.
     * @member {String} streamAdapterState='sample'
     * @protected
     */
    streamAdapterState = 'sample'
    /**
     * The stream's held event list (chronological). Starts as the honestly-labelled fixture;
     * {@link #loadActivity} replaces it with the live feed — absent-item materialization reads it back.
     * @member {Object[]} streamEvents=FIXTURE_ACTIVITY
     * @protected
     */
    streamEvents = FIXTURE_ACTIVITY
    /**
     * The drill-in inspector's selected resident — OWNER-held so a genuinely absent
     * {@link AgentOS.view.fleet.AgentDetail} pane materializes at the current selection (`null` =
     * the honest "select an agent" empty state). The card→detail selection wiring writes it.
     * @member {Object|null} detailRecord=null
     * @protected
     */
    detailRecord = null
    /**
     * The operator's own identity — OWNER-held, resolved from the viewer the ingress boundary binds
     * and feeds the operator-mailbox `record` and the own-inbox mirror `subjectAgentId`. `null` =
     * the pane's honest unwired state until it resolves.
     * @member {Object|null} operatorRecord=null
     * @protected
     */
    operatorRecord = null
    /**
     * Owner-held operator-seat identity posture — `{conflated, seatIdentity}` once the resolved
     * viewer identity has been compared against the roster's registered agent identities, `null`
     * while unresolved or while the roster holds no rows to judge against (unknown renders as
     * unknown, never as a clean bill). A conflated posture means every send through this
     * transport is attributed to an AGENT seat — the pane renders that truth beside the compose
     * surface instead of letting the operator send unknowingly.
     * @member {Object|null} operatorIdentityPosture=null
     * @protected
     */
    operatorIdentityPosture = null
    /**
     * The last operator-inbox mailbox-mirror snapshot — OWNER-held so a re-projected operator-mailbox pane
     * re-materializes at current truth (written by {@link #loadOperatorInbox}). `null` = `unobserved`.
     * @member {Object|null} operatorSnapshot=null
     * @protected
     */
    operatorSnapshot = null
    /**
     * Monotonic read-fence for the operator-inbox mirror reads — a page-request read, a post-compose
     * re-poll, and an interval tick can be in flight at once; only the newest generation may write.
     * @member {Number} operatorInboxReadGeneration=0
     * @protected
     */
    operatorInboxReadGeneration = 0
    /**
     * Latest catch-up response, owner-held so rail re-projection rematerializes from current truth.
     * @member {Object|null} catchUpSnapshot=null
     */
    catchUpSnapshot = null
    /**
     * Latest explicit mark outcome returned by the runtime-only Brain seam.
     * @member {Object|null} catchUpMarkOutcome=null
     */
    catchUpMarkOutcome = null
    /**
     * Monotonic fence: an older source response never overwrites a newer partition/window request.
     * @member {Number} catchUpReadGeneration=0
     */
    catchUpReadGeneration = 0
    /**
     * Latest memories envelope, owner-held so rail re-projection rematerializes from current truth.
     * @member {Object|null} memoriesSnapshot=null
     */
    memoriesSnapshot = null
    /**
     * Read-generation fence for {@link #loadMemories} — a slow older read never overwrites a newer one.
     * @member {Number} memoriesReadGeneration=0
     */
    memoriesReadGeneration = 0
    /**
     * Owner-held CURRENT memories selection — set at REQUEST time, before any await, so the
     * selection survives pane removal/rematerialization while page zero is still pending. The
     * snapshot records the last ACCEPTED truth; this records the requested target. A
     * rematerialized pane receives this as `activeAgent` and therefore reopens on the pending
     * selection (honest "Reading X…" state), never on a stale snapshot's target and never null
     * while a response is in flight.
     * @member {String|null} memoriesTarget=null
     */
    memoriesTarget = null
    /**
     * Owner-held OPEN memories drill-in — `{sessionId, title}` set at REQUEST time, before any
     * await (the {@link #memoriesTarget} discipline one level down), cleared by the pane's close
     * intent. A rematerialized pane receives this as `drillSession` and reopens at the depth the
     * operator was reading — and never a drill they already left.
     * @member {Object|null} memoriesDrillSession=null
     */
    memoriesDrillSession = null
    /**
     * Latest session-memories (drill-in) envelope, owner-held so rail re-projection
     * rematerializes from current truth.
     * @member {Object|null} memoriesDrillSnapshot=null
     */
    memoriesDrillSnapshot = null
    /**
     * Read-generation fence for {@link #loadSessionMemories} — a slow older read never overwrites
     * a newer one.
     * @member {Number} memoriesDrillReadGeneration=0
     */
    memoriesDrillReadGeneration = 0
    /**
     * Latest wake-routes envelope, owner-held so rail re-projection rematerializes from current truth.
     * @member {Object|null} wakeRoutesSnapshot=null
     */
    wakeRoutesSnapshot = null
    /**
     * Read-generation fence for {@link #loadWakeRoutes} — a slow older read never overwrites a newer one.
     * @member {Number} wakeRoutesReadGeneration=0
     */
    wakeRoutesReadGeneration = 0
    /**
     * Detached-detail bookkeeping — `null` while the inspector is docked. While detached it holds
     * `{homeTabsNodeId, homeTabIndex, windowId, windowName, connectTimer}`: the tabs node + EXACT
     * index the reattach restores (`addTab` APPENDS by default — the stored index is the only
     * placement truth), the vessel's `windowId` once it connects (`null` until then), the window
     * name for the close call, and the bounded connect-window timer id. Cleared BEFORE the
     * reattach's async vessel close — the cleared entry is the {@link #onWindowDisconnect}
     * re-entrancy guard.
     * @member {Object|null} detachedDetail=null
     * @protected
     */
    detachedDetail = null
    /**
     * The live {@link AgentOS.view.fleet.AgentDetail} instance handle while it is OUT of this
     * cockpit's projected tree (parked mid-flight or mounted in its vessel window). A
     * popup-mounted pane lives in the vessel's view tree — out of this cockpit's `down()` /
     * `getReference` reach — so every detail consumer routes through {@link #getAgentDetailPane}.
     * `null` while docked (the projection owns the pane); survives one projection cycle past
     * reattach so {@link #resolveDockComponentRef} re-adopts the SAME instance, never a recreation.
     * @member {Neo.container.Base|null} detachedDetailPane=null
     * @protected
     */
    detachedDetailPane = null
    /**
     * The vessel admission state machine's observable state — one word of truth for witnesses,
     * Neural Link reads and the shell affordance:
     * `docked → opening → connected → windowed → reattaching → docked`, with the two terminal
     * failure edges `failed-blocked` (`Neo.Main.windowOpen` returned `false` — the blocked-popup
     * PRIMARY failure path; it never throws) and `failed-timeout` (the bounded connect window
     * expired before the vessel joined the heap). Both failure states roll back through the
     * standard reattach and settle at `docked`; {@link #lastDetailVesselFailure} keeps the
     * post-rollback trace.
     * @member {String} detailVesselState='docked'
     * @protected
     */
    detailVesselState = 'docked'
    /**
     * Generation counter for async-boundary revalidation: incremented at every pop-out start,
     * reattach start and destroy. Every awaited continuation (vessel open, connect URL read,
     * connect timer) re-checks its captured generation and goes inert on mismatch — a reattach or
     * teardown racing an in-flight admission can never act on stale state.
     * @member {Number} detailVesselGeneration=0
     * @protected
     */
    detailVesselGeneration = 0
    /**
     * The last vessel admission failure (`'blocked'` / `'timeout'`), kept after the rollback
     * settles so the failure stays observable once {@link #detailVesselState} returns to
     * `docked`. `null` after a clean detach/reattach cycle.
     * @member {String|null} lastDetailVesselFailure=null
     * @protected
     */
    lastDetailVesselFailure = null
    /**
     * Gesture tear-out bookkeeping, SEPARATE from the click pop-out's {@link #detachedDetail}
     * machinery by design (the composition law the reference host proved): written only
     * POST-COMMIT (the detached terminal), so mid-gesture the click-vessel state machine sees
     * nothing and a cancelled tear-out stays zero-mutation by guard.
     * `tearOutPanes[itemId] = {windowName, windowId}`.
     * @member {Object} tearOutPanes={}
     * @protected
     */
    tearOutPanes = {}
    /**
     * The connect-race partner of {@link #tearOutPanes}: a tear-out vessel window that connected
     * BEFORE its terminal committed (long drags) records here as
     * `tearOutConnects[itemId] = {windowId}`; adoption runs at whichever event lands second.
     * @member {Object} tearOutConnects={}
     * @protected
     */
    tearOutConnects = {}
    /**
     * Live pane instances captured at the detached terminal, keyed by item id — the cockpit's
     * projection DESTROYS un-preserved panes on reconcile, so the instance is captured
     * synchronously before the commit's re-projection runs and parked via the reconciler's
     * `preserveItemIds` until its vessel adopts it. On vessel death the handle feeds
     * {@link #reintegrateTearOutItem}: a window disconnect never destroys the popup's view tree,
     * so the LIVE instance survives and comes home same-instance through
     * {@link #returningTearOutPanes} — destruction is only the no-home fallback terminal.
     * @member {Object} tearOutPaneHandles={}
     * @protected
     */
    tearOutPaneHandles = {}
    /**
     * Exact-position return truth: `tearOutPlacements[itemId] = {tabsNodeId, index}`, captured
     * at the detach terminal BEFORE the commit removes the item (`addTab` appends by default,
     * so this pair is the only way home). A refused detach commit deletes its own capture;
     * {@link #reintegrateTearOutItem} consumes the record exact-once on vessel death.
     * @member {Object} tearOutPlacements={}
     * @protected
     */
    tearOutPlacements = {}
    /**
     * The one-refresh handoff slot for a pane coming HOME on vessel death:
     * {@link #resolveDockComponentRef} consumes it FIRST — before the torn stand-in guard — and
     * returns the LIVE instance into the projection (the {@link #detachedDetailPane} re-adoption
     * precedent, generalized to gesture vessels). Same instance, never a recreation.
     * @member {Object} returningTearOutPanes={}
     * @protected
     */
    returningTearOutPanes = {}
    /**
     * The cockpit-owned dock seam instance — the SAME `execute_dock_operation` path a live
     * agent drives, injected into the tour runner so scripted ops and agent ops are one code
     * path (this holder already implements the full contract: `getDockZoneDocument` /
     * `applyDockZoneOperation` / `onDockZoneDocumentChange`).
     * @member {Neo.ai.client.DockService|null} dockService=null
     * @protected
     */
    dockService = null
    /**
     * The share beat's v1 artifact: the exported perspective record as a JSON string. The v1
     * transfer boundary is the Neural Link property read (an agent on the shared heap reads
     * this member and imports it on another cockpit) — deliberately NOT a UI copy affordance
     * yet, and no backend by design. The import cue consumes it; the e2e leg asserts round-trip
     * fingerprint equality through it.
     * @member {String|null} sharedPerspectiveArtifact=null
     */
    sharedPerspectiveArtifact = null

    /**
     * @summary Seed the layout SSOT and build the toolbar + dock projection as instance items —
     * the projection carries instance-bound commit-loop callbacks, so it cannot live in the
     * static config.
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        me.dockPreviewProducer = Neo.create(DockPreviewProducer);
        me.dockService         = Neo.create(DockService, {});
        me.perspectiveStore    = Neo.create(DockPerspectiveStore, {collection: cockpitPresetCollection()});
        me.dockModel           = me.dockModel || cockpitDockDocument();

        // The gesture tear-out choreography — the epic seam's product consumption: the admission
        // machine holds the one vessel slot; this cockpit supplies the platform seams. The
        // composition law (proved by the reference host): a tear-out NEVER touches the click
        // pop-out's `detachedDetail` machinery mid-gesture — post-commit adoption uses its own
        // bookkeeping, so a cancelled tear-out is zero-mutation by GUARD, and the two vessel
        // pathways converge only through guards (the toggle disables while `detail` is torn;
        // a click-windowed `detail` has no projected tab for the gesture to arm on).
        me.tearOutHandlers = createDockTearOutHandlers({
            applyOperation  : descriptor => me.applyTearOutOperation(descriptor),
            closeVessel     : vessel => me.closeTearOutVessel(vessel),
            onDocumentChange: (document, operation) => {
                let detached = operation?.operation === 'detachItem';

                // capture the live pane SYNCHRONOUSLY before the commit's re-projection can
                // destroy it — the reconciler parks it via preserveItemIds from here on
                detached && me.captureTearOutPane(operation.itemId);
                me.onDockZoneDocumentChange(document);
                // the committed detach is the adoption trigger: the vessel owns the item now
                detached && me.adoptTearOutPane(operation.itemId)
            },
            openVessel: request => me.openTearOutVessel(request)
        });

        // vessel lifecycle: the popped-out inspector reparents on connect, comes home on disconnect
        Neo.currentWorker.on({
            connect   : me.onWindowConnect,
            disconnect: me.onWindowDisconnect,
            scope     : me
        });

        me.add(me.buildWorkspaceItems())
    }

    /**
     * @summary Switches the cockpit to a named preset: the stored record restores through the
     * landed fail-closed path (validate everything before mutating anything — a refused restore
     * leaves the live layout byte-untouched), and a valid document enters the standard commit
     * loop — the switch re-projects FLIP-animated exactly like any committed operation, with
     * reduced-motion collapsing through the token layer by construction.
     *
     * Pane continuity across a switch preserves component identity when the item already exists;
     * genuinely absent surfaces materialize from OWNER-held state ({@link #resolveDockComponentRef}),
     * while the provider-owned roster store never restarts.
     *
     * A perspective that reveals the inspector must not land on the empty state: a cold
     * entry (nothing inspected yet) defaults {@link #detailRecord} to the roster's first resident
     * BEFORE the commit re-projects, so the pane materializes loaded; a prior selection stays the
     * owner-held truth. A live pane updates in place through the select seam's owner accessor.
     * @param {String} name The preset's `perspectiveName` (or technical `layoutId`).
     * @returns {{switched: Boolean, errors: String[]}}
     */
    activatePerspective(name) {
        let me                 = this,
            {document, errors} = me.perspectiveStore.loadPerspective(name);

        if (errors.length) {
            me.presetError = `${name}: ${errors[0]}`;
            me.syncControlBar();
            return {errors, switched: false}
        }

        const revealsInspector = me.isInspectorRevealed(document);

        if (revealsInspector && !me.detailRecord) {
            me.detailRecord = me.resolveFleetRosterStore()?.first() ?? null
        }

        me.presetError = null;
        me.onDockZoneDocumentChange(document);
        revealsInspector && me.detailRecord && me.getAgentDetailPane()?.set({record: me.detailRecord});
        return {errors: [], switched: true}
    }

    /**
     * @summary TRUE only when a document actually REVEALS the inspector: the detail item sits in a
     * tabs node of the tree (absence fails — a valid no-detail document must never read as
     * revealed), is not auto-hidden to the rail, and is its node's active tab or the node's only
     * member. `!items.detail?.autoHidden` alone is TRUE for an absent item, so an unrelated valid
     * perspective would mutate the owner-held selection — the round-1 falsifier.
     * @param {Object} document A committed `dockZone.v1` document.
     * @returns {Boolean}
     */
    isInspectorRevealed(document) {
        const tabsId = DockZoneModel.findContainingTabsId(document, 'detail'),
              node   = tabsId ? document.nodes[tabsId] : null;

        return !!node && !document.items.detail?.autoHidden
            && (node.activeItemId === 'detail' || node.items.length === 1)
    }

    /**
     * @summary The share beat's EXPORT half: serializes the named stored perspective to the v1
     * artifact — one copyable JSON string held on the instance (no backend by design; the e2e
     * leg asserts round-trip fingerprint equality through it).
     * @param {String} name The stored perspective's name.
     * @returns {{exported: Boolean, errors: String[]}}
     */
    exportPerspectiveArtifact(name) {
        let me     = this,
            stored = me.perspectiveStore.getPerspective(name);

        if (!stored) {
            return {errors: [`perspective "${name}" is not stored`], exported: false}
        }

        me.sharedPerspectiveArtifact = JSON.stringify(stored.layout);
        return {errors: [], exported: true}
    }

    /**
     * @summary The share beat's IMPORT half: admits the held JSON artifact back through the
     * store's full validation path (`savePerspective` re-validates via the landed restore
     * gate — a malformed artifact is refused, the live layout untouched).
     * @returns {{imported: Boolean, errors: String[]}}
     */
    importPerspectiveArtifact() {
        let me = this,
            record;

        if (!me.sharedPerspectiveArtifact) {
            return {errors: ['no exported artifact is held'], imported: false}
        }

        try {
            record = JSON.parse(me.sharedPerspectiveArtifact)
        } catch (e) {
            return {errors: [`artifact is not valid JSON: ${e.message}`], imported: false}
        }

        let {saved, errors} = me.perspectiveStore.savePerspective(record, {replace: true});

        saved && me.syncControlBar();
        return {errors, imported: saved}
    }

    /**
     * @summary On construct, bind the fleet surfaces to their live feeds, and guard the roster
     * store's async seed load against clobbering a faster live source.
     * @param {...*} args
     */
    onConstructed(...args) {
        super.onConstructed(...args);

        let me = this;

        me.getReference('fleet-grid')?.store?.on({load: me.onRosterStoreLoad, recordChange: me.onDetailRecordChange, scope: me});

        me.loadActivity();
        me.loadRoster();
        me.loadOperatorIdentity();
        me.startLiveness();
        me.ensureViewerWakeStream()
    }

    /**
     * The owning reducer every dock gesture calls (`DockSplitter.commitResizeSplit`, the
     * cross-zone drop path, NL-driven operations): applies an operation descriptor against the
     * live committed document and returns `DockZoneModel`'s fail-closed `{document, errors}`
     * result. Pure — the view sync happens in {@link #onDockZoneDocumentChange}, which callers
     * invoke on success.
     * @param {Object} descriptor The dock operation descriptor.
     * @returns {{document: Object, errors: String[]}}
     */
    applyDockZoneOperation(descriptor) {
        return DockZoneModel.applyOperation(this.dockModel, descriptor)
    }

    /**
     * The read half of the dock-holder contract (`src/ai/client/DockService.mjs`): exposes the
     * live committed document so Neural Link topology reads work BEFORE any operation has run.
     * The write half is {@link #applyDockZoneOperation}; the state sync stays in
     * {@link #onDockZoneDocumentChange}.
     * @returns {Object} The current committed dockZone.v1 document.
     */
    getDockZoneDocument() {
        return this.dockModel
    }

    /**
     * The view-sync half of the commit loop: stores the new committed document and re-projects
     * from it.
     *
     * Deferred one tick: this fires synchronously from inside the committing splitter's
     * `onDragEnd` (via `commitResizeSplit`). Reconciliation still retires the old shell and its
     * splitter; doing that mid-handler would create a use-after-destroy on the rest of `onDragEnd`.
     * The `isDestroyed` guard covers teardown before the tick fires.
     * @param {Object} document The committed dock-zone document.
     */
    onDockZoneDocumentChange(document) {
        let me = this;

        me.dockModel = document;

        me.refreshPromise = (me.refreshPromise || Promise.resolve())
            .then(() => me.timeout(0))
            .then(() => {
                if (!me.isDestroyed) {
                    return me.refreshDockWorkspace(document)
                }
            })
    }

    /**
     * @summary Reconciles the dock projection while synchronizing persistent control-bar state.
     *
     * The outgoing geometry is FLIP-snapshotted, then the shared reconciler transfers surviving
     * panes and tab chrome into shell index 1. The toolbar at index 0 remains the same component;
     * only its pressed/error state changes.
     * @param {Object} [document=this.dockModel] Committed document snapshot owned by this refresh.
     */
    async refreshDockWorkspace(document=this.dockModel) {
        const
            me           = this,
            flip         = Neo.main?.addon?.DockFlip,
            placeholders = new Map();

        try {
            await flip?.captureFirst({hostId: me.id, markerPrefix: 'dock-flip-item-'})
        } catch (e) {/* instant landing */}

        me.syncControlBar();

        const nextConfig = me.projectDockModel((componentRef, item, itemId) => {
            const placeholder = Neo.create({
                module: Component,
                header: {text: item?.title ?? componentRef ?? itemId},
                hidden: true
            });

            placeholders.set(itemId, placeholder);

            return placeholder
        }, document);

        nextConfig.flex = 1;

        await DockProjectionReconciler.reconcileProjection({
            host       : me,
            nextConfig,
            placeholders,
            // a detached inspector is owner-preserved: the reconciler parks the pane (never
            // destroys it) and retires only its obsolete tab button. Tear-out captures park the
            // same way — their vessels adopt the parked instances post-commit.
            preserveItemIds: [
                ...(me.detachedDetailPane ? ['detail'] : []),
                ...Object.keys(me.tearOutPaneHandles || {})
            ],
            resolveItem    : itemId => {
                const item = document.items[itemId];

                return DockLayoutAdapter.decorateProjectedItem(
                    me.resolveDockComponentRef(item?.componentRef, item, itemId),
                    itemId,
                    item
                )
            },
            shellIndex: 1
        });

        if (flip) {
            DockMotionSignal.enter(me);
            flip.play({hostId: me.id, markerPrefix: 'dock-flip-item-'})
                .catch(() => {})
                .finally(() => DockMotionSignal.leave(me))
        }
    }

    /**
     * @summary Synchronizes the persistent control bar from the perspective store and refusal state.
     */
    syncControlBar() {
        let me             = this,
            activeLayoutId = me.perspectiveStore?.collection?.activeLayoutId,
            error          = me.getReference('fleet-preset-error');

        me.items[0]?.items.forEach(item => {
            const layoutId = item.reference?.startsWith('fleet-preset-')
                ? item.reference.slice('fleet-preset-'.length)
                : null;

            layoutId && item.set({pressed: layoutId === activeLayoutId})
        });

        if (error) {
            error.set({
                hidden: !me.presetError,
                html  : me.presetError || ''
            })
        }

        let toggle = me.getReference('detail-window-toggle');

        if (toggle) {
            let state = me.detailVesselState,
                out   = state === 'opening' || state === 'connected' || state === 'windowed',
                // convergence-by-guard: while a GESTURE tear-out owns the detail pane, the click
                // toggle is inert — one vessel pathway at a time (G4 owns richer convergence)
                torn  = Boolean(me.tearOutPanes?.detail || me.tearOutPaneHandles?.detail);

            toggle.set({
                disabled: state === 'reattaching' || torn,
                text    : torn ? 'Detail torn out' : (out ? 'Reattach detail' : 'Pop out detail')
            })
        }

        let memoriesToggle = me.getReference('memories-window-toggle');

        if (memoriesToggle) {
            // click pop-out and gesture tear-out are ONE pathway for this pane, so an adopted
            // vessel honestly offers the return action either way; only the mid-gesture window
            // (captured handle, no adopted vessel yet) disables instead of racing the gesture
            let adopted    = Boolean(me.tearOutPanes?.memories),
                midGesture = !adopted && Boolean(me.tearOutPaneHandles?.memories);

            memoriesToggle.set({
                disabled: midGesture,
                text    : adopted ? 'Return memories' : 'Pop out memories'
            })
        }
    }

    /**
     * Creates the persistent top-level control bar plus the initial dock projection. The preset
     * switcher derives from the stored collection; subsequent refreshes update it in place while
     * the shared reconciler owns only the projection shell at index 1.
     * @returns {Object[]}
     */
    buildWorkspaceItems() {
        let me             = this,
            dockConfig     = me.projectDockModel(),
            activeLayoutId = me.perspectiveStore?.collection?.activeLayoutId,
            presetButtons  = (me.perspectiveStore?.list() || []).map(preset => ({
                module   : Button,
                cls      : ['fm-preset-button'],
                handler  : () => me.activatePerspective(preset.perspectiveName ?? preset.layoutId),
                pressed  : preset.layoutId === activeLayoutId,
                reference: `fleet-preset-${preset.layoutId}`,
                text     : preset.perspectiveName ?? preset.layoutId
            }));

        dockConfig.flex = 1;

        return [{
            ntype: 'toolbar',
            cls  : ['fm-cockpit-bar'],
            flex : 'none',
            items: [
                ...presetButtons,
                {
                    ntype    : 'component',
                    cls      : ['fm-preset-error'],
                    hidden   : !me.presetError,
                    html     : me.presetError || '',
                    reference: 'fleet-preset-error'
                }, {
                    // the per-SPINE honesty line: names WHY the surface shows sample/last-known
                    // data (cold/degraded); a fully live spine renders nothing — zero nominal
                    // pixels. Derived from the owner-held adapter states by syncSpineBanner.
                    ntype    : 'component',
                    cls      : ['fm-spine-banner'],
                    hidden   : true,
                    reference: 'fleet-spine-banner',
                    role     : 'status'
                }, {
                    // the banner's manual recovery affordance: one click re-drives every liveness
                    // seam through the existing authenticated bridge — no reload, no new transport.
                    // Visibility is the banner's verdict (synced by syncSpineBanner); a live spine
                    // hides both.
                    module   : Button,
                    cls      : ['fm-reconnect-button'],
                    handler  : me.reconnectFleet.bind(me),
                    hidden   : true,
                    iconCls  : 'fa-solid fa-rotate',
                    reference: 'fleet-reconnect-button',
                    text     : 'Reconnect'
                },
                '->', {
                    // The per-viewer wake-push telltale — MY push lane's health, a different axis
                    // from the spine banner (fleet transport) and the per-agent telltales (each
                    // resident's route). Always rendered, quietly: live is one token wide, and a
                    // degraded push carries the consumer's reason verbatim. Synced by
                    // syncViewerWakeTelltale from the provider-held viewerWake truths; the feed's
                    // last signals ride the title as the drill-free detail.
                    ntype    : 'component',
                    cls      : ['fm-viewer-wake'],
                    reference: 'viewer-wake-telltale',
                    role     : 'status',
                    text     : 'wake: not started'
                }, {
                    // The fleet-start outcome summary — written by the controller after the
                    // staged bring-up settles ("N started · U UNKNOWN · M rejected · K excluded";
                    // per-member reasons ride the title). Empty + hidden until a start ran; hover
                    // reaches the reasons — the honest summary state, no separate progress modal (the health
                    // bar stays the live progression surface).
                    ntype    : 'component',
                    cls      : ['fm-fleet-start-summary'],
                    hidden   : true,
                    reference: 'fleet-start-summary'
                }, {
                    // SHELL-owned pop-out affordance for the Memories pane — the detail
                    // toggle's grammar on the tear-out pathway. Provisional bar placement pending
                    // the shell navigation-model redesign (per-pane chrome is that pass's scope).
                    module   : Button,
                    cls      : ['fm-memories-window-toggle'],
                    handler  : me.onMemoriesWindowToggle.bind(me),
                    iconCls  : 'fa-solid fa-arrow-up-right-from-square',
                    reference: 'memories-window-toggle',
                    text     : 'Pop out memories'
                }, {
                    // SHELL-owned pop-out affordance — panes are layout-blind and the shell owns
                    // docking behavior. Routes by the vessel state machine; the label is synced
                    // by syncControlBar so it always names the action it will take.
                    module   : Button,
                    cls      : ['fm-detail-window-toggle'],
                    handler  : me.onDetailWindowToggle.bind(me),
                    iconCls  : 'fa-solid fa-arrow-up-right-from-square',
                    reference: 'detail-window-toggle',
                    text     : 'Pop out detail'
                }, {
                    module : Button,
                    cls    : ['fm-fleet-start'],
                    iconCls: 'fa-solid fa-play',
                    text   : 'Start fleet',
                    handler: 'onStartFleet'
                }
            ]
        }, dockConfig]
    }

    /**
     * Projects the live committed {@link #dockModel} into a dock-zone container config, threading
     * the instance-bound commit-loop callbacks onto every projected affordance.
     * @param {Function|null} [resolveComponentRef=null] Optional item resolver for staged projections.
     * @param {Object} [document=this.dockModel] Committed document snapshot to project.
     * @returns {Object}
     */
    projectDockModel(resolveComponentRef=null, document=this.dockModel) {
        let me = this;

        return DockLayoutAdapter.project(document, {
            applyDockZoneOperation  : me.applyDockZoneOperation.bind(me),
            // the epic seam: arms the landed boundary grammar (enableProxyToPopup + allowOverdrag)
            // on every projected tab strip; the four gesture handlers below route admission,
            // the one commit, and retirement through this cockpit's vessel seams
            enableDockTearOut       : true,
            onDockCrossZoneDrop     : me.onDockCrossZoneDrop.bind(me),
            onDockZoneDocumentChange: me.onDockZoneDocumentChange.bind(me),
            resolveComponentRef     : resolveComponentRef
                || me.resolveDockComponentRef.bind(me),
            resolveRevealComponentRef   : me.resolveDockComponentRef.bind(me),
            ...me.tearOutHandlers
        })
    }

    /**
     * @summary Resolve the provider-hosted `AgentDefinitions` store for the detail pane's
     * configuration tab — the sanctioned `getStateProvider().getStore()` access (the store's own
     * JSDoc names it), degraded to `null` when no chain or no hosting provider exists (bare unit
     * mounts): the tab renders its honest no-definition state rather than demanding a provider.
     * @returns {Neo.data.Store|null}
     */
    resolveAgentDefinitionsStore() {
        try {
            return this.getStateProvider()?.getStore('agentDefinitions') ?? null
        } catch {
            return null
        }
    }

    /**
     * @summary Resolve the Viewport provider's exact public FleetTenants Store for every composed
     * configuration card. Bare mounts degrade to `null`; no cockpit-local tenant copy is invented.
     * @returns {Neo.data.Store|null}
     */
    resolveFleetTenantsStore() {
        try {
            return this.getStateProvider()?.getStore('fleetTenants') ?? null
        } catch {
            return null
        }
    }

    /**
     * @summary Resolve the provider-hosted `fleetRoster` Store — the sanctioned
     * `getStateProvider().getStore()` access ({@link #resolveAgentDefinitionsStore}'s pattern).
     * The roster's value authority is the root provider, never the projected grid child: resident
     * panes resolve BEFORE the grid exists in the projection order, and the inspector must be able
     * to default a selection while the grid is torn out or absent. Bare unit mounts degrade to
     * `null` — consumers render their honest empty options.
     * @returns {Neo.data.Store|null}
     */
    resolveFleetRosterStore() {
        try {
            return this.getStateProvider()?.getStore('fleetRoster') ?? null
        } catch {
            return null
        }
    }

    /**
     * @summary Resolves a dock item's `componentRef` to its pane config — the cockpit's keeper
     * surfaces for the live refs, honest placeholders for panes whose views are sibling leaves.
     *
     * A genuinely absent pane materializes from the OWNER's held runtime state (`adapterState`,
     * events); ordinary reconciliations discover the existing pane before consulting this resolver.
     * The flip marker class carries the stable item identity across both retained and new panes.
     * Panes stay layout-blind per the docking design's pane contract: nothing dock-specific is
     * threaded here beyond the marker class.
     * @param {String} componentRef
     * @param {Object} item The persisted item record.
     * @param {String} itemId The stable workspace identity from the item catalog.
     * @returns {Object}
     */
    resolveDockComponentRef(componentRef, item, itemId) {
        let me        = this,
            marker    = `dock-flip-item-${encodeURIComponent(itemId)}`,
            returning = me.returningTearOutPanes?.[itemId];

        // vessel-death re-adoption FIRST — before the torn stand-in guard, because the records
        // are already retired when the handoff slot is armed: the LIVE pane returns into the
        // projection, same instance, never a recreation (the detachedDetailPane precedent
        // below, generalized to gesture vessels). A slot holding a destroyed pane is consumed
        // and falls through to normal materialization.
        if (returning) {
            delete me.returningTearOutPanes[itemId];

            if (!returning.isDestroyed) {
                returning.parent?.remove(returning, false);
                return returning
            }
        }

        // a GESTURE-torn item's live pane is vessel-owned: a preset restore (or NL addTab)
        // re-treeing the item while torn must not steal or duplicate the instance — an honest
        // stand-in holds the slot (the same discipline as the click-detached inspector below);
        // the vessel-death return path above swaps it for the live pane when the vessel dies.
        // Optional-chained like every sibling
        // field read: the projection specs drive these prototype methods over controlled state.
        if (me.tearOutPaneHandles?.[itemId] && !me.tearOutPaneHandles[itemId].isDestroyed) {
            return {
                ntype: 'component',
                cls  : [marker, 'fm-pane-placeholder'],
                html : `${item?.title ?? componentRef ?? itemId} is open in its own window`
            }
        }

        switch (componentRef) {
            case 'fleet-grid':
                return {
                    module      : FleetGrid,
                    adapterState: me.gridAdapterState,
                    bind        : {store: 'stores.fleetRoster'},
                    cls         : [marker],
                    // the bootstrap CTA's intent: an empty fleet's one path to its first agent —
                    // the controller opens the S5 define-agent zone (the card-drill precedent)
                    listeners: {addAgentRequest: 'onAddAgentRequest'},
                    reference: 'fleet-grid'
                };
            case 'activity-stream':
                return {
                    module        : ActivityStream,
                    adapterState  : me.streamAdapterState,
                    actorDirectory: me.buildActivityActorDirectory(),
                    cls           : [marker],
                    events        : me.streamEvents,
                    reference     : 'activity-stream'
                };
            case 'agent-detail':
                // the pane lives in its vessel window — a preset restore (or an NL-driven addTab)
                // can re-tree the `detail` item while detached, and materializing here would STEAL
                // the live instance out of its window: an honest stand-in instead. The reattach
                // swaps it for the live pane post-projection (the reconciler prefers tree-live
                // occupants over this resolver, so the swap cannot ride the normal adoption).
                if (me.detachedDetail) {
                    return {
                        ntype    : 'component',
                        cls      : [marker, 'fm-pane-placeholder'],
                        html     : 'Agent detail is open in its own window',
                        reference: 'agent-detail-standin'
                    }
                }

                // reattach re-adoption: the parked LIVE instance returns to the projection —
                // same instance id, same runtime state, never a recreation
                if (me.detachedDetailPane) {
                    return me.detachedDetailPane
                }

                // the drill-in inspector; its selected resident is OWNER-held so a pane returning
                // from true absence never drops the selection — null renders the view's honest
                // "select an agent" empty state. The pane stays layout-blind: the pop-out
                // affordance lives in SHELL chrome, never on the pane.
                return {
                    module   : AgentDetail,
                    // the configuration tab's data surface, resolved imperatively at composition
                    // time (the store instance is app-stable) so the view stays provider-agnostic:
                    // a bare mount or a chain without the store degrades to null — the tab's honest
                    // empty state — instead of a bind demanding a provider chain that may not exist
                    agentDefinitions: me.resolveAgentDefinitionsStore(),
                    fleetTenants    : me.resolveFleetTenantsStore(),
                    cls             : [marker],
                    record          : me.detailRecord,
                    reference       : 'agent-detail'
                };
            case 'define-agent':
                // the S5 add-agent flow (rail tool, invoked-not-ambient per the design ruling).
                // `agentDefinitionAccepted` walks up the component chain to the Viewport's roster
                // seam — the same consumer Accounts feeds, so both entry points write one truth.
                return {
                    module   : AddAgentForm,
                    cls      : [marker],
                    listeners: {agentDefinitionAccepted: 'up.onAgentDefinitionAccepted'},
                    reference: 'add-agent-form'
                };
            case 'operator-mailbox':
                // the operator's own inbox + compose surface. record / snapshot / recipientOptions are
                // OWNER-held (materialized from state the cockpit already polls), so a pane returning from
                // true absence re-materializes at current truth — the {@link #detailRecord} precedent. The
                // surface is transport-blind: it fires intent-only `compose` / `inboxPageRequest`, routed up
                // to the controller which holds the bridge (the authenticated ingress + Brain write seam).
                return {
                    module          : OperatorMailbox,
                    cls             : [marker],
                    record          : me.operatorRecord,
                    snapshot        : me.operatorSnapshot,
                    recipientOptions: me.buildOperatorRecipientOptions(),
                    identityPosture : me.operatorIdentityPosture,
                    listeners       : {compose: 'onOperatorCompose', inboxPageRequest: 'onOperatorInboxPageRequest'},
                    reference       : 'operator-mailbox'
                };
            case 'catch-up':
                // S3 invoked history: the pane renders owner-held source envelopes and fires intent;
                // this cockpit owns the authenticated bridge. Partition choices derive from the same
                // provider-owned roster as the cards — no second resident list.
                return {
                    module          : CatchUpPane,
                    cls             : [marker],
                    snapshot        : me.catchUpSnapshot,
                    markOutcome     : me.catchUpMarkOutcome,
                    partitionOptions: me.buildCatchUpPartitionOptions(),
                    listeners       : {
                        historyRequest     : 'onCatchUpHistoryRequest',
                        markCaughtUpRequest: 'onCatchUpMarkRequest',
                        liveSurfaceRequest : 'onCatchUpLiveSurfaceRequest'
                    },
                    reference: 'catch-up'
                };
            case 'memories':
                // resident per-agent session-summary recall (a south reading-surface tab): the pane renders the owner-held
                // source envelope and fires intent; this cockpit owns the authenticated bridge.
                // The selected target travels WITH the snapshot (one coherent state key), so a
                // rematerialized pane never shows cards no selection points at. Agent choices
                // derive from the same provider-owned roster as the cards — no second resident list.
                // The listener scope is bound EXPLICITLY to the owning controller: string handlers
                // resolve through the component's controller chain at fire time, and a vesseled
                // pane (click pop-out / gesture tear-out) has no controller above it — an
                // unscoped string would resolve dead in the vessel and cache that miss.
                return {
                    module       : MemoriesPane,
                    cls          : [marker],
                    activeAgent  : me.memoriesTarget ?? me.memoriesSnapshot?.target ?? null,
                    snapshot     : me.memoriesSnapshot,
                    drillSession : me.memoriesDrillSession,
                    drillSnapshot: me.memoriesDrillSnapshot,
                    agentOptions : me.buildMemoriesAgentOptions(),
                    listeners    : {
                        memoriesRequest     : 'onMemoriesRequest',
                        sessionDetailRequest: 'onSessionDetailRequest',
                        sessionDetailClosed : 'onSessionDetailClosed',
                        scope               : me.getController()
                    },
                    reference: 'memories'
                };
            case 'wakeRoutes':
                // The snapshot travels with rematerialization like the memories sibling: a torn or
                // re-projected pane reopens on the last ACCEPTED envelope, never a blank claim.
                return {
                    module   : WakeRoutePane,
                    cls      : [marker],
                    snapshot : me.wakeRoutesSnapshot,
                    listeners: {wakeRoutesRequest: 'onWakeRoutesRequest'},
                    reference: 'wakeRoutes'
                };
            default:
                // perspectives arrives with its own leaf — an honest labelled placeholder, never a
                // blank pane masquerading as a finished surface
                return {
                    ntype: 'component',
                    cls  : [marker, 'fm-pane-placeholder'],
                    html : `${item?.title ?? componentRef} — this pane's view lands with its own leaf`
                }
        }
    }

    /**
     * Cross-zone drop reducer: a dock tab-header released outside its own toolbar reports its
     * release point here (via `Neo.dashboard.DockTabSortZone`). The producer resolves the
     * placement KIND from the pointer and each zone's rect, `previewToOperation` maps it to the
     * semantic operation, and the standard commit loop applies it. A same-zone drop is a no-op
     * (the within-toolbar reorder already committed via the `moveTo` listener).
     * @param {Object} data
     * @param {Number} data.clientX
     * @param {Number} data.clientY
     * @param {String} data.itemId       The dock item id being dragged.
     * @param {String} data.sourceNodeId The tabs node the drag started in.
     */
    async onDockCrossZoneDrop({clientX, clientY, itemId, sourceNodeId}) {
        let me    = this,
            nodes = me.dockModel?.nodes || {},
            zones = Object.keys(nodes)
                .filter(nodeId => nodes[nodeId].type === 'tabs' && nodeId !== sourceNodeId)
                .map(nodeId => ({nodeId, container: me.down({dockNodeId: nodeId})}))
                .filter(zone => zone.container);

        if (!zones.length) {
            return
        }

        let rects = await me.getDomRect(zones.map(zone => zone.container.id));

        let producerZones = zones
                .map((zone, index) => ({
                    nodeId     : zone.nodeId,
                    rect       : rects[index],
                    orientation: Object.values(nodes).find(node => node.type === 'split' && node.children?.includes(zone.nodeId))?.orientation ?? null
                }))
                .filter(zone => zone.rect),
            preview    = me.dockPreviewProducer.produce({pointer: {x: clientX, y: clientY}, zones: producerZones, itemId, sourceNodeId}),
            descriptor = previewToOperation(preview);

        if (descriptor) {
            let result = me.applyDockZoneOperation(descriptor);

            if (result && !result.errors?.length && result.document) {
                me.onDockZoneDocumentChange(result.document)
            }
        }
    }

    /**
     * @summary Source-precedence guard: the provider-hosted roster store `autoLoad`s the JSON
     * sample seed while {@link #loadRoster} races the bridge. When the bridge wins, the sample's
     * later `load` would silently replace live rows (the grid still claiming `live`). Any store
     * load landing AFTER live truth re-applies the last authoritative snapshot — idempotent,
     * fail-closed toward live. A load before live truth is the normal seed path and passes through.
     * Latched via {@link #reconcilingRoster}: the reconciliation's own mutations fire `load` back
     * into this listener.
     * @protected
     */
    onRosterStoreLoad() {
        let me = this;

        if (!me.reconcilingRoster && me.rosterWired && me.lastLiveRows) {
            me.reconcilingRoster = true;

            try {
                me.reconcileRoster(me.getReference('fleet-grid').store, me.lastLiveRows)
            } finally {
                me.reconcilingRoster = false
            }
        }
    }

    /**
     * @summary Resolve the live {@link AgentOS.view.fleet.AgentDetail} instance wherever it
     * currently renders — the projected tree while docked, the owner-held handle while detached
     * (click pop-out OR gesture tear-out). A vessel-mounted pane lives in the popup's view tree,
     * out of this cockpit's `down()` / `getReference` reach, so every detail consumer (record
     * mutation, selection reconciliation, the card→detail drill) routes through this accessor —
     * the windowed inspector stays as live as the docked one on either vessel pathway.
     * @returns {Neo.container.Base|null} The detail pane, or `null` before its first materialization.
     */
    getAgentDetailPane() {
        return this.detachedDetailPane || this.tearOutPaneHandles?.detail || this.getReference('agent-detail')
    }

    /**
     * @summary Resolve the live {@link AgentOS.view.fleet.OperatorMailbox} instance whether it is
     * docked or gesture-torn into a vessel. A torn pane lives outside this cockpit's projected tree,
     * so owner-side identity and inbox refreshes must use the captured handle instead of stopping at
     * `getReference()`.
     * @returns {Neo.container.Base|null} The operator mailbox, or `null` before materialization.
     */
    getOperatorMailboxPane() {
        return this.tearOutPaneHandles?.operator || this.getReference('operator-mailbox')
    }

    /**
     * @summary Resolve the live {@link AgentOS.view.fleet.CatchUpPane} instance whether it is
     * docked or gesture-torn into a vessel — the {@link #getOperatorMailboxPane} contract for the
     * catch-up reading surface, so roster-driven option refreshes and the bridge-arrival history
     * re-drive reach a torn pane too.
     * @returns {Neo.container.Base|null} The catch-up pane, or `null` before materialization.
     */
    getCatchUpPane() {
        return this.tearOutPaneHandles?.catchUp || this.getReference('catch-up')
    }

    /**
     * @summary Resolve the live {@link AgentOS.view.fleet.MemoriesPane} instance whether it is
     * docked, revealed, or vesseled — the click pop-out ({@link #popOutMemories}) and the gesture
     * tear-out share one pathway, so one handle map answers both. Owner-side pushes (snapshot
     * writes, roster option refreshes, reconnect re-drives) must route through this accessor
     * instead of stopping at `getReference()`: a vesseled pane lives outside this cockpit's
     * projected tree.
     * @returns {Neo.container.Base|null} The memories pane, or `null` before materialization.
     */
    getMemoriesPane() {
        // returningTearOutPanes covers the vessel-death parking window: the rail's lazy reveal may
        // not adopt the returning pane for a while, and an owner push landing in that window must
        // still reach the LIVE instance — otherwise the eventual adoption renders a stale snapshot.
        return this.tearOutPaneHandles?.memories || this.returningTearOutPanes?.memories || this.getReference('memories')
    }

    /**
     * The tear-out admission seam: opens the vessel window for a mid-gesture boundary exit,
     * reusing the SAME widget-childapp shell the click pop-out proves (an empty pane host — the
     * cockpit reparents on connect). Fail-closed per the admission contract: `Neo.Main.windowOpen`
     * resolves **Boolean** (a blocked popup never throws), and any refused precondition — an
     * unresolvable live pane (placeholder items), an item already vessel-owned on EITHER pathway —
     * or falsy/throwing acquisition returns `null`, degrading the gesture to its in-window
     * fallback with zero vessel state.
     * @param {Object} request
     * @param {String} request.itemId
     * @param {Object} request.proxyRect
     * @param {Boolean} [request.requireProjectedPane=true] The gesture needs a LIVE projected pane
     *     (you tear what you can see); the click pop-out ({@link #popOutMemories}) can materialize
     *     a not-yet-projected pane from owner-held state itself (rail-lazy chrome, or a resident
     *     item a custom document dropped), so it opts out of this precondition only.
     * @returns {Promise<{popupHeight: Number, popupWidth: Number, windowName: String}|null>}
     * @protected
     */
    async openTearOutVessel({itemId, proxyRect, requireProjectedPane = true}) {
        let me         = this,
            windowName = `fm-tearout-${itemId}-${me.id}`;

        // fail-closed preconditions: only a live, projected, singly-owned pane may embody
        if (
            me.tearOutPanes?.[itemId] || me.tearOutPaneHandles?.[itemId] ||
            (itemId === 'detail' && me.detachedDetail) ||
            (requireProjectedPane && !me.findProjectedDockPane(itemId))
        ) {
            return null
        }

        try {
            let {windowConfigs} = Neo,
                firstWindowId   = Object.keys(windowConfigs)[0],
                {basePath}      = windowConfigs[firstWindowId],
                winData         = await Neo.Main.getWindowData({windowId: me.windowId}),
                width           = Math.max(Math.round(proxyRect?.width  || 480), 320),
                height          = Math.max(Math.round(proxyRect?.height || 360), 240),
                left            = Math.round((proxyRect?.x ?? 120) + winData.screenLeft),
                top             = Math.round((proxyRect?.y ?? 120) + (winData.outerHeight - winData.innerHeight) + winData.screenTop),
                opened          = await Neo.Main.windowOpen({
                    url           : `${basePath}apps/agentos/childapps/widget/index.html?tearout=${itemId}&cockpitId=${me.id}`,
                    windowFeatures: `height=${height},left=${left},top=${top},width=${width}`,
                    windowId      : me.windowId,
                    windowName
                });

            if (opened === false) return null;

            return {popupHeight: height, popupWidth: width, windowName}
        } catch (error) {
            return null
        }
    }

    /**
     * The tear-out retirement seam: closes a vessel the gesture no longer needs (re-entry,
     * cancel, or a refused model commit) and releases every tear-out record for the item —
     * including a captured pane handle, so the next projection re-adopts or re-materializes it
     * normally. Best-effort on the window close; {@link #onWindowDisconnect}'s tear-out branch
     * only matches ADOPTED vessels (`tearOutPanes`), so a pre-commit retirement never re-enters.
     * @param {Object} vessel
     * @param {String} vessel.itemId
     * @param {String} vessel.windowName
     * @returns {Promise<void>}
     * @protected
     */
    async closeTearOutVessel({itemId, windowName}) {
        let me = this;

        delete me.tearOutConnects[itemId];
        delete me.tearOutPaneHandles[itemId];

        try {
            await Neo.Main.windowClose({names: [windowName], windowId: me.windowId})
        } catch (error) {
            // best-effort retirement
        }
    }

    /**
     * The owner-destroy exit for every live tear-out record: closes each admitted vessel
     * (fire-and-forget — the disconnect listener is already detached by the destroy path, so no
     * re-entry) and settles every owner-held pane exactly once — captured handles AND armed
     * returning slots alike (cockpit teardown is a terminal, so the bring-home handoff has no
     * refresh left to land in). Cockpit teardown must not leave an OS vessel open or a live
     * pane orphaned under a popup view tree the worker never destroys.
     * @protected
     */
    retireTearOutState() {
        let me = this;

        for (const {windowName} of Object.values(me.tearOutPanes || {})) {
            windowName && Neo.Main.windowClose({names: [windowName], windowId: me.windowId}).catch(() => {})
        }

        for (const pane of [...Object.values(me.tearOutPaneHandles || {}), ...Object.values(me.returningTearOutPanes || {})]) {
            if (pane && !pane.isDestroyed) {
                pane.parent?.remove(pane, false);
                pane.destroy()
            }
        }

        me.tearOutPanes          = {};
        me.tearOutConnects       = {};
        me.tearOutPaneHandles    = {};
        me.tearOutPlacements     = {};
        me.returningTearOutPanes = {}
    }

    /**
     * @summary The tear-out commit seam with exact-position capture riding it: the
     * `{tabsNodeId, index}` pair is readable only BEFORE a detach commit removes the item from
     * the tree, and a refused commit deletes its own capture — no stale placement outlives a
     * gesture that never committed. Every non-detach descriptor passes through untouched.
     * @param {Object} descriptor
     * @returns {{document:Object, errors:String[]}}
     * @protected
     */
    applyTearOutOperation(descriptor) {
        let me       = this,
            isDetach = descriptor?.operation === 'detachItem',
            captured = isDetach ? DockZoneModel.captureItemPlacement(me.dockModel, descriptor.itemId) : null,
            result;

        captured && ((me.tearOutPlacements ??= {})[descriptor.itemId] = captured);

        result = me.applyDockZoneOperation(descriptor);

        isDetach && result?.errors?.length && delete me.tearOutPlacements?.[descriptor.itemId];

        return result
    }

    /**
     * @summary Brings a torn-out item HOME on vessel death — same instance, exact stored
     * position (the vessel close policy of the harness docking design record §2.8).
     *
     * A window disconnect never destroys the popup's view tree, so the captured pane survives
     * LIVE; it hands off through {@link #returningTearOutPanes} and the resolver returns it
     * into the projection (the {@link #detachedDetailPane} re-adoption precedent). Placement
     * recovery is SEMANTIC, never geometric: the stored `{tabsNodeId, index}` pair when its
     * node survives, the first surviving tabs node (append) when it left the tree. An item some
     * other flow already re-treed keeps that placement — the refresh simply swaps its stand-in
     * for the live pane. Destruction remains only the no-home fallback terminal (no catalog
     * record, no surviving tabs node, or a failed return commit) — ownership always settles,
     * nothing is ever orphaned under a dead vessel's view.
     * @param {String} itemId
     * @param {Neo.component.Base|null} pane The captured handle, already released from the maps.
     * @protected
     */
    reintegrateTearOutItem(itemId, pane) {
        let me         = this,
            placement  = me.tearOutPlacements?.[itemId],
            doc        = me.dockModel,
            storedHome = placement && doc?.nodes?.[placement.tabsNodeId]?.type === 'tabs' ? placement.tabsNodeId : null,
            fallback   = storedHome || Object.entries(doc?.nodes || {}).find(([, node]) => node.type === 'tabs')?.[0],
            live       = pane && !pane.isDestroyed,
            settle     = () => {
                if (live) {
                    pane.parent?.remove(pane, false);
                    pane.destroy()
                }
            },
            result;

        delete me.tearOutPlacements?.[itemId];

        if (!doc?.items?.[itemId] || !fallback) {
            settle();
            return
        }

        // Park the live pane OUT of the dead vessel's tree before the re-projection, then arm the
        // return slot. A pane still parented in the vessel's `mainView` is a tree-live occupant the
        // dock reconciler PREFERS over {@link #resolveDockComponentRef}'s re-adoption — so the item
        // re-trees in the document while the live instance stays mounted in the dead vessel window
        // (its `windowId` never leaves the closed vessel: the strand this fixes). Parking first makes the
        // instance parentless, forcing the reconciler to re-materialize it through the resolver, which
        // re-parents it into the live cockpit window. Symmetric inverse of {@link #reparentTearOutPane}'s
        // `app.mainView.add(pane)` adoption; mirrors {@link #reattachAgentDetail}'s parked-pane discipline.
        if (live) {
            pane.parent?.remove(pane, false);
            (me.returningTearOutPanes ??= {})[itemId] = pane
        }

        if (DockZoneModel.findContainingTabsId(doc, itemId)) {
            // already re-treed by another flow (preset restore, NL addTab): the model is
            // truthful as-is — the refresh swaps the stand-in for the returning live pane
            me.refreshDockWorkspace();
            return
        }

        result = me.applyDockZoneOperation({
            operation : 'addTab',
            itemId,
            tabsNodeId: fallback,
            ...(storedHome ? {index: placement.index} : {})
        });

        if (result?.errors?.length === 0) {
            me.onDockZoneDocumentChange(result.document)
        } else {
            delete me.returningTearOutPanes?.[itemId];
            settle()
        }
    }

    /**
     * Captures the live projected pane at the detached terminal — synchronously, BEFORE the
     * commit's re-projection can destroy it — parking it via the reconciler's `preserveItemIds`
     * until the vessel adopts it. A miss is fail-safe: admission already verified resolvability,
     * and an unexpectedly-missing pane simply leaves the vessel empty (model truth unharmed).
     * @param {String} itemId
     * @protected
     */
    captureTearOutPane(itemId) {
        let pane = this.findProjectedDockPane(itemId);

        pane && !pane.isDestroyed && (this.tearOutPaneHandles[itemId] = pane)
    }

    /**
     * Resolves a dock item's LIVE pane instance from the projected tree by the stable reference
     * names {@link #resolveDockComponentRef} assigns. Items whose resolver yields an unreferenced
     * placeholder (sibling-leaf panes) resolve `null` — which is exactly the admission refusal:
     * a placeholder cannot embody into a vessel.
     * @param {String} itemId
     * @returns {Neo.component.Base|null}
     * @protected
     */
    findProjectedDockPane(itemId) {
        let componentRef = this.dockModel?.items?.[itemId]?.componentRef,
            reference    = componentRef === 'define-agent' ? 'add-agent-form' : componentRef;

        return reference ? (this.getReference(reference) || null) : null
    }

    /**
     * The post-commit adoption: the detached terminal committed `detachItem` (the item left the
     * tree, catalog preserved), so the vessel now OWNS the captured pane. Records the
     * {@link #tearOutPanes} entry and — if the vessel already connected (the long-drag order) —
     * reparents the live pane immediately; otherwise {@link #onWindowConnect}'s tear-out branch
     * adopts on arrival (the fast-terminal order). Close-after-adoption reintegration is the G4
     * vessel-lifecycle leaf's scope, deliberately not handled here.
     * @param {String} itemId
     * @protected
     */
    adoptTearOutPane(itemId) {
        let me        = this,
            connected = me.tearOutConnects[itemId];

        me.tearOutPanes[itemId] = {windowName: `fm-tearout-${itemId}-${me.id}`, windowId: connected?.windowId ?? null};

        connected && me.reparentTearOutPane(itemId, connected);
        me.syncControlBar()
    }

    /**
     * Moves the LIVE captured pane into a connected tear-out vessel — the same instance-moving
     * reparent the click pop-out uses, minus every document write (the model already committed
     * at the terminal; this is pure render-target work on the one shared heap).
     * @param {String} itemId
     * @param {Object} target `{windowId}`
     * @protected
     */
    reparentTearOutPane(itemId, {windowId}) {
        let me   = this,
            app  = Neo.apps[windowId],
            pane = me.tearOutPaneHandles[itemId];

        if (!app || !pane || pane.isDestroyed) return;

        me.tearOutPanes[itemId] && (me.tearOutPanes[itemId].windowId = windowId);

        pane.parent?.remove(pane, false);
        app.mainView.add(pane)
    }

    /**
     * @summary Detach the agent-detail inspector into its own OS window on the shared heap —
     * the `docked → opening` edge of the vessel admission state machine.
     *
     * The dock document stays the layout SSOT: `detachItem` prunes the `detail` item from the
     * tree while preserving its catalog record, and the tabs node + EXACT index are stored FIRST
     * (`addTab` appends by default — the stored index is the only placement truth the reattach
     * has). The LIVE pane parks via the reconciler's `preserveItemIds` (awaited, so the vessel's
     * connect can never race a pane the old shell still holds), then the widget-childapp vessel
     * opens. `Neo.Main.windowOpen` resolves **Boolean** — `false` IS the blocked-popup failure
     * (it never throws), taking the `failed-blocked` edge and rolling back through the standard
     * reattach. A vessel that opens but never joins the heap inside the bounded connect window
     * takes the `failed-timeout` edge the same way. Every awaited continuation revalidates
     * {@link #detailVesselGeneration}.
     * @returns {Promise<{detached: Boolean, errors: String[]}>}
     */
    async popOutAgentDetail() {
        let me   = this,
            pane = me.getReference('agent-detail'),
            home = DockZoneModel.findContainingTabsId(me.dockModel, 'detail');

        if (me.detachedDetail || !pane || !home) {
            return {detached: false, errors: ['agent-detail is not a docked, projected pane']}
        }

        let generation = ++me.detailVesselGeneration,
            homeIndex  = me.dockModel.nodes[home].items.indexOf('detail'),
            result     = me.applyDockZoneOperation({operation: 'detachItem', itemId: 'detail'});

        if (result.errors.length) {
            return {detached: false, errors: result.errors}
        }

        // the window name stays an IMMUTABLE local across every await below: a raced reattach
        // nulls the bookkeeping entry, but a stale-open cleanup still needs the name to close by
        let windowName = `fm-agent-detail-${me.id}`;

        me.detachedDetail = {
            connectTimer  : null,
            homeTabIndex  : homeIndex,
            homeTabsNodeId: home,
            windowId      : null,
            windowName
        };
        me.detachedDetailPane   = pane;
        me.detailVesselState    = 'opening';
        me.lastDetailVesselFailure = null;

        // the re-projection parks the preserved pane (alive on the shared heap, out of every
        // parent) and retires its tab button — awaited before the vessel opens
        me.onDockZoneDocumentChange(result.document);
        await me.refreshPromise;

        if (generation !== me.detailVesselGeneration) {
            return {detached: false, errors: ['superseded by a newer vessel operation']}
        }

        let {windowConfigs} = Neo,
            firstWindowId   = Object.keys(windowConfigs)[0],
            {basePath}      = windowConfigs[firstWindowId],
            winData         = await Neo.Main.getWindowData({windowId: me.windowId});

        if (generation !== me.detailVesselGeneration) {
            return {detached: false, errors: ['superseded by a newer vessel operation']}
        }

        let opened = await Neo.Main.windowOpen({
            url           : `${basePath}apps/agentos/childapps/widget/index.html?detail=agent-detail&cockpitId=${me.id}`,
            windowFeatures: `height=640,width=480,left=${winData.screenLeft + 160},top=${winData.screenTop + 120}`,
            windowId      : me.windowId,
            windowName
        });

        if (generation !== me.detailVesselGeneration) {
            // the generation died DURING the open (a raced reattach/teardown already restored the
            // dock state) — but a `true` completion means the vessel MATERIALIZED under the dead
            // generation: stale continuations own the cleanup of resources they acquired, so close
            // the orphan by its immutable name (fire-and-forget; nothing else may be touched)
            opened && Neo.Main.windowClose({names: [windowName], windowId: me.windowId}).catch(() => {});

            return {detached: false, errors: ['superseded by a newer vessel operation']}
        }

        if (!opened) {
            // the PRIMARY real-world failure: the browser blocked the popup. Boolean grammar —
            // no exception ever fires here. Restore the docked state commit-or-neither.
            me.detailVesselState       = 'failed-blocked';
            me.lastDetailVesselFailure = 'blocked';

            me.warnVesselAdmissionFailure('blocked', {windowName});

            await me.reattachAgentDetail({windowAlreadyClosed: true});

            return {detached: false, errors: ['popup blocked: the vessel window did not open']}
        }

        // bounded connect window: a vessel that opened but never joins the heap rolls back
        me.detachedDetail.connectTimer = setTimeout(() => {
            if (generation === me.detailVesselGeneration && me.detailVesselState === 'opening') {
                me.detailVesselState       = 'failed-timeout';
                me.lastDetailVesselFailure = 'timeout';
                me.warnVesselAdmissionFailure('timeout', {boundMs: me.detailVesselConnectWindowMs, windowName});
                me.reattachAgentDetail()
            }
        }, me.detailVesselConnectWindowMs);

        me.syncControlBar();

        return {detached: true, errors: []}
    }

    /**
     * @summary Bring the detached inspector home — the `* → reattaching → docked` edge.
     *
     * `addTab` returns the `detail` item into its remembered tabs node at its remembered EXACT
     * index (first-tabs fallback with honest append when a preset retired the node); the parked
     * instance is re-adopted by the projection ({@link #resolveDockComponentRef} hands back the
     * SAME instance), and the vessel closes unless it already closed itself. Bookkeeping clears
     * BEFORE the async close — the cleared entry is the {@link #onWindowDisconnect} re-entrancy
     * guard. Increments {@link #detailVesselGeneration} first, so every in-flight admission
     * continuation (open, URL read, connect timer) goes inert — and its OWN post-projection
     * continuation revalidates the same way: a destroy (or newer operation) landing during the
     * await limits this path to the vessel cleanup it still owns, never a cockpit-field write.
     * @param {Object} [options={}]
     * @param {Boolean} [options.windowAlreadyClosed=false] `true` when the disconnect path runs
     *     the reattach (the vessel is already gone — do not close it again).
     * @returns {Promise<{reattached: Boolean, errors: String[]}>}
     */
    async reattachAgentDetail({windowAlreadyClosed=false}={}) {
        let me    = this,
            entry = me.detachedDetail,
            pane  = me.detachedDetailPane;

        if (!entry || !pane) {
            return {errors: ['agent-detail is not detached'], reattached: false}
        }

        let generation = ++me.detailVesselGeneration;

        entry.connectTimer && clearTimeout(entry.connectTimer);

        let failure = me.lastDetailVesselFailure;

        me.detailVesselState = 'reattaching';

        let homeLive = me.dockModel.nodes[entry.homeTabsNodeId]?.type === 'tabs',
            home     = homeLive
                ? entry.homeTabsNodeId
                : Object.keys(me.dockModel.nodes).find(id => me.dockModel.nodes[id].type === 'tabs'),
            result   = me.applyDockZoneOperation({
                operation : 'addTab',
                itemId    : 'detail',
                tabsNodeId: home,
                index     : homeLive ? entry.homeTabIndex : undefined
            });

        if (result.errors.length) {
            return {errors: result.errors, reattached: false}
        }

        me.detachedDetail = null;

        // the re-projection re-adopts the instance: the resolver hands it back and the
        // container insert performs the atomic move out of the vessel viewport (core contract)
        me.onDockZoneDocumentChange(result.document);

        await me.refreshPromise;

        if (me.isDestroyed || generation !== me.detailVesselGeneration) {
            // a destroy (or a newer vessel operation) landed during the projection await: this
            // continuation may perform ONLY the vessel cleanup it still owns — teardown skipped
            // the close because this reattach had already cleared the bookkeeping entry — and
            // must never resurrect cockpit fields (the pane is the newer owner's, or destroyed)
            windowAlreadyClosed || Neo.Main.windowClose({names: [entry.windowName], windowId: me.windowId}).catch(() => {});

            return {errors: ['superseded by teardown or a newer vessel operation'], reattached: false}
        }

        // an external re-tree while detached left a stand-in occupying the slot, and the
        // reconciler keeps tree-live occupants — swap it for the live instance, same position
        let standin = me.getReference('agent-detail-standin');

        if (standin) {
            let parent = standin.parent,
                index  = parent.items.indexOf(standin);

            parent.remove(standin, true);
            parent.insert(index, pane)
        }

        me.detachedDetailPane      = null;
        me.detailVesselState       = 'docked';
        me.lastDetailVesselFailure = failure;

        me.syncControlBar();

        if (!windowAlreadyClosed) {
            try {
                await Neo.Main.windowClose({names: [entry.windowName], windowId: me.windowId})
            } catch (error) {
                return {errors: [`popup close failed: ${error?.message || error}`], reattached: true}
            }
        }

        return {errors: [], reattached: true}
    }

    /**
     * @summary One self-describing line per silent-rollback admission edge — the flap witness.
     *
     * Both failure edges (`failed-blocked`, `failed-timeout`) roll the dock back so cleanly that
     * a flap is visually identical to a user-initiated reattach. {@link #lastDetailVesselFailure}
     * carries the state half of the observability contract; this warn carries the log half — the
     * App-Worker console bridges into the Neural Link console stream, so harnesses and agents can
     * distinguish an admission failure from a deliberate return without polling cockpit state.
     * @param {String} kind The failure edge: 'blocked' or 'timeout'.
     * @param {Object} meta Window name + bound context, so the line stands alone in a log;
     *     `meta.itemId` names the vessel's item (absent → the click-detail pathway's 'detail').
     * @protected
     */
    warnVesselAdmissionFailure(kind, meta) {
        console.warn(`[FleetCockpit] ${meta?.itemId ?? 'detail'}-vessel admission failed (${kind}):`, meta)
    }

    /**
     * @summary The SHELL-owned window-toggle affordance routes by the state machine: docked →
     * {@link #popOutAgentDetail}; opening/connected/windowed → {@link #reattachAgentDetail};
     * a reattach already in flight is a guarded no-op. The pane itself carries no dock semantics —
     * panes stay layout-blind; the shell owns docking behavior.
     * @returns {Promise<Object>} The routed operation's result.
     */
    onDetailWindowToggle() {
        let me                         = this,
            {detailVesselState: state} = me;

        if (state === 'reattaching') {
            return Promise.resolve({errors: ['reattach in flight'], reattached: false})
        }

        return me.detachedDetail ? me.reattachAgentDetail() : me.popOutAgentDetail()
    }

    /**
     * @summary Detach the Memories pane into its own OS window on the shared heap — the click
     * pop-out riding the GENERIC tear-out substrate, never a second vessel state machine.
     *
     * The vessel URL rides the established tear-out param shape —
     * `?tearout=memories&cockpitId=<id>` — the same widget childapp the click pop-out's
     * `?detail=agent-detail` shape loads; {@link #onWindowConnect}'s tear-out branch adopts it.
     * The dock document stays the layout SSOT: {@link #applyTearOutOperation} captures the exact
     * `{tabsNodeId, index}` placement before the `detachItem` commit, so the vessel-death return
     * ({@link #reintegrateTearOutItem}) restores the item at its stored rail position.
     *
     * Selection travel is BY IDENTITY: the vessel hosts the LIVE pane instance (or one
     * materialized from the owner-held `memoriesTarget`/`memoriesSnapshot` when the rail's lazy
     * reveal never projected it), so the active agent and cards move with the window — stronger
     * than a URL parameter, and exactly the rematerialization contract the memories source
     * documents. A blocked popup (`windowOpen` resolves `false`, it never throws) refuses before
     * any document mutation — commit-or-neither.
     * @returns {Promise<{detached: Boolean, errors: String[]}>}
     */
    async popOutMemories() {
        let me     = this,
            itemId = 'memories';

        if (me.tearOutPanes?.[itemId] || me.tearOutPaneHandles?.[itemId]) {
            return {detached: false, errors: ['memories is already in a vessel']}
        }

        if (!DockZoneModel.findContainingTabsId(me.dockModel, itemId)) {
            return {detached: false, errors: ['memories is not a docked item']}
        }

        let vessel = await me.openTearOutVessel({itemId, proxyRect: null, requireProjectedPane: false});

        if (!vessel) {
            // the silent-refusal witness (the detail pathway's observability contract): the click
            // mutates nothing on this edge, so without this line a blocked popup is visually
            // indistinguishable from a dead button
            me.warnVesselAdmissionFailure('blocked', {itemId, windowName: `fm-tearout-${itemId}-${me.id}`});

            return {detached: false, errors: ['popup blocked: the vessel window did not open']}
        }

        if (me.isDestroyed) {
            return {detached: false, errors: ['cockpit destroyed during vessel open']}
        }

        // the item record is read BEFORE the commit prunes the tree entry (the catalog record
        // survives a detach, so this is belt-and-braces ordering, not a correctness dependency)
        let item   = me.dockModel.items[itemId],
            result = me.applyTearOutOperation({operation: 'detachItem', itemId});

        if (result.errors.length) {
            await me.closeTearOutVessel({itemId, windowName: vessel.windowName});
            return {detached: false, errors: result.errors}
        }

        // capture the live pane synchronously before the commit's re-projection can destroy it
        // (the gesture order); a pane that was never projected (rail-lazy chrome — resident tabs
        // always project) materializes from owner-held state instead — same resolver,
        // vessel-bound rather than projection-bound
        me.captureTearOutPane(itemId);

        if (!me.tearOutPaneHandles[itemId]) {
            me.tearOutPaneHandles[itemId] = Neo.create(me.resolveDockComponentRef(item?.componentRef, item, itemId))
        }

        me.onDockZoneDocumentChange(result.document);
        me.adoptTearOutPane(itemId);

        return {detached: true, errors: []}
    }

    /**
     * @summary Bring the vesseled Memories pane home by closing its OS window: vessel death IS
     * the return path — {@link #onWindowDisconnect}'s tear-out branch correlates the close and
     * {@link #reintegrateTearOutItem} restores the same live instance at its stored rail
     * position. Closing by the immutable window NAME covers the not-yet-connected window too.
     * @returns {Promise<{returned: Boolean, errors: String[]}>}
     */
    async returnMemories() {
        let me    = this,
            entry = me.tearOutPanes?.memories;

        if (!entry) {
            return {returned: false, errors: ['memories is not in a vessel']}
        }

        try {
            await Neo.Main.windowClose({names: [entry.windowName], windowId: me.windowId})
        } catch (error) {
            // best-effort: a already-gone window still fires (or already fired) the disconnect
        }

        return {returned: true, errors: []}
    }

    /**
     * @summary SHELL-owned toggle routing for the Memories pane vessel — the
     * {@link #onDetailWindowToggle} grammar on the tear-out pathway. Mid-gesture ownership
     * (captured handle without an adopted vessel) refuses instead of racing the gesture.
     * @returns {Promise<Object>} The routed operation's result.
     */
    onMemoriesWindowToggle() {
        let me = this;

        if (!me.tearOutPanes?.memories && me.tearOutPaneHandles?.memories) {
            return Promise.resolve({errors: ['a gesture tear-out owns the pane'], detached: false})
        }

        return me.tearOutPanes?.memories ? me.returnMemories() : me.popOutMemories()
    }

    /**
     * @summary A window joined the shared heap: if it is OUR detail vessel (the pop-out URL
     * carries `detail=agent-detail&cockpitId=<this.id>`), take the `opening → connected →
     * windowed` edges — move the parked LIVE pane into the vessel's main view. The instance
     * moves trees on the one App-Worker heap; nothing re-instantiates. The URL read is an async
     * boundary: the captured generation revalidates after it.
     * @param {Object} data `{appName, windowId}`
     * @protected
     */
    async onWindowConnect(data) {
        let me         = this,
            {windowId} = data,
            app        = Neo.apps[windowId],
            generation = me.detailVesselGeneration;

        if (!app || me.isDestroyed) {
            return
        }

        let url    = await Neo.Main.getByPath({path: 'document.URL', windowId}),
            params = new URL(url).searchParams;

        if (me.isDestroyed || params.get('cockpitId') !== me.id) {
            return
        }

        // Tear-out vessels connect through the same widget shell but live in their own
        // bookkeeping: post-terminal (adopted) → reparent the captured pane now; mid-gesture →
        // record the connect for the terminal to consume (the race runs both orders). The click
        // pop-out branch below never sees a tear-out window.
        let tearOutItemId = params.get('tearout');

        if (tearOutItemId) {
            if (me.tearOutPanes?.[tearOutItemId]) {
                me.reparentTearOutPane(tearOutItemId, {windowId})
            } else {
                (me.tearOutConnects ??= {})[tearOutItemId] = {windowId}
            }

            // scope is a per-window fact — the torn-out window's OS chrome (its title)
            // names the instance it serves, from its first connected moment; the switch owner
            // re-pushes over `tearOutConnects` on every rebind
            me.pushInstanceTitle(windowId);
            return
        }

        if (
            !me.detachedDetail || !me.detachedDetailPane ||
            generation !== me.detailVesselGeneration     ||
            me.detailVesselState !== 'opening'           ||
            params.get('detail') !== 'agent-detail'
        ) {
            return
        }

        let {connectTimer} = me.detachedDetail;

        connectTimer && clearTimeout(connectTimer);

        me.detachedDetail.connectTimer = null;
        me.detachedDetail.windowId     = windowId;
        me.detailVesselState           = 'connected';

        app.mainView.add(me.detachedDetailPane);

        me.detailVesselState = 'windowed';
        me.syncControlBar()
    }

    /**
     * @summary The detail vessel closed (user-closed or crashed): correlate by `windowId` and
     * bring the inspector HOME through the standard reattach — the document records the return
     * and the projection re-adopts the parked instance. A reattach-initiated close never
     * re-enters: {@link #reattachAgentDetail} clears the bookkeeping before closing the vessel.
     * @param {Object} data `{appName, windowId}`
     * @protected
     */
    onWindowDisconnect(data) {
        let me = this;

        if (me.isDestroyed) return;

        if (me.detachedDetail?.windowId === data.windowId) {
            me.reattachAgentDetail({windowAlreadyClosed: true});
            return
        }

        // Tear-out vessel death: the item comes HOME. A window disconnect is a render-target
        // signal ONLY — the worker fires `disconnect` without destroying the popup application
        // or its view tree, so the captured pane survives LIVE and ownership settles through
        // {@link #reintegrateTearOutItem}: same instance back at its stored position, semantic
        // fallback when the home node left the tree, destruction only as the no-home terminal.
        // The records retire BEFORE the reintegration so the torn stand-in guard cannot fire on
        // the returning item's re-projection.
        for (const [itemId, entry] of Object.entries(me.tearOutPanes || {})) {
            if (entry.windowId === data.windowId) {
                let pane = me.tearOutPaneHandles?.[itemId];

                delete me.tearOutPanes[itemId];
                delete me.tearOutConnects?.[itemId];
                delete me.tearOutPaneHandles?.[itemId];
                me.reintegrateTearOutItem(itemId, pane || null);
                me.syncControlBar();
                break
            }
        }
    }

    /**
     * @summary Keep the open detail inspector truthful over time — route the roster store's
     * `recordChange` to the live {@link AgentOS.view.fleet.AgentDetail} when the changed record
     * is the one being inspected (mirrors how the grid routes `recordChange` to its cards). A roster
     * re-poll mutating the selected resident (state, lane, sources) thus re-renders the detail in
     * place — the view is reactive to record MUTATION, not only to a re-seat onto a new record.
     * Routed through {@link #getAgentDetailPane} so a popped-out inspector updates exactly like a
     * docked one.
     * @param {Object} data The store `recordChange` event `{record, ...}`.
     * @protected
     */
    onDetailRecordChange({record}) {
        if (record === this.detailRecord) {
            this.getAgentDetailPane()?.applyRecord()
        }
    }

    /**
     * @summary Keep the owner-held selection truthful across authoritative roster transitions —
     * membership reactivity, distinct from the mutation reactivity {@link #onDetailRecordChange} covers.
     *
     * `recordChange` fires when the inspected resident MUTATES, but a membership change is a different
     * Store edge: {@link Neo.data.Store#remove} drops a record WITHOUT firing `recordChange` on it, and
     * the first-live replacement (`clear` + `add`) swaps the sample instance for a fresh one. Either
     * leaves `detailRecord` pointing at a record the roster no longer holds — the inspector then
     * presents a resident the authority says is absent, which is user-visible misinformation. So after
     * every authoritative reconcile/replace: if the selected durable `agentId` still exists, re-seat
     * `detailRecord` onto the Store's CURRENT instance (a re-seat only when the object actually changed —
     * an in-place `record.set` reconcile keeps the same instance, already covered by `recordChange`); if
     * it is gone (including an empty snapshot), clear the selection so {@link AgentOS.view.fleet.AgentDetail}
     * renders its honest empty state rather than a ghost resident.
     * @protected
     */
    reconcileSelection() {
        let me = this;

        if (!me.detailRecord) {
            return
        }

        const
            store   = me.getReference('fleet-grid')?.store,
            current = store?.get(me.detailRecord.agentId) ?? null;

        if (current !== me.detailRecord) {
            me.detailRecord = current;
            me.getAgentDetailPane()?.set({record: current})
        }
    }

    /**
     * @summary Detach the roster-store load guard, the vessel lifecycle listeners and the drop
     * producer; the provider tears the owned store itself down. A still-detached inspector is
     * OWNED state outside any projection: bump the generation (in-flight admission continuations
     * go inert), clear the connect timer, close its vessel (fire-and-forget — the guard in
     * {@link #onWindowDisconnect} keeps a late event inert) and destroy the instance. Live
     * tear-out vessels and their owner-held panes retire through {@link #retireTearOutState}.
     * @param {...*} args
     */
    destroy(...args) {
        let me = this;

        me.stopLiveness();

        // the wake stream dies with its composition root — a consumer that outlives the cockpit
        // would keep a credentialed connection open on behalf of a surface that no longer exists
        me.viewerWakeConsumer?.stop();
        me.viewerWakeConsumer = null;
        me.viewerWakeBridge   = null;

        me.getReference('fleet-grid')?.store?.un({load: me.onRosterStoreLoad, recordChange: me.onDetailRecordChange, scope: me});

        Neo.currentWorker.un({
            connect   : me.onWindowConnect,
            disconnect: me.onWindowDisconnect,
            scope     : me
        });

        me.detailVesselGeneration++;

        if (me.detachedDetail) {
            me.detachedDetail.connectTimer && clearTimeout(me.detachedDetail.connectTimer);
            Neo.Main.windowClose({names: [me.detachedDetail.windowName], windowId: me.windowId}).catch(() => {});
            me.detachedDetail = null
        }

        me.detachedDetailPane?.destroy();
        me.detachedDetailPane = null;

        me.retireTearOutState();

        me.dockPreviewProducer?.destroy();
        me.dockPreviewProducer = null;
        me.dockService?.destroy();
        me.dockService = null;
        me.perspectiveStore?.destroy();
        me.perspectiveStore = null;
        super.destroy(...args)
    }

    /**
     * @summary Bind the activity stream to the live fleet feed: poll the read-observe `fleetActivity`
     * verb on the injected registry bridge and route its honest capability state to the stream:
     * - `wired` → **live** (the feed is newest-first; the stream renders chronological, so reverse). A
     *   wired source is live even when momentarily empty — it is streaming, just quiet — so an empty
     *   wired feed stays `live` (empty), never the sample: falling back to the sample would falsely
     *   imply the source is not wired.
     * - `degraded` → the **stale** banner.
     * - not-wired / absent bridge / a thrown source → leave the representative **sample** in place
     *   (honestly labelled by the stream header); fail closed rather than blanking the surface.
     * The routed state also lands on the OWNER ({@link #streamAdapterState} / {@link #streamEvents})
     * so a pane returning from true absence materializes at current truth.
     * @protected
     */
    async loadActivity() {
        let me     = this,
            stream = me.getReference('activity-stream'),
            bridge = globalThis.AgentOS?.fleet?.registryBridge;

        // BEFORE the early return, not after. Absence is newer knowledge, and an older pending read
        // must not outlive it: without the bump, a tick that finds the bridge gone returns silently
        // and an in-flight read from when it was present still lands and writes.
        const generation = ++me.streamReadGeneration;

        if (!stream || typeof bridge?.fleetActivity !== 'function') {
            // no bridge/verb IS the cold truth — the spine banner must say so. Same retraction
            // duty as the roster twin's absence exit: a never-wired surface's retained
            // producer-answered cause ("activity source not wired") must not outlive the bridge
            // that answered it; wired surfaces keep their stale/live semantics.
            if (me.streamAdapterState === 'sample') {
                me.streamDegradedReason = null
            }

            me.syncSpineBanner();
            return
        }

        try {
            me.streamReadInFlight++;

            // `Promise.resolve().then(() => …)` — NOT `Promise.resolve(bridge.fleetActivity())`.
            // The argument form evaluates the CALL first, so a SYNCHRONOUS throw lands in this
            // method's catch before `boundedRead` ever attaches its settle hook, and the counter
            // never comes back. Two sync throws consume the cap and suppress this surface forever —
            // the leak, rebuilt inside the fix for the leak. Invoking INSIDE the chain turns a sync
            // throw into a rejection of the tracked promise, so the reject path owns the release.
            const {capability, events} = await boundedRead(
                Promise.resolve().then(() => bridge.fleetActivity()),
                me.livenessReadTimeout,
                () => { me.streamReadInFlight-- }
            ) ?? {};

            // The fence. Older news must never overwrite newer: an interval re-poll means two reads
            // of THIS surface can be in flight at once, and without this the LOSER writes last —
            // a slow failed poll landing after a fast successful one regresses live → stale on
            // strictly staler information. `isDestroyed` is the same question at the other end: a
            // read that outlives its owner has no surface left to speak for.
            if (generation !== me.streamReadGeneration || me.isDestroyed) {
                return
            }

            if (capability?.state === 'wired') {
                me.streamAdapterState = 'live';
                me.streamEvents       = Array.isArray(events) ? events.slice().reverse() : [];
                stream.set({adapterState: me.streamAdapterState, events: me.streamEvents});
                me.clearDegradedReason('stream')
            } else if (capability?.state === 'degraded') {
                me.streamAdapterState = 'stale';
                stream.adapterState   = 'stale';
                // the adapter's OWN reason outranks a guess — it saw the failure, we only saw the answer
                me.streamDegradedReason = toSafeDegradedReason(capability.reason)
            } else if (capability) {
                // The producer ANSWERED and said it is not wired (`not-wired`). The seed stays — the
                // stream really is showing sample events, so its own state is honestly 'sample' — but
                // an answer is not silence, and the difference is the whole point: a reachable server
                // whose activity source is unconfigured is NOT an unreachable server. Retaining the
                // reason is what lets the banner say which one it is instead of guessing the loudest.
                me.streamDegradedReason = toSafeDegradedReason(capability.reason)
            }
            // NO capability at all (a torn/absent answer) → keep the 'sample' seed AND no reason:
            // we learned nothing, so the banner falls back to its generic copy rather than inventing
            // a cause. That is the genuine cold case.
        } catch (error) {
            // fenced too, and this is the branch that actually bit: a slow FAILURE landing after a
            // fast success would regress live → stale on older news. The catch is not exempt from
            // ordering just because it is the sad path.
            if (generation === me.streamReadGeneration && !me.isDestroyed) {
                // fail-closed: the last-known feed STAYS rather than blanking it — only the state advances
                me.degradeWiredSurface('stream', error, stream)
            }
        } finally {
            // a superseded or post-destroy read renders nothing: syncing here would let a dropped
            // read still repaint the banner from state it was not allowed to write
            if (generation === me.streamReadGeneration && !me.isDestroyed) {
                me.syncSpineBanner()
            }
        }
    }

    /**
     * @summary Bind the fleet roster to the running fleet: poll the read-observe `fleetRoster` verb
     * on the injected registry bridge — the Brain-side assembler DTO (`{sources, capabilities, rows,
     * events}`, identity-enriched per the `resolveIdentityDisplay` join) — map its rows onto the
     * FleetAgent record contract, and route honestly into the Store the grid renders from:
     * - a populated resolved snapshot is **authoritative**: the first one replaces the sample seed
     *   and promotes {@link #rosterSourceMode} to `selected`; every later one **reconciles** the
     *   Store — `record.set(row)` per known `agentId`, `store.add` for a joiner, `store.remove` for
     *   a resident absent from the snapshot (a `removeAgent` must never leave a ghost card).
     * - an EMPTY first snapshot preserves the bundled sample while the source mode is `sample` — a
     *   fresh private registry must not blank the zero-setup first paint. It becomes authoritative
     *   when the source was explicitly `selected`, or after any live snapshot established
     *   {@link #rosterWired}; a genuinely selected/drained fleet therefore still renders its TRUE
     *   zero state rather than resurrecting sample residents.
     *   Every admitted snapshot makes the grid `live` (instance + owner-held fallback state).
     * - absent bridge / no verb / a MALFORMED answer (`rows` not an Array) / a thrown source →
     *   keep the last-known roster; fail closed rather than blanking the fleet. A resolved call is
     *   mechanically distinguishable from a failed one — only failures preserve last-known state.
     *   Absence and thrown calls are DISTINCT transitions with one shared retraction duty: a
     *   never-wired surface's retained answered cause is withdrawn on either (the claim must not
     *   outlive its producer), while a wired surface keeps its stale/live semantics. (The grid's
     *   `stale` render remains reserved for a real degraded signal once a producer emits one.)
     * @protected
     */
    async loadRoster() {
        let me     = this,
            grid   = me.getReference('fleet-grid'),
            bridge = globalThis.AgentOS?.fleet?.registryBridge;

        // BEFORE the early return — absence is newer knowledge and must invalidate an older pending
        // read. See {@link #gridReadGeneration}.
        const generation = ++me.gridReadGeneration;

        if (!grid?.store || typeof bridge?.fleetRoster !== 'function') {
            // no bridge/verb IS the cold truth — the spine banner must say so. Absence is a
            // DISTINCT transition from a thrown call, and it owns the same retraction duty: a
            // never-wired surface's retained ANSWERED cause ("server connected · registry
            // empty") must not outlive the bridge that said it. A wired surface keeps its
            // stale/live semantics — this exit only speaks for cold truth.
            if (me.gridAdapterState === 'sample') {
                me.gridDegradedReason = null
            }

            me.syncSpineBanner();
            return
        }

        try {
            me.gridReadInFlight++;

            // invoked INSIDE the chain so a synchronous throw rejects the tracked promise rather
            // than escaping before the settle hook attaches — see the activity twin
            const {capabilities, rows} = await boundedRead(
                Promise.resolve().then(() => bridge.fleetRoster()),
                me.livenessReadTimeout,
                () => { me.gridReadInFlight-- }
            ) ?? {};

            // the fence: a newer read started while this one was in flight, or the owner is gone.
            // Either way this answer is no longer this surface's truth to write.
            if (generation !== me.gridReadGeneration || me.isDestroyed) {
                return
            }

            if (!Array.isArray(rows)) {
                return // malformed answer → keep the last-known roster
            }

            const mapped = rows.filter(row => row?.id).map(row => me.mapRosterRow(row));

            // The shipped sample is the cold-first-run authority. A reachable but fresh/empty
            // private registry has answered, but it has not supplied a working fleet and no source
            // was selected — replacing the sample here would turn successful boot into an empty
            // flagship. An explicitly wired bridge (the injector marks it `selected`) IS a source
            // selection, so its empty registry renders the true zero state; once any populated
            // snapshot made the surface live, empty regains its ordinary authoritative meaning
            // (the real fleet may genuinely drain).
            if (!me.rosterWired && mapped.length === 0 && !bridge?.selected && me.rosterSourceMode !== 'selected') {
                // The server ANSWERED — but an answer is not silence (the activity twin's not-wired
                // discipline): retain the cause so the spine banner names "connected · registry
                // empty" instead of falling back to "server offline · start it" — advice to restart
                // a process that just replied, and the exact reachable-server case the spineBanner
                // module documents as needing a retained reason. Cleared by the ordinary paths: a
                // populated snapshot clears it below; a transport failure retracts it in
                // {@link #degradeWiredSurface} (the claim must not outlive the connection).
                me.gridDegradedReason = 'server connected · fleet registry empty — define agents to go live';
                return
            }

            me.lastLiveRows = mapped;
            me.rosterSourceMode = 'selected';

            if (me.rosterWired) {
                me.reconcileRoster(grid.store, mapped)
            } else {
                grid.store.clear();
                mapped.length > 0 && grid.store.add(mapped);
                me.rosterWired = true;
                // the first live snapshot replaces the sample seed wholesale — re-seat or clear a
                // selection made against a now-removed sample record (reconcileRoster owns the later reconciles)
                me.reconcileSelection()
            }

            me.gridAdapterState = 'live';
            grid.adapterState   = 'live';
            // the presence-CAPABILITY envelope rides every admitted snapshot onto the grid's chip:
            // a degraded producer gets NAMED at roster level (every band correctly vanished — the
            // "no one is online" operator falsifier), and a recovered producer clears it on the
            // next poll. Absent/malformed envelopes plumb null — the chip claims nothing.
            grid.presenceCapability = capabilities?.presence ?? null;
            me.getCatchUpPane()?.set({partitionOptions: me.buildCatchUpPartitionOptions()});
            me.getMemoriesPane()?.set({agentOptions: me.buildMemoriesAgentOptions()});
            // the activity rows' actor chips join the same roster truth (avatar + display name)
            me.getReference('activity-stream')?.set({actorDirectory: me.buildActivityActorDirectory()});
            // resident panes snapshot their roster-derived options at projection time, which can
            // precede this first live answer — every consumer refreshes here, the mailbox included
            // (recipients grow beyond the boot-time AGENT:* sentinel), and the seat-conflation
            // posture re-derives against the roster that can now actually judge it.
            me.getOperatorMailboxPane()?.set({recipientOptions: me.buildOperatorRecipientOptions()});
            if (me.operatorRecord) {
                me.operatorIdentityPosture = me.deriveOperatorIdentityPosture(me.operatorRecord.agentIdentityNodeId);
                me.getOperatorMailboxPane()?.set({identityPosture: me.operatorIdentityPosture})
            }
            // a resident CatchUp can emit its construction-time history request BEFORE the bridge
            // wires (the cold-before-bridge ordering); that one-shot miss recovers the moment the
            // bridge answers, through the pane's own guarded refresh path — the Reconnect
            // affordance's documented re-drive, fired automatically at bridge arrival.
            me.catchUpSnapshot?.capability?.state === 'unavailable' && me.getCatchUpPane()?.onRefreshClick();
            me.clearDegradedReason('grid')
        } catch (error) {
            // fenced: a slow failure must not overwrite a newer success (see the stream twin)
            if (generation === me.gridReadGeneration && !me.isDestroyed) {
                // fail-closed: the last-known roster STAYS rather than blanking the fleet — only the
                // state advances. A wired surface that stops answering is degraded, not cold: it is
                // showing last-known LIVE rows, so claiming 'sample' would tell the operator they are
                // looking at fixture data. Pre-wired failures keep the honest 'sample' seed.
                me.degradeWiredSurface('grid', error, grid)
            }
        } finally {
            if (generation === me.gridReadGeneration && !me.isDestroyed) {
                me.syncSpineBanner()
            }
        }
    }

    /**
     * @summary Roster-joined actor facts for the activity stream's chips — `agentId →
     * {avatarUrl, displayName}` from the SAME provider-owned roster every other surface reads
     * (no second resident list). Rows without the facts contribute nothing: the stream renders a
     * missing entry handle-only, per its honest-absence contract.
     * @returns {Object}
     */
    buildActivityActorDirectory() {
        const rows = this.resolveFleetRosterStore()?.items ?? [];

        return Object.fromEntries(rows
            .filter(row => row.agentId)
            .map(row => [row.agentId, {
                ...(row.avatarUrl   ? {avatarUrl: row.avatarUrl}     : {}),
                ...(row.displayName ? {displayName: row.displayName} : {})
            }])
        )
    }

    /**
     * @summary Build the operator-compose recipient options from the LIVE roster — `{id, name}` records
     * the picker's ChipField store renders. The `id` is the mailbox IDENTITY (`@githubUsername`), NOT the
     * roster `agentId` (a Fleet key like `vega`), plus the `AGENT:*` broadcast sentinel. Empty until the
     * roster resolves — the pane picks recipients from a real current fleet, never a hand-mapped list.
     * @returns {Object[]}
     */
    buildOperatorRecipientOptions() {
        const rows = this.resolveFleetRosterStore()?.items ?? [];

        return [
            {id: 'AGENT:*', name: 'All agents (broadcast)'},
            ...rows
                .filter(row => row.githubUsername)
                .map(row => ({id: `@${row.githubUsername}`, name: row.githubUsername}))
        ]
    }

    /**
     * @summary Build canonical Fleet/agent Memory partitions from the live roster Store. PR history
     * remains Fleet-wide; these choices alter only the Memory operation in the Brain adapter.
     * @returns {Object[]}
     */
    buildCatchUpPartitionOptions() {
        const rows = this.resolveFleetRosterStore()?.items ?? [];

        return rows
            .filter(row => row.githubUsername)
            .map(row => ({
                id       : `catch-up-${row.agentId}`,
                label    : row.displayName || row.githubUsername,
                partition: `@${row.githubUsername}`
            }))
    }

    /**
     * @summary Build the memories-pane agent choices from the live roster Store — canonical
     * `@identity` targets for the `fleetMemories` session-summary read. Same provider-owned
     * roster as the cards; the summary corpus is the team-visible cross-author read, so the wire
     * carries the target and paging only — never a viewer claim.
     * @returns {Object[]}
     */
    buildMemoriesAgentOptions() {
        const rows = this.resolveFleetRosterStore()?.items ?? [];

        return rows
            .filter(row => row.githubUsername)
            .map(row => ({
                id           : `memories-${row.agentId}`,
                label        : row.displayName || row.githubUsername,
                agentIdentity: `@${row.githubUsername}`
            }))
    }

    /**
     * @summary READ-OBSERVE: route one pane history intent through the authenticated Fleet verb and
     * write the returned source envelopes back as owner state. Fail-closed: absence/throw becomes an
     * explicit unavailable snapshot, never an empty historical claim.
     * @param {Object} [params]
     * @returns {Promise<Object>}
     */
    async loadCatchUp(params = {}) {
        const me         = this,
              pane       = me.getReference('catch-up'),
              bridge     = globalThis.AgentOS?.fleet?.registryBridge,
              generation = ++me.catchUpReadGeneration;

        let snapshot;

        if (typeof bridge?.fleetHistory !== 'function') {
            snapshot = {
                capability         : {state: 'unavailable', reason: 'fleet history verb not wired'},
                needsFirstUseWindow: false,
                partition          : params.partition || 'unified',
                viewerState        : {lastSeen: null, lastVisitAt: null},
                window             : null,
                sources            : null
            }
        } else {
            try {
                snapshot = await bridge.fleetHistory(params)
            } catch (error) {
                snapshot = {
                    capability         : {state: 'unavailable', reason: 'fleet history read failed'},
                    needsFirstUseWindow: false,
                    partition          : params.partition || 'unified',
                    viewerState        : {lastSeen: null, lastVisitAt: null},
                    window             : null,
                    sources            : null
                }
            }
        }

        if (generation === me.catchUpReadGeneration && !me.isDestroyed) {
            me.catchUpSnapshot = snapshot;
            pane && (pane.snapshot = snapshot)
        }

        return snapshot
    }

    /**
     * @summary RUNTIME-WRITE: advance the authenticated viewer's lastSeen only through the pane's
     * rendered window end, then write the honest outcome back to the pane.
     * @param {Object} params `{windowEnd}`
     * @returns {Promise<Object>}
     */
    async markCatchUp(params) {
        const me     = this,
              pane   = me.getReference('catch-up'),
              bridge = globalThis.AgentOS?.fleet?.registryBridge;

        let outcome;

        try {
            outcome = typeof bridge?.markFleetCaughtUp === 'function'
                ? await bridge.markFleetCaughtUp(params)
                : {status: 'not-wired', reason: 'fleet catch-up mark verb not wired'}
        } catch (error) {
            outcome = {status: 'error', reason: 'fleet catch-up mark failed'}
        }

        if (!me.isDestroyed) {
            me.catchUpMarkOutcome = outcome;
            pane && (pane.markOutcome = outcome)
        }

        return outcome
    }

    /**
     * @summary READ-OBSERVE: route one pane memories intent through the authenticated Fleet verb
     * and write the returned source envelope back as owner state. Fail-closed: absence/throw
     * becomes an explicit unavailable envelope, never an empty historical claim. Generation-fenced
     * so a slow older read never overwrites a newer target's rows.
     * @param {Object} [params] `{agentIdentity, offset?, limit?}`
     * @returns {Promise<Object>}
     */
    async loadMemories(params = {}) {
        const me         = this,
              bridge     = globalThis.AgentOS?.fleet?.registryBridge,
              generation = ++me.memoriesReadGeneration;

        // Owner-hold the requested selection BEFORE any await: a pane removed and rematerialized
        // while this read is in flight must reopen on the PENDING target (honest switch-pending
        // state), not on the last accepted snapshot's target and not with a null selection.
        if (params.agentIdentity) {
            me.memoriesTarget = params.agentIdentity
        }

        const
              fallback   = reason => ({
                  capability: {state: 'unavailable', reason},
                  viewer    : null,
                  target    : params.agentIdentity || null,
                  page      : {offset: params.offset ?? 0, limit: null},
                  sessions  : [],
                  count     : 0,
                  total     : null
              });

        let snapshot;

        if (typeof bridge?.fleetMemories !== 'function') {
            snapshot = fallback('fleet memories verb not wired')
        } else {
            try {
                snapshot = await bridge.fleetMemories(params)
            } catch (error) {
                snapshot = fallback('fleet memories read failed')
            }
        }

        if (generation === me.memoriesReadGeneration && !me.isDestroyed) {
            me.memoriesSnapshot = snapshot;

            // Resolve the pane at WRITE time, not call time: the pane can be removed and
            // rematerialized while this read was in flight — a call-time reference would write
            // the accepted truth into the DESTROYED instance and leave the live pane pending
            // forever. The owner state above plus this live-resolve keep both variants coherent.
            const livePane = me.getMemoriesPane();

            livePane && (livePane.snapshot = snapshot)
        }

        return snapshot
    }

    /**
     * @summary Read one page of a session's turn-level memories through the cockpit-owned
     * authenticated bridge — the memories drill-in, {@link #loadMemories}' discipline one level
     * down: the open drill is owner-held BEFORE any await (a pane rematerialized mid-read reopens
     * on the pending drill), the read is generation-fenced, an unwired verb or throwing bridge
     * lands as a typed unavailable envelope, and the pane resolves at WRITE time through the
     * phase-blind accessor so a vesseled or returning-parked pane receives the truth too.
     * @param {Object} params `{sessionId, title?, offset?, limit?}` — `title` is owner/display
     *     state only and never rides the wire call.
     * @returns {Promise<Object>}
     */
    async loadSessionMemories(params = {}) {
        const me         = this,
              bridge     = globalThis.AgentOS?.fleet?.registryBridge,
              generation = ++me.memoriesDrillReadGeneration;

        if (params.sessionId) {
            me.memoriesDrillSession = {sessionId: params.sessionId, title: params.title ?? null}
        }

        const
              {title, ...wireParams} = params,
              fallback               = reason => ({
                  capability: {state: 'unavailable', reason},
                  viewer    : null,
                  sessionId : params.sessionId || null,
                  page      : {offset: params.offset ?? 0, limit: null},
                  turns     : [],
                  count     : 0,
                  total     : null
              });

        let snapshot;

        if (typeof bridge?.fleetSessionMemories !== 'function') {
            snapshot = fallback('fleet session-memories verb not wired')
        } else {
            try {
                snapshot = await bridge.fleetSessionMemories(wireParams)
            } catch (error) {
                snapshot = fallback('fleet session-memories read failed')
            }
        }

        if (generation === me.memoriesDrillReadGeneration && !me.isDestroyed) {
            me.memoriesDrillSnapshot = snapshot;

            const livePane = me.getMemoriesPane();

            livePane && (livePane.drillSnapshot = snapshot)
        }

        return snapshot
    }

    /**
     * @summary Clear the owner-held memories drill-in — the pane's close intent lands here, so a
     * later rematerialization reopens the summary list, never a drill the operator already left.
     * The last accepted drill snapshot leaves with the session: holding it would rematerialize
     * rows no open drill points at.
     *
     * The generation bump makes the close TERMINAL for in-flight reads: the counter is the
     * change-proxy for "is this read still wanted", and close is a second way to make a read
     * unwanted — without the bump, a read landing after close would repopulate the owner state
     * (and the pane) for exactly the drill the operator left, held harmless only as long as
     * every render stays keyed on the session rather than the snapshot.
     */
    clearSessionMemoriesDrill() {
        this.memoriesDrillReadGeneration++;
        this.memoriesDrillSession  = null;
        this.memoriesDrillSnapshot = null
    }

    /**
     * @summary Read the decomposed per-seat wake-route envelope through the cockpit-owned
     * authenticated bridge — the memories sibling, same discipline end to end: generation-fenced
     * (a slow older read never overwrites a newer one), fail-honest (an unwired verb or a throwing
     * bridge lands as a typed unavailable envelope, never fabricated seats), and the pane resolves
     * at WRITE time so a removed-and-rematerialized pane receives the accepted truth instead of a
     * destroyed instance swallowing it.
     * @param {Object} [params]
     * @returns {Promise<Object>}
     */
    async loadWakeRoutes(params = {}) {
        const me         = this,
              bridge     = globalThis.AgentOS?.fleet?.registryBridge,
              generation = ++me.wakeRoutesReadGeneration,
              fallback   = reason => ({
                  capability: {state: 'unavailable', reason},
                  viewer    : null,
                  count     : 0,
                  seats     : []
              });

        let snapshot;

        if (typeof bridge?.fleetWakeRoutes !== 'function') {
            snapshot = fallback('fleet wake-routes verb not wired')
        } else {
            try {
                snapshot = await bridge.fleetWakeRoutes(params)
            } catch (error) {
                snapshot = fallback('fleet wake-routes read failed')
            }
        }

        if (generation === me.wakeRoutesReadGeneration && !me.isDestroyed) {
            me.wakeRoutesSnapshot = snapshot;

            const livePane = me.getReference('wakeRoutes');

            livePane && (livePane.snapshot = snapshot)
        }

        return snapshot
    }

    /**
     * @summary Focus the existing bounded live Activity surface as adjacency. No history citation is
     * injected into it and no alternate historical authority is implied.
     *
     * The stream is a resident south tab, so adjacency ACTIVATES its tab first: the jump usually
     * originates from a sibling reading surface (catch-up) whose tab is active, and focusing the
     * inactive card's unmounted DOM would be a silent no-op.
     * @param {Object} request `{target}`
     * @returns {Promise<{opened: Boolean, target: String}>}
     */
    async openCatchUpLiveSurface({target} = {}) {
        const me     = this,
              stream = target === 'activity-stream' ? me.getReference('activity-stream') : null;

        if (!stream) {
            return {opened: false, target: target || 'unknown'}
        }

        const strip = me.down({dockNodeId: 'stream-tabs'}),
              index = me.dockModel?.nodes?.['stream-tabs']?.items?.indexOf('stream') ?? -1;

        if (strip && index > -1 && strip.activeIndex !== index) {
            strip.activeIndex = index;
            // the card layout mounts the newly active item asynchronously; focus needs the DOM
            await me.timeout(50)
        }

        stream.focus(stream.id, false, true);

        return {opened: true, target}
    }

    /**
     * @summary WRITE: route one operator-composed message to the authenticated `composeOperatorMessage`
     * verb — one, several, or the `AGENT:*` broadcast — then re-poll the operator inbox so the sent
     * rows land at CANONICAL truth, never an optimistic insert. The cockpit is the composition root
     * that knows the bridge; the sender is server-stamped from the bound viewer at the authenticated
     * ingress, never carried in this payload.
     *
     * **The verb is one-target, so SEVERAL named recipients fan out.** The compose surface emits `to`
     * as a list; the authenticated verb accepts one `@login` or the `AGENT:*` sentinel per call, so
     * each named recipient is a separate authenticated call and carries its OWN outcome — an operator
     * steering three peers learns each landed (or refused) independently, never one aggregate verdict.
     * `AGENT:*` stays a single call (the server expands the broadcast from the one sentinel target); a
     * scalar `to` stays one call (back-compatible).
     *
     * Fail-closed: no bridge / no verb → an honest per-recipient `not-wired` refusal, nothing attempted;
     * a thrown bridge promise is caught as that recipient's `error` outcome, never a detached rejection.
     * The inbox re-polls exactly ONCE for the batch, and only when a real send landed (a `messageId`
     * came back) — not-wired / rejected / error changed nothing.
     * @param {Object} message `{to, subject, body, priority?, wakeSuppressed?, relatedTickets?}` — `to`
     *     is one `@login` / `AGENT:*`, or a list of them.
     * @returns {Promise<Object>} `{results: [{to, outcome}]}` — one entry per target, in order, each
     *     outcome the verb's own (`{messageId, …}` sent | `{status:'not-wired'|'rejected'|'error', …}`).
     */
    async composeOperatorMessage(message) {
        const
            me      = this,
            bridge  = globalThis.AgentOS?.fleet?.registryBridge,
            targets = Array.isArray(message.to) ? message.to : (message.to == null ? [] : [message.to]),
            wired   = typeof bridge?.composeOperatorMessage === 'function',
            results = [];

        for (const to of targets) {
            if (!wired) {
                results.push({to, outcome: {status: 'not-wired', reason: 'fleet: operator compose verb not wired'}});
                continue
            }

            let outcome;

            try {
                // one target per call; the spread never mutates the caller's payload and never carries
                // the list — and the sender is server-stamped, never a field here
                outcome = await bridge.composeOperatorMessage({...message, to})
            } catch (error) {
                outcome = {status: 'error', reason: error?.message || 'compose failed'}
            }

            results.push({to, outcome})
        }

        // a real send anywhere (a messageId came back) re-polls the inbox ONCE so the sent rows land at
        // canonical truth; not-wired / rejected / error changed nothing, so there is nothing to re-read
        if (results.some(result => result.outcome?.messageId)) {
            await me.loadOperatorInbox({offset: 0})
        }

        return {results}
    }

    /**
     * @summary BOOT: resolve the operator's OWN identity from the authenticated bridge (whoami) and hold it
     * owner-side so the operator-mailbox pane can read its own inbox — the missing bootstrap leg of "the
     * client SAYS self, the admission stamp proves it". The mirror read requires an EXPLICIT subjectAgentId
     * (never a viewer-default — a self-default at a trust boundary is spoof-adjacent), so the cockpit first
     * learns its own @-id via `resolveViewerIdentity`, then the pane passes it and the mirror's admission
     * re-stamps + proves it. Pushing the record to a materialized pane drives its first read (the pane fires
     * `inboxPageRequest` on a newly-bound identity); an autoHidden pane materializes from the held record on
     * reveal. Fail-closed: an unwired source / unbound context / absent bridge leaves `operatorRecord` null,
     * so the pane stays honestly unobserved — never a fabricated or fallback identity.
     * @protected
     */
    async loadOperatorIdentity() {
        const
            me     = this,
            bridge = globalThis.AgentOS?.fleet?.registryBridge;

        if (typeof bridge?.resolveViewerIdentity !== 'function') {
            return
        }

        const outcome = await bridge.resolveViewerIdentity();

        // {ok:true, agentIdentityNodeId} | {ok:false, error} (source-not-wired | unbound). Only a proven
        // identity seeds the subject; a refusal never reads a wrong inbox.
        if (outcome?.ok && outcome.agentIdentityNodeId && !me.isDestroyed) {
            const nodeId = outcome.agentIdentityNodeId;
            // the reused MailboxPane proves possession from `record.githubUsername` — it canonicalizes it
            // to `@<username>` and matches the mirror admission's `subjectAgentId`. Seeding only the node
            // id fails that guard closed and the own inbox NEVER renders. The resolved node id IS the
            // `@`-form authority, so carry both: `githubUsername` for the possession match, the node id as
            // the explicit read subject (they canonicalize to the same value).
            me.operatorRecord = {agentIdentityNodeId: nodeId, githubUsername: nodeId.replace(/^@/, '')};
            // the seat-conflation honesty check rides the same resolution: the roster the cockpit
            // already holds knows every registered agent identity, and a viewer claim matching one
            // means sends are attributed to that seat — a truth the pane must render, not swallow
            me.operatorIdentityPosture = me.deriveOperatorIdentityPosture(nodeId);
            // a materialized pane picks up the identity live and reads; when this resolution loses
            // the boot race instead, the resident pane already projected without a record and takes
            // the identity through this same live set — both orderings land exactly one first read
            me.getOperatorMailboxPane()?.set({record: me.operatorRecord, identityPosture: me.operatorIdentityPosture})
        }
    }

    /**
     * @summary Compare the resolved viewer identity against the provider-owned roster's agent
     * identities — the cockpit half of the seat-conflation honesty contract (the fleet server
     * runs the same decision server-side at boot over the registry; the check is trivial enough
     * that duplicating it beats an app→Brain import across the parity boundary).
     *
     * An empty roster answers `null` (cannot judge) rather than `{conflated: false}` — absence of
     * roster truth is not a clean bill, and the pane renders unknown as unknown.
     * @param {String} viewerIdentity The resolved `@`-form viewer identity.
     * @returns {{conflated: Boolean, seatIdentity: String}|null}
     */
    deriveOperatorIdentityPosture(viewerIdentity) {
        const rows = this.resolveFleetRosterStore()?.items ?? [];

        if (typeof viewerIdentity !== 'string' || !viewerIdentity.trim() || rows.length < 1) {
            return null
        }

        const
            bare      = id => String(id).trim().replace(/^@/, ''),
            viewer    = bare(viewerIdentity),
            conflated = rows.some(row => bare(row.agentId ?? '') === viewer);

        return {conflated, seatIdentity: `@${viewer}`}
    }

    /**
     * @summary READ-OBSERVE: re-read the OPERATOR's own mailbox mirror at `offset` and route the snapshot
     * to the operator-mailbox pane — the own-inbox twin of {@link AgentOS.view.fleet.AgentDetail#loadMailboxMirror}.
     * Generation-fenced (older news never overwrites newer) and fail-closed (the pane stays honestly
     * unobserved rather than inventing a snapshot). The viewer is server-resolved from the ingress request
     * context; the subject is the operator's own identity, held owner-side.
     * @param {Object} [params]
     * @param {Number} [params.offset=0]
     * @protected
     */
    async loadOperatorInbox({offset = 0} = {}) {
        const
            me      = this,
            pane    = me.getOperatorMailboxPane(),
            bridge  = globalThis.AgentOS?.fleet?.registryBridge,
            subject = me.operatorRecord?.agentIdentityNodeId;

        const generation = ++me.operatorInboxReadGeneration;

        if (!pane || !subject || typeof bridge?.fleetMailboxMirror !== 'function') {
            // no bound identity / no bridge / no verb IS the honest unobserved truth — never a fabricated
            // snapshot; the pane's own `unobserved` state stands until a real read lands
            return
        }

        try {
            const snapshot = await bridge.fleetMailboxMirror({subjectAgentId: subject, offset});

            // the fence: an interval re-poll or a post-compose re-read can race a page-request read; the
            // loser must not write staler news over newer, and a read outliving its owner has no pane to speak for
            if (generation === me.operatorInboxReadGeneration && !me.isDestroyed) {
                me.operatorSnapshot = snapshot;
                pane.snapshot       = snapshot
            }
        } catch (error) {
            // fail-closed: the last-known snapshot stays; the pane never renders "no mail" for a read that did not happen
        }
    }

    /**
     * @summary Starts the ongoing liveness owner — the mechanism that makes `live` mean live.
     *
     * Without it the cockpit polls once at construction (plus after settled lifecycle intents) and
     * every failure exit fail-closed PRESERVES the last-known state, so once a surface reaches
     * `live` a mid-session transport death never advances it: `live` silently decays into "was live
     * once", which is the dishonest state this owner exists to kill.
     *
     * **Mechanism (Tier-2 decision, recorded here):** an interval re-poll of the EXISTING read verbs,
     * not a separate ping. The contract requires the routing matrices in {@link #loadRoster} /
     * {@link #loadActivity} to remain the state-writing seams — a ping would need its own
     * failure→state mapping, i.e. a second writer that can disagree with the first. Re-driving the
     * real verbs keeps exactly one truth path and inherits their fail-closed data semantics for
     * free; the cost is a full roster payload per cadence, which {@link #reconcileRoster} already
     * absorbs idempotently. Revisit if the payload cost ever outgrows the honesty it buys.
     *
     * Idempotent: a second call never stacks a timer.
     * @protected
     */
    startLiveness() {
        let me = this;

        if (me.livenessTimerId !== null) return;

        // Per-surface overlap suppression, NOT just the generation fence. The fence makes a late read
        // HARMLESS; it does not make it ABSENT. A transport slower than the cadence would have each
        // tick launch another pair regardless of the unresolved prior one — unbounded in-flight reads
        // against a bridge already failing to answer, which is precisely when piling on is worst.
        // Skipping a tick loses nothing: the next one reads the same live truth, only later.
        me.livenessTimerId = setInterval(() => {
            if (me.streamReadInFlight      < me.maxReadsInFlight) me.loadActivity();
            if (me.gridReadInFlight        < me.maxReadsInFlight) me.loadRoster();
            if (me.brainHealthReadInFlight < me.maxReadsInFlight) me.loadBrainHealth();

            // no in-flight cap: this launches no wire read — it compares bridge identity (the
            // custody-heal rebuild trigger) and copies the consumer's local observations
            me.ensureViewerWakeStream()
        }, me.livenessPollInterval);

        // The daemon surface has no other first read: unlike roster/activity (seeded then wired
        // elsewhere), waiting a full cadence would leave a boot-time fault invisible for it.
        me.loadBrainHealth()
    }

    /**
     * @summary Stops the liveness owner — exact-once, and safe to call on a never-started cockpit.
     *
     * Bound to {@link #destroy} so the timer cannot outlive the surface it speaks for: a leaked
     * interval would keep re-polling the bridge on behalf of a destroyed cockpit and write states
     * onto detached children — a timer that outlives its owner is a liar with no one left to
     * correct it.
     *
     * NOT because of pop-out: {@link #popOutAgentDetail} reparents the AgentDetail into a vessel
     * and this cockpit stays alive as its holder — reparent-never-recreate, which is the whole
     * point of that path. The destroy that matters is the ordinary one (the shell tearing this view
     * down), and it is the only one this needs to survive.
     * @protected
     */
    stopLiveness() {
        let me = this;

        if (me.livenessTimerId !== null) {
            clearInterval(me.livenessTimerId);
            me.livenessTimerId = null
        }
    }

    /**
     * @summary Keeps the per-viewer wake stream bound to the CURRENT bridge's capability —
     * called at construct and on every liveness tick.
     *
     * Three honest outcomes, none of them a wire read:
     * - **capability present, bridge unchanged:** the running consumer stands; only the
     *   observation stamp refreshes.
     * - **bridge replaced (custody heal / explicit re-wire):** the old consumer is stopped and a
     *   fresh one opens through the NEW closure — a consumer must never outlive the credential
     *   custody it was built from, and `installFleetBridge` publishing a new object is exactly
     *   that boundary.
     * - **no capability (packaged shell, or no bridge yet):** any running consumer stops and the
     *   provider carries the honest not-wired state — absence of signal, never a fabricated
     *   stream.
     * @protected
     */
    ensureViewerWakeStream() {
        let me     = this,
            bridge = globalThis.AgentOS?.fleet?.registryBridge;

        if (!bridge?.openWakeStream) {
            if (me.viewerWakeConsumer) {
                me.viewerWakeConsumer.stop();
                me.viewerWakeConsumer = null;
                me.viewerWakeBridge   = null
            }

            me.stampViewerWake({
                stream: {
                    alive     : 'unknown',
                    reason    : 'wake push not wired — this composition carries no direct-browser wake capability',
                    capturedAt: Date.now()
                }
            });
            return
        }

        if (me.viewerWakeConsumer && me.viewerWakeBridge === bridge) {
            me.stampViewerWake();
            return
        }

        me.viewerWakeConsumer?.stop();

        me.viewerWakeConsumer = bridge.openWakeStream({
            onWake: signal => me.onViewerWakeSignal(signal),
            ...(me.wakePollDigest ? {pollDigest: me.wakePollDigest} : {})
        });
        me.viewerWakeBridge = bridge;

        me.viewerWakeConsumer.start();
        me.stampViewerWake()
    }

    /**
     * @summary Resolves the provider-owned viewer wake feed, tolerating compositions whose
     * provider config replaced the class default without the store: `Provider.getStore` walks the
     * parent chain and throws at the root for an unknown key, and a cockpit hosted under an
     * overridden provider must degrade the feed honestly (no signals to show) rather than crash
     * the whole surface.
     * @returns {Object|null}
     * @protected
     */
    getViewerWakeFeed() {
        try {
            return this.getStateProvider()?.getStore('viewerWakeFeed') ?? null
        } catch {
            return null
        }
    }

    /**
     * @summary One observed wake frame → the bounded feed + an immediate stamp. The record stores
     * the envelope's own field names verbatim ({@link AgentOS.model.WakeSignal}); a frame carrying
     * no envelope is still a receipt (the stream moved) but yields no feed row to fabricate.
     * @param {Object} signal `{subscriptionId, envelope, receivedAt}` from the consumer's `onWake`.
     * @protected
     */
    onViewerWakeSignal({subscriptionId, envelope, receivedAt}) {
        let me = this;

        if (me.isDestroyed) return;

        if (envelope?.eventId) {
            me.getViewerWakeFeed()?.addSignal({
                eventId  : envelope.eventId,
                kind     : envelope.eventType ?? 'wake',
                logId    : envelope.logId ?? null,
                emittedAt: envelope.emittedAt ?? null,
                receivedAt,
                subscriptionId
            })
        }

        me.stampViewerWake()
    }

    /**
     * @summary Writes the consumer's OWN observations into the provider (`viewerWake.stream` /
     * `viewerWake.catchUp` — the contract's data path) and re-renders the chrome telltale from
     * the same truth. One writer, two surfaces, zero re-judging: liveness vocabulary and catch-up
     * states pass through verbatim.
     * @param {Object} [override] `{stream}` for the not-wired stamp, when no consumer exists to ask.
     * @protected
     */
    stampViewerWake(override = null) {
        let me       = this,
            provider = me.getStateProvider(),
            consumer = me.viewerWakeConsumer;

        if (!provider) return;

        const
            stream  = override?.stream ?? (consumer
                ? {...consumer.resolveDeliveryLiveness(), capturedAt: Date.now()}
                : {alive: 'unknown', reason: 'wake stream not started', capturedAt: Date.now()}),
            catchUp = consumer?.describe().lastCatchUp ?? {state: null, at: null, pending: null};

        provider.setData('viewerWake', {stream, catchUp});
        me.syncViewerWakeTelltale()
    }

    /**
     * @summary Renders the chrome telltale chip from the provider-held viewer-wake truths plus the
     * feed's newest rows — pure derivation in, `text`/`title` out. `text`, never `html`: the chip
     * interpolates the consumer's reason strings, which arrive over the wire; data, not markup.
     * @protected
     */
    syncViewerWakeTelltale() {
        let me   = this,
            slot = me.getReference('viewer-wake-telltale');

        if (!slot) return;

        const
            provider   = me.getStateProvider(),
            viewerWake = provider?.getData('viewerWake') ?? {},
            signals    = (me.getViewerWakeFeed()?.items ?? []).slice(0, 5).map(record => ({
                kind      : record.kind,
                emittedAt : record.emittedAt,
                receivedAt: record.receivedAt
            })),
            {ariaLabel, cls, text, title} = describeViewerWakeTelltale({
                stream : viewerWake.stream ?? null,
                catchUp: viewerWake.catchUp?.state ? viewerWake.catchUp : null,
                signals
            });

        // vdom attributes FIRST, then the config set, then one explicit flush: `set()` batches its
        // own update asynchronously, so an update flushed BEFORE the text config lands pushes a
        // vdom without the chip's text — a blank frame on every stamp cadence (the race the wake
        // e2e caught as an empty telltale). Ordered this way, every flush carries text + title.
        slot.vdom.title         = title;
        slot.vdom['aria-label'] = ariaLabel;
        slot.set({cls, text});
        slot.update()
    }

    /**
     * @summary The Reconnect affordance's one-click re-drive: every liveness seam, immediately.
     *
     * Deliberately NOT gated on {@link #maxReadsInFlight} — per that cap's contract, only the
     * cadence honours it; a direct call is operator-meant and never suppressed. Recovery needs no
     * new machinery beyond this: the reads route through the same authenticated bridge, the same
     * generation fences drop stale answers, and the same routing matrices write the state — the
     * button only collapses the up-to-one-cadence wait into "now". Works identically in both
     * topologies (the browser flow has the same stale-offline problem after a late server start).
     *
     * The pane histories (memories / catch-up / wake routes) ride this re-drive for a stronger
     * reason: they have NO cadence at all — request-driven only — so a failed first read would
     * otherwise sit as its unavailable envelope forever. Re-driving goes THROUGH each pane's own
     * refresh handler, whose guards (active agent, partition) decide whether there is a request
     * to make; a pane with no selection stays silent rather than fabricating one.
     */
    reconnectFleet() {
        let me = this;

        me.loadActivity();
        me.loadRoster();
        me.loadBrainHealth();
        me.ensureViewerWakeStream();

        // The pane histories are liveness seams too: a failed first read pins its unavailable
        // envelope until SOME re-request happens, and before this line the only such request was a
        // manual pane action — the dead-pane gap. Each pane's own refresh handler carries its
        // guards (active agent / partition), so re-driving through it is exactly the button's path.
        me.getMemoriesPane()?.onRefreshClick();
        me.getCatchUpPane()?.onRefreshClick();
        me.getReference('wakeRoutes')?.onRefreshClick()
    }

    /**
     * @summary Applies one Brain-health wire answer onto the owner-held daemon surface, then re-syncs.
     *
     * The vocabulary check keeps the documented member contract honest: anything that is not a
     * recognized Brain state — a transport envelope (`{ok: false}`), a rejection mapped to `null`,
     * a malformed payload — lands as `null`/`null`, which renders NOTHING. Transport trouble is the
     * transport surface's story; this surface only ever speaks with the lifecycle owner's voice.
     * @param {Object|null} response The lifecycle owner's `{state, cause}` payload, or anything else.
     * @protected
     */
    applyBrainHealth(response) {
        let me    = this,
            state = BRAIN_HEALTH_STATES.includes(response?.state) ? response.state : null;

        if (me.isDestroyed) return;

        // The shell transport fact rides the same wire but is ITS OWN truth, valid on a payload
        // whose daemon state never validates — and dropped back to `null` when the pull failed
        // (an unreachable shell has no standing to keep asserting a boot fact). The banner's cold
        // fallback is the only consumer.
        const transport        = Neo.isObject(response?.transport) ? response.transport : null,
              transportChanged = !Neo.isEqual(transport, me.shellTransport ?? null);

        me.shellTransport = transport;

        if (!state) {
            // Transport truth is not daemon truth in EITHER direction: a rejection, timeout,
            // unavailable envelope, or malformed payload must not fabricate a fault — and it must
            // not ERASE a last-known one. A visible fault stays visible until the lifecycle owner
            // itself answers otherwise; only a valid answer moves this surface. A CHANGED transport
            // fact still re-renders (it moved independently of the daemon verdict — e.g. the boot
            // settling, or the fact dropping with a dead shell); an unchanged one repaints nothing.
            transportChanged && me.syncSpineBanner();
            return
        }

        me.daemonState          = state;
        me.daemonDegradedReason = state !== 'running' && response.cause
            ? (response.cause.detail || response.cause.source || null)
            : null;

        // the header's aggregate fold reads the SAME fault set the banner renders from — one
        // lifecycle authority, plumbed as a boolean; the grid derives nothing about daemons
        const grid = me.getReference('fleet-grid');
        grid && (grid.daemonFault = DAEMON_FAULT_STATES.includes(state));

        me.syncSpineBanner()
    }

    /**
     * @summary Pulls whole-Brain health from the shell's lifecycle owner — the re-read obligation.
     *
     * Pull, never push: rides the liveness cadence for as long as the cockpit renders, so a fault
     * arriving after mount still surfaces and a recovery still clears. The read follows the same
     * bounded discipline as the wire reads — `boundedRead` frees the surface on a hung pull
     * while the wire-settle release plus the {@link #maxReadsInFlight} cap bound accumulation, and
     * the generation fence discards any late answer. Transport failure (absent shell, rejection,
     * timeout) reaches {@link #applyBrainHealth} as `null` and moves nothing.
     * @protected
     */
    async loadBrainHealth() {
        let me = this;

        // BEFORE any early exit: absence is newer knowledge, and an older pending read must not
        // outlive it (the same rule the wire reads follow).
        const generation = ++me.brainHealthReadGeneration;

        try {
            me.brainHealthReadInFlight++;

            // Invoke INSIDE the chain: a synchronous throw becomes a rejection of the tracked
            // promise, so the reject path owns the slot release (the sync-throw falsifier class).
            const response = await boundedRead(
                Promise.resolve().then(() => Neo.Main.brainHealth()),
                me.livenessReadTimeout,
                () => { me.brainHealthReadInFlight-- }
            );

            if (generation !== me.brainHealthReadGeneration || me.isDestroyed) return;

            me.applyBrainHealth(response)
        } catch (error) {
            if (generation !== me.brainHealthReadGeneration || me.isDestroyed) return;

            me.applyBrainHealth(null)
        }
    }

    /**
     * @summary Advances ONE wired surface to the degraded truth and retains the safe reason.
     *
     * The state-writing seams stay {@link #loadRoster} / {@link #loadActivity}; this is their shared
     * loss edge, not a second writer. A surface that never reached `live` is left on its honest
     * `sample` seed — advancing it to `stale` would claim last-known data that never existed.
     * @param {String} surface `'grid'|'stream'`.
     * @param {*} error The transport failure (untrusted — never rendered raw).
     * @param {Neo.component.Base|null} [consumer] The held child whose badge mirrors the owner state.
     * @protected
     */
    degradeWiredSurface(surface, error, consumer = null) {
        let me     = this,
            field  = surface === 'grid' ? 'gridAdapterState' : 'streamAdapterState',
            reason = surface === 'grid' ? 'gridDegradedReason' : 'streamDegradedReason';

        // never-wired stays cold-honest: 'sample' already says "this is fixture data" — and a
        // transport failure RETRACTS any answered-state cause this surface retained (the
        // "connected · registry empty" claim must not outlive the connection it describes; back
        // on silence, the banner's generic cold copy is the honest line again).
        if (me[field] === 'sample') {
            me[reason] = null;
            return
        }

        me[field]  = 'stale';
        // this surface's cause, on this surface's field — never a shared slot a sibling can clear
        me[reason] = toSafeDegradedReason(error);

        if (consumer) consumer.adapterState = 'stale'
    }

    /**
     * @summary Clears ONE surface's retained degrade reason, once THAT surface answers cleanly.
     *
     * Scoped to the caller's own surface, because a reason is a fact about the surface that produced
     * it and no other surface has standing to retract it. The shared-field version read both states
     * and cleared when neither was `stale` — which meant a healthy roster erased a not-wired
     * ACTIVITY's cause (the activity is `sample`, not `stale`, so the guard never saw it) and the
     * banner regressed to "Fleet server offline" while the server was answering. The guard was not
     * too weak; the field was shared, and no guard on a shared field can tell whose cause it holds.
     * @param {String} surface `'grid'` | `'stream'` — the caller's own surface.
     * @protected
     */
    clearDegradedReason(surface) {
        this[surface === 'grid' ? 'gridDegradedReason' : 'streamDegradedReason'] = null
    }

    /**
     * @summary Renders the per-SPINE honesty line from the owner-held adapter states — the
     * surface names WHY it shows sample (cold) or last-known (degraded) data; a fully live
     * spine renders nothing. Render-only over existing truth: the routing matrices in
     * {@link #loadRoster} / {@link #loadActivity} stay the sole state writers, and every one
     * of their exits (including the no-bridge guards — absence IS the cold truth) CALLS this.
     * A call is not a truth transition: {@link #startLiveness} re-drives those same seams on a
     * cadence, their loss edge ({@link #degradeWiredSurface}) advances a wired surface to `stale`
     * with a retained safe reason, and recovery clears it — so the truth this renders now tracks
     * the transport instead of freezing at the first `live`.
     * @protected
     */
    syncSpineBanner() {
        let me        = this,
            banner    = me.getReference('fleet-spine-banner'),
            reconnect = me.getReference('fleet-reconnect-button');

        if (banner) {
            // each state travels WITH its own cause: the derivation reports the reason of the
            // surface that decided the verdict, and no sibling can supply or silence it
            let {hidden, kind, text} = deriveSpineBanner({
                // Daemon health ranks above a stale feed: a dead daemon is usually what MADE the feed
                // stale, so the transport line alone would name the symptom and drop the diagnosis.
                // Silent while `daemonState` is null — absence is unknown, never nominal.
                daemon: {state: me.daemonState,        reason: me.daemonDegradedReason},
                grid  : {state: me.gridAdapterState,   reason: me.gridDegradedReason},
                stream: {state: me.streamAdapterState, reason: me.streamDegradedReason},
                // the shell's boot fact (null outside the shell) — only the cold fallback reads it
                transport: me.shellTransport
            });

            // the banner is the main window's SECOND scope-speaking place — every visible
            // verdict carries the bound instance's label, composed HERE where provider truth lives
            // so the pure derivation (and its spec matrix) stays label-free. The chrome switcher's
            // dot mirrors the SAME verdict (one truth, two renderers): live→ok · degraded→limited
            // · cold→off.
            const
                provider      = me.getStateProvider(),
                boundId       = provider?.getData('boundProfileId'),
                boundRecord   = boundId ? provider.getStore('fleetInstances')?.get(boundId) : null,
                instanceLabel = boundRecord ? (boundRecord.label || String(boundRecord.canonicalEndpoint).replace(/^https?:\/\//, '')) : null;

            text = instanceLabel && !hidden ? `${instanceLabel} — ${text}` : text;

            provider?.setData({instanceState: hidden ? 'ok' : (kind === 'degraded' ? 'limited' : 'off')});

            // The manual recovery affordance shares the banner's visibility verdict: a fully live
            // spine earns zero pixels from BOTH; any visible verdict (cold or degraded) offers the
            // one-click re-drive. Same control in both topologies — the browser flow has the
            // identical stale-offline problem after a late server start.
            reconnect?.set({hidden});

            // `text`, never `html`. The line now interpolates a RETAINED TRANSPORT STRING — the
            // adapter's own `capability.reason`, which arrives over the fleet wire — and `html`
            // is an innerHTML sink, so hostile markup in a reason would execute. `toSafeDegradedReason`
            // redacts SECRETS; it was never a markup escaper, and treating a redactor as a sanitiser
            // is how a reason becomes a script tag. `text` routes to `textContent`: data, not code,
            // which is the boundary the whole VDom pipeline is built on. The banner renders one
            // sentence and needs no markup, so `html` bought nothing and risked everything.
            banner.set({
                cls : ['fm-spine-banner', `fm-spine-banner-${kind}`],
                hidden,
                text
            })
        }
    }

    /**
     * @summary Pushes the bound instance's label into one torn-out window's `document.title` —
     * the scope rule made mechanical: a torn-out window has no chrome switcher and no spine
     * banner, so its OS title is the one place its scope can live. Reads the SAME provider truth
     * the banner composes from (bound profileId → roster row → label-or-endpoint); a missing
     * roster row pushes nothing — absence stays absence, never an invented name. Rides the
     * DocumentHead addon per target window; deliberately NOT the torn-out pane's controller chain,
     * so the known torn-out handler-loss class (a vessel's controller resolving to a cached null)
     * cannot reach it.
     * @param {String} windowId The torn-out window to title.
     */
    pushInstanceTitle(windowId) {
        let provider = this.getStateProvider(),
            boundId  = provider?.getData('boundProfileId'),
            record   = boundId ? provider.getStore('fleetInstances')?.get(boundId) : null,
            label    = record ? (record.label || String(record.canonicalEndpoint).replace(/^https?:\/\//, '')) : null;

        label && windowId && Neo.main.addon.DocumentHead.setTitle({
            value: `${label} — Agent OS`,
            windowId
        })
    }

    /**
     * @summary Map one assembler DTO row onto the FleetAgent record contract. The durable `id`
     * becomes `agentId`; identity facts (`family` / `engineTag` / the authoritative
     * `participationStatus`) flow through (null = unclassified / tagless / no identity root,
     * never guessed); the launch-derived truths (`launchable` / `authMode`, stamped Brain-side by
     * the roster assembler) flow through tri-state so the fleet-start eligibility partition
     * reads the wire, never a cockpit guess; the runtime `lifecycle.state` maps onto the
     * cockpit's session-state vocabulary only when `sources.runtime` is usable; missing /
     * not-wired / malformed source truth forces `off`, so placeholder can never render as fact.
     * The normalized three-source object remains on the record for the card markers AND the
     * eligibility partition (an unusable runtime source must fail a fleet start closed).
     * `openLaneCount` rides the same tri-state passthrough — the roster DTO OWNS it end-to-end
     * (assembler → record → badge), so the FIRST authoritative load carries live truth and a
     * missing stamp degrades to null (no badge), never to the sample seed's number. `laneLine`
     * is deliberately OMITTED (not nulled): the activity capability owns it, and a merge must
     * never wipe what another producer wrote.
     * @param {Object} row One cockpit DTO row (`fleetCockpitStatus` shape).
     * @returns {Object} FleetAgent record field values.
     */
    mapRosterRow(row) {
        const sessionHealth = mapFleetSessionHealth(row.lifecycle, row.sources);

        return {
            agentId    : row.id,
            authMode   : row.authMode ?? null,
            avatarUrl  : row.avatarUrl ?? null,
            displayName: row.displayName ?? null,
            // The resident's MAILBOX identity authority, preserved from the DTO rather than derived
            // from `agentId`: the registry id is a Fleet key (`vega`), while a mailbox subject is an
            // AgentIdentity node id (`@neo-opus-vega`), and for custom / multi-instance residents the
            // two need not correspond at all. Any surface that must decide "is this snapshot about
            // THIS resident" has to compare compatible ids — comparing the registry key would either
            // never match or, worse, match the wrong resident. `null` = no identity authority, which
            // is an honest "cannot verify", never an implicit pass.
            githubUsername: row.githubUsername ?? null,
            engineTag     : row.engineTag ?? null,
            family        : row.family ?? null,
            launchable    : row.launchable ?? null,
            openLaneCount : row.openLaneCount ?? null,
            // the authoritative identity-root participation fact (tri-state null = no root) —
            // the eligibility partition excludes any KNOWN non-active status before a lifecycle
            // write; null stays eligible (open-set honesty for forks/custom residents)
            participationStatus: row.participationStatus ?? null,
            sources            : sessionHealth.sources,
            state              : sessionHealth.state,
            // The S2 telltale axes, passed through whole rather than re-derived: the assembler
            // already stamps `{source, state, confidence, reason?}` per axis, and `unknown` there is
            // a PRODUCED fact (null resolver, unreadable source, unwired producer). Re-deriving it
            // here would make "we looked and cannot see" indistinguishable from "we never asked" —
            // the DTO's own discipline, the same reason `openLaneCount` is a passthrough.
            presence: row.presence ?? null,
            throttle: row.throttle ?? null,
            wake    : row.wake ?? null
        }
    }

    /**
     * @summary Reconcile an authoritative roster snapshot onto the Store's records: a known
     * `agentId` updates its record in place (`record.set(row)` — the store's `recordChange`
     * re-renders just that card, and fields the roster producer does not own — e.g. `laneLine` —
     * survive because {@link #mapRosterRow} omits them), a new one joins the roster, and a resident
     * ABSENT from the snapshot is removed (the snapshot is the full fleet: a deregistered agent
     * must not linger as a ghost card).
     * @param {Neo.data.Store} store The bound roster store.
     * @param {Object[]} rows Mapped snapshot rows keyed by `agentId`.
     * @protected
     */
    reconcileRoster(store, rows) {
        const
            snapshotIds = new Set(rows.map(row => row.agentId)),
            joiners     = [];

        rows.forEach(row => {
            const record = store.get(row.agentId);

            record ? record.set(row) : joiners.push(row)
        });

        // one batched add — every store mutation fires `load`, so per-row adds would fan out
        joiners.length > 0 && store.add(joiners);

        store.items
            .filter(record => !snapshotIds.has(record.agentId))
            .map(record => record.agentId)
            .forEach(agentId => store.remove(agentId));

        // membership may have removed/re-instanced the inspected resident — the removal fires no
        // recordChange, so reconcile the owner-held selection here (both reconcile callers pass through).
        this.reconcileSelection()
    }
}

export default Neo.setupClass(FleetCockpit);
