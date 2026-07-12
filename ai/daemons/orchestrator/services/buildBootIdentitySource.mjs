import Neo                              from '../../../../src/Neo.mjs';
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
 * @param {Number} [options.bootAt=Date.now()] Epoch-ms process boot time.
 * @param {Function} [options.nowFn=Date.now] Injected clock.
 * @param {Function} [options.createGatherer=createBootIdentityFactGatherer] Injected in specs.
 * @param {Object} [options.ServiceClass=BootIdentityHealthService] Injected in specs.
 * @returns {Object|null} the boot-identity source (exposing async `produceBootIdentityFact()`), or
 *     `null` when construction failed (fail-soft).
 */
export function buildBootIdentitySource({
    remRunStateDir,
    bootAt         = Date.now(),
    nowFn          = Date.now,
    createGatherer = createBootIdentityFactGatherer,
    ServiceClass   = BootIdentityHealthService
} = {}) {
    try {
        return Neo.create(ServiceClass, {
            factGatherer: createGatherer({bootAt, readRecentRemRunStates, remRunStateDir}),
            nowFn
        });
    } catch (error) {
        return null; // fail-soft: an unwired source degrades to advisory-unknown, never a broken boot
    }
}
