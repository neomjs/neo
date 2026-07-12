import BootIdentityHealthService        from './BootIdentityHealthService.mjs';
import {createBootIdentityFactGatherer} from './bootIdentityFactGatherer.mjs';
import {readRecentRemRunStates}         from '../../../services/memory-core/helpers/remRunStateStore.mjs';

/**
 * @module ai/daemons/orchestrator/services/buildBootIdentitySource
 * @summary Constructs the orchestrator-side boot-identity source (`BootIdentityHealthService` over a
 * live REM-run-state fact-gatherer) that the orchestrator produces its advisory fact from each cycle
 * (then persists via `recordBootIdentityFact`). Isolated from `Orchestrator.mjs` so the `Neo.create`
 * composition is unit-testable without booting the whole daemon.
 *
 * **Global `Neo`, never a non-entrypoint import.** This is a non-entrypoint helper (imported by
 * `Orchestrator.mjs`), so it uses the GLOBAL `Neo` the daemon entrypoint bootstrapped — the same
 * pattern `BootIdentityHealthService` itself follows (it imports `core.Base`, not `Neo`, and calls the
 * global `Neo.setupClass`). A non-entrypoint `import Neo` can re-trigger bootstrap side-effects, so it
 * is the forbidden pattern here.
 *
 * **Real freshness composition.** `classifyBootFreshness` returns `unknown` unless it is given a finite
 * `designedCadenceMs`, so this leaf threads the caller's resolved `freshnessConfig` into the service —
 * the orchestrator passes its REM-consolidation cadence (the same threshold the consolidation-liveness
 * watchdog uses), which is what lets the default path produce a real `designed-deferral` /
 * `restart-explains-gap` result instead of a perpetual `unknown`.
 *
 * **Scope (Leaf 1 = wiring).** `bootAt` + `lastCycle` (via the REM store) + the cadence are wired live.
 * `sourceRef` / `deferralReason` / `schedulerResumeState` remain the gatherer's own declared optional
 * "refine in place" resolvers (its docstring: "conservative first cut" — null / `none` best-effort),
 * intentionally NOT built in this wiring leaf; they refine without restructuring this composition.
 *
 * **Fail-soft (bounded blast radius).** A construction error returns `null` — the orchestrator then
 * simply never writes a boot-identity fact, and the fleet reader keeps its honest advisory-`unknown`.
 * The boot-identity surface is read-only observability, so its wiring must NEVER be able to break the
 * orchestrator boot.
 */

/**
 * @summary Build the boot-identity source. Called once at orchestrator start (so `bootAt` is the
 * process boot time).
 * @param {Object} options
 * @param {String} options.remRunStateDir Directory holding the REM run-state JSONL artifacts (the same
 *     source the consolidation liveness watchdog reads); the gatherer pairs the last cycle with `bootAt`.
 * @param {Object|null} [options.freshnessConfig=null] `{designedCadenceMs, marginMs}` — the resolved
 *     scheduler cadence the caller reads from config; without a finite `designedCadenceMs` the
 *     classifier stays `unknown`.
 * @param {Number} [options.bootAt=Date.now()] Epoch-ms process boot time (the orchestrator passes the
 *     value it captured at `start()`).
 * @param {Function} [options.nowFn=Date.now] Injected clock.
 * @param {Function} [options.createGatherer=createBootIdentityFactGatherer] Injected in specs.
 * @param {Object} [options.ServiceClass=BootIdentityHealthService] Injected in specs.
 * @returns {Object|null} the boot-identity source (exposing async `produceBootIdentityFact()`), or
 *     `null` when construction failed (fail-soft).
 */
export function buildBootIdentitySource({
    remRunStateDir,
    freshnessConfig = null,
    bootAt          = Date.now(),
    nowFn           = Date.now,
    createGatherer  = createBootIdentityFactGatherer,
    ServiceClass    = BootIdentityHealthService
} = {}) {
    try {
        return Neo.create(ServiceClass, {
            factGatherer: createGatherer({bootAt, readRecentRemRunStates, remRunStateDir}),
            freshnessConfig,
            nowFn
        });
    } catch (error) {
        return null; // fail-soft: an unwired source degrades to advisory-unknown, never a broken boot
    }
}
