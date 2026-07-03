import fs       from 'fs-extra';
import Neo      from '../../../../src/Neo.mjs';
import Base     from '../../../../src/core/Base.mjs';
import AiConfig from '../../../config.mjs';

import {
    DEFAULT_HEAVY_MAINTENANCE_LEASE_PATH,
    acquireHeavyMaintenanceLease,
    inspectHeavyMaintenanceLease,
    releaseHeavyMaintenanceLease,
    shouldYieldHeavyMaintenanceLease,
    withHeavyMaintenanceLease
} from './heavyMaintenanceLeasePrimitives.mjs';

// Re-export the pure lease primitives so every existing importer of this module keeps working unchanged.
// The primitives live in a Neo/Base-free module so subprocess consumers (e.g. the kbSync VectorService)
// can import the pure decider/lock functions without pulling in the orchestrator class stack.
export * from './heavyMaintenanceLeasePrimitives.mjs';

/**
 * @summary Shared lease service for Agent OS substrate-heavy maintenance work.
 *
 * The service is the reusable mutex contract between orchestrator-owned tasks
 * and operator-runnable CLI scripts. It prevents Chroma / SQLite / LLM
 * maintenance lanes from overlapping across process boundaries while preserving
 * non-error deferral semantics for expected contention.
 *
 * @class Neo.ai.daemons.services.HeavyMaintenanceLeaseService
 * @extends Neo.core.Base
 * @singleton
 */
export class HeavyMaintenanceLeaseService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.daemons.services.HeavyMaintenanceLeaseService'
         * @protected
         */
        className: 'Neo.ai.daemons.services.HeavyMaintenanceLeaseService',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true,
        /**
         * @member {String} leasePath_='.neo-ai-data/orchestrator-daemon/heavy-maintenance-lease.json'
         * @protected
         * @reactive
         */
        leasePath_: DEFAULT_HEAVY_MAINTENANCE_LEASE_PATH,
        /**
         * @member {Number} staleAfterMs_=AiConfig.orchestrator.heavyMaintenanceLease.staleAfterMs
         * @protected
         * @reactive
         */
        staleAfterMs_: AiConfig.orchestrator.heavyMaintenanceLease.staleAfterMs,
        /**
         * Bound on continuous LIVE-holder lease hold before a cooperative yield (#14144 lease-fairness):
         * consumed by `shouldYield()` so a long heavy task (e.g. a multi-hour KB re-embed) releases the lease
         * at a resumable checkpoint, letting a starved heavy peer interleave. Distinct from `staleAfterMs`
         * (dead-holder reclaim); kept the smaller so a live holder yields before it would be stale-reclaimed.
         * Falsy ⇒ never yields (byte-identical back-compat).
         * @member {Number} maxActiveHoldMs_=AiConfig.orchestrator.heavyMaintenance.maxActiveHoldMs
         * @protected
         * @reactive
         */
        maxActiveHoldMs_: AiConfig.orchestrator.heavyMaintenance.maxActiveHoldMs,
        /**
         * @member {Object} fsModule_=fs
         * @protected
         * @reactive
         */
        fsModule_: fs
    }

    /**
     * Inspects the current lease file.
     * @param {Object} [options] Inspect overrides.
     * @returns {Promise<Object>}
     */
    inspect(options = {}) {
        return inspectHeavyMaintenanceLease({
            leasePath : options.leasePath ?? this.leasePath,
            fsModule  : options.fsModule  ?? this.fsModule,
            now       : options.now       ?? new Date(),
            isPidAlive: options.isPidAlive
        });
    }

    /**
     * Acquires the current lease when no active owner exists.
     * @param {Object} options Acquisition options.
     * @returns {Promise<Object>}
     */
    acquire(options = {}) {
        return acquireHeavyMaintenanceLease({
            ...options,
            leasePath   : options.leasePath    ?? this.leasePath,
            fsModule    : options.fsModule     ?? this.fsModule,
            staleAfterMs: options.staleAfterMs ?? this.staleAfterMs
        });
    }

    /**
     * Releases the current lease if the token matches.
     * @param {Object} options Release options.
     * @returns {Promise<Object>}
     */
    release(options = {}) {
        return releaseHeavyMaintenanceLease({
            ...options,
            leasePath: options.leasePath ?? this.leasePath,
            fsModule : options.fsModule  ?? this.fsModule
        });
    }

    /**
     * Decides whether a LIVE lease holder should cooperatively yield (release at the next resumable
     * checkpoint) because it has held the lease past the fairness bound — a thin wrapper over the pure
     * `shouldYieldHeavyMaintenanceLease` primitive with the reactive `maxActiveHoldMs` injected (#14144).
     * Consumed by long heavy tasks between batches (e.g. kbSync `embedViaShadowSwap`, #14186).
     * @param {Object|null} lease The current lease payload (reads `acquiredAt`).
     * @param {Object} [options] Overrides.
     * @param {Date}   [options.now=new Date()] Clock injection for tests.
     * @param {Number} [options.maxActiveHoldMs=this.maxActiveHoldMs] Hold-bound override.
     * @returns {Boolean} `true` only once the active hold exceeds `maxActiveHoldMs` (falsy bound ⇒ never yields).
     */
    shouldYield(lease, options = {}) {
        return shouldYieldHeavyMaintenanceLease(lease, {
            now            : options.now            ?? new Date(),
            maxActiveHoldMs: options.maxActiveHoldMs ?? this.maxActiveHoldMs
        });
    }

    /**
     * Runs an async task while holding the heavy-maintenance lease.
     * @param {Function} task Async task to execute.
     * @param {Object} options Lease options.
     * @returns {Promise<Object>}
     */
    withLease(task, options = {}) {
        return withHeavyMaintenanceLease(task, {
            ...options,
            leasePath   : options.leasePath    ?? this.leasePath,
            fsModule    : options.fsModule     ?? this.fsModule,
            staleAfterMs: options.staleAfterMs ?? this.staleAfterMs
        });
    }
}

export default Neo.setupClass(HeavyMaintenanceLeaseService);
