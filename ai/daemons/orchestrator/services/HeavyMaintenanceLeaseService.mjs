import fs   from 'fs-extra';
import Neo  from '../../../../src/Neo.mjs';
import Base from '../../../../src/core/Base.mjs';

import {
    DEFAULT_HEAVY_MAINTENANCE_LEASE_PATH,
    DEFAULT_HEAVY_MAINTENANCE_LEASE_TTL_MS,
    acquireHeavyMaintenanceLease,
    inspectHeavyMaintenanceLease,
    releaseHeavyMaintenanceLease,
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
         * @member {Number} staleAfterMs_=21600000
         * @protected
         * @reactive
         */
        staleAfterMs_: DEFAULT_HEAVY_MAINTENANCE_LEASE_TTL_MS,
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
