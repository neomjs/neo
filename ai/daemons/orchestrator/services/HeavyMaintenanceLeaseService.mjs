import fs       from 'fs-extra';
import Neo      from '../../../../src/Neo.mjs';
import Base     from '../../../../src/core/Base.mjs';
import AiConfig from '../../../config.mjs';

import {
    acquireHeavyMaintenanceLease,
    inspectHeavyMaintenanceLease,
    releaseHeavyMaintenanceLease,
    resolveHeavyMaintenanceLeasePath,
    shouldYieldHeavyMaintenanceLease,
    withHeavyMaintenanceLease
} from './heavyMaintenanceLeasePrimitives.mjs';
import {YIELD_CAUSE_LEASE} from '../scheduling/tenantRepoSync.mjs';

// Re-export the pure lease primitives so every existing importer of this module keeps working unchanged.
// The primitives live in a Neo/Base-free module so subprocess consumers (e.g. the kbSync VectorService)
// can import the pure decider/lock functions without pulling in the orchestrator class stack.
export * from './heavyMaintenanceLeasePrimitives.mjs';

/**
 * @summary Turns a lease acquisition into the named yield voter its task consults.
 *
 * The single config-aware home for the outer-lease fairness vote. Every heavy task that holds the
 * deployment-wide lease and wants to stand down cooperatively builds its voter here, so the one
 * trap this reading carries is spelled once: `maxActiveHoldMs` lives on
 * `orchestrator.heavyMaintenance`, and the adjacent `orchestrator.heavyMaintenanceLease` holds only
 * `staleAfterMs`. Reading the sibling yields `undefined`, a falsy bound never votes, and the result
 * is a no-op that looks exactly like a wired predicate at every call site — indistinguishable from
 * working until a deployment actually reaches the bound.
 *
 * Read at vote time rather than at build time: the leaf is reactive, and a bound captured when the
 * task started would survive an operator changing it.
 *
 * **No acquisition ⇒ `null`, never a voter that always answers false.** The two are not equivalent
 * to a caller: `null` composes away, while an always-false voter is a bound that reports "not yet"
 * forever, which is the shape a reader cannot distinguish from a healthy one.
 *
 * @param {Object|null} acquisition The `withHeavyMaintenanceLease` / `acquireHeavyMaintenanceLease` descriptor (`{status, acquired, lease}`).
 * @returns {{cause: String, vote: Function}|null} A `createYieldCauseResolver` voter, or `null` when this caller holds no lease.
 */
export function createLeaseYieldVoter(acquisition) {
    if (!acquisition?.lease) {
        return null
    }

    return {
        cause: YIELD_CAUSE_LEASE,
        vote : () => shouldYieldHeavyMaintenanceLease(acquisition.lease, {
            maxActiveHoldMs: AiConfig.orchestrator.heavyMaintenance.maxActiveHoldMs
        })
    }
}

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
         * Optional explicit lease-file override. When absent, each operation resolves the path from
         * the current `AiConfig.orchestrator.dataDir` value at its use site.
         * @member {String|null} leasePath_=null
         * @protected
         * @reactive
         */
        leasePath_: null,
        /**
         * @member {Number} staleAfterMs_=AiConfig.orchestrator.heavyMaintenanceLease.staleAfterMs
         * @protected
         * @reactive
         */
        staleAfterMs_: AiConfig.orchestrator.heavyMaintenanceLease.staleAfterMs,
        /**
         * Bound on continuous LIVE-holder lease hold before a cooperative yield:
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
            leasePath : this.resolveLeasePath(options),
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
            leasePath   : this.resolveLeasePath(options),
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
            leasePath: this.resolveLeasePath(options),
            fsModule : options.fsModule  ?? this.fsModule
        });
    }

    /**
     * Resolves the lease path for one operation. An explicit per-call or service override wins;
     * otherwise the current reactive AiConfig leaf supplies the orchestrator directory.
     *
     * @param {Object} [options] Path-resolution inputs.
     * @param {String|null} [options.leasePath] Per-call lease-file override.
     * @returns {String}
     */
    resolveLeasePath(options = {}) {
        return resolveHeavyMaintenanceLeasePath({
            leasePath: options.leasePath ?? this.leasePath,
            dataDir  : AiConfig.orchestrator.dataDir
        });
    }

    /**
     * Decides whether a LIVE lease holder should cooperatively yield (release at the next resumable
     * checkpoint) because it has held the lease past the fairness bound — a thin wrapper over the pure
     * `shouldYieldHeavyMaintenanceLease` primitive with the reactive `maxActiveHoldMs` injected.
     * Consumed by long heavy tasks between batches (e.g. kbSync `embedViaShadowSwap`).
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
            leasePath   : this.resolveLeasePath(options),
            fsModule    : options.fsModule     ?? this.fsModule,
            staleAfterMs: options.staleAfterMs ?? this.staleAfterMs
        });
    }
}

export default Neo.setupClass(HeavyMaintenanceLeaseService);
