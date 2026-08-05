import os   from 'os';
import path from 'path';
import Base from '../../../../../src/core/Base.mjs';

export const DESTRUCTIVE_PRODUCTION_BYPASS_ENV  = 'NEO_ALLOW_PRODUCTION_DESTRUCTIVE_AI_SUBSTRATE';
export const DESTRUCTIVE_PRODUCTION_CONFIRMATION = 'CONFIRM_PRODUCTION_DESTRUCTIVE_AI_SUBSTRATE';

/**
 * Canonical Chroma collection names that ChromaManager wrappers refuse to drop without
 * either `UNIT_TEST_MODE=true` (tests opt in to test-prefixed isolation) or the explicit
 * `DESTRUCTIVE_PRODUCTION_CONFIRMATION` token (operator-acknowledged production recovery).
 *
 * Shared between Memory Core's and Knowledge Base's `ChromaManager.deleteCollection`
 * wrappers so the guard fires uniformly regardless of which subsystem's manager
 * a caller imports. The set is the union of all production canonical names:
 *
 * - `neo-agent-memory`     — Memory Core memories collection (`aiConfig.collections.memory`).
 * - `neo-agent-sessions`   — Memory Core summaries collection (`aiConfig.collections.session`).
 * - `neo-native-graph`     — Memory Core graph collection (`aiConfig.collections.graph`).
 * - `neo-temporal-summary` — Memory Core temporal-summary collection (`aiConfig.collections.temporalSummary`).
 * - `neo-knowledge-base`   — Knowledge Base canonical collection (`aiConfig.collectionName`).
 *
 * Names are hardcoded (not derived from config) so a caller that loads runtime config
 * without the unit-test isolation layer still gets the canonical name blocked. This
 * keeps test harness mistakes from resolving destructive targets to production
 * collection names.
 */
export const GUARDED_CANONICAL_COLLECTION_NAMES = Object.freeze(new Set([
    'neo-agent-memory',
    'neo-agent-sessions',
    'neo-native-graph',
    'neo-temporal-summary',
    'neo-knowledge-base'
]));

/**
 * @summary Error thrown when a ChromaManager wrapper refuses to drop a canonical collection.
 *
 * Distinct from {@link DestructiveOperationBlockedError} (path-target-driven, fired by
 * `assertDestructiveTargetAllowed`). This error fires at the chroma-collection-name layer,
 * one step closer to the chromadb-client boundary, and provides defense-in-depth against
 * callers that bypass the path-target guard (e.g. tests that grab `ChromaManager.client`
 * directly without going through `DatabaseService` or `CollectionProxy`).
 *
 * @class CanonicalCollectionGuardError
 * @extends Error
 */
export class CanonicalCollectionGuardError extends Error {
    constructor({name, subsystem}) {
        const isCanonical = GUARDED_CANONICAL_COLLECTION_NAMES.has(name);
        const targetDesc  = isCanonical
            ? `canonical Chroma collection "${name}"`
            : `Chroma collection "${name}" (non-canonical; the uniform-gate fires for every destructive collection-delete regardless of name)`;
        super(
            `CANONICAL_COLLECTION_GUARDED: refusing to delete ${targetDesc} ` +
            `(subsystem: ${subsystem || 'unknown'}). Set UNIT_TEST_MODE=true for tests, ` +
            `or pass confirmation '${DESTRUCTIVE_PRODUCTION_CONFIRMATION}' for ` +
            `operator-acknowledged production recovery.`
        );
        this.name        = 'CanonicalCollectionGuardError';
        this.code        = 'CANONICAL_COLLECTION_GUARDED';
        this.collection  = name;
        this.isCanonical = isCanonical;
        this.subsystem   = subsystem;
    }
}

/**
 * Asserts a ChromaManager `deleteCollection({name})` call is allowed. The guard fires for
 * **every** destructive collection-delete attempt regardless of whether `name` is in
 * {@link GUARDED_CANONICAL_COLLECTION_NAMES} — destructive ops are not free for non-canonical
 * names either (a buggy or malicious caller invoking `deleteCollection({name: 'arbitrary'})`
 * without `UNIT_TEST_MODE` or a confirmation token is a fail-closed scenario, not a quiet
 * pass-through).
 *
 * Bypass paths (either is sufficient):
 *
 * 1. `process.env.UNIT_TEST_MODE === 'true'` — the test harness is loaded; `aiConfig.collections.*`
 *    resolves to process-isolated `test-*` prefixes, and the test
 *    cleanup helpers are responsible for their own substrate.
 * 2. `confirmation === DESTRUCTIVE_PRODUCTION_CONFIRMATION` — operator-acknowledged production
 *    recovery (e.g., `restore.mjs --mode replace` already gates via `DestructiveOperationGuard`
 *    and forwards the same token down through `DatabaseService.truncateDatabase` →
 *    `ChromaManager.deleteCollection`).
 *
 * The canonical-collection-name set still surfaces in the `CanonicalCollectionGuardError`
 * diagnostics so operators see which live target was protected, but membership is no longer
 * the gate — the gate is the env-or-token check uniformly.
 *
 * **Why this guard is necessary alongside `assertDestructiveTargetAllowed`:**
 *
 * The path-target guard reasons over filesystem paths (`tmp/`, OS tempdir, `:memory:`).
 * It does NOT see chroma-collection-name semantics, so a caller invoking
 * `ChromaManager.client.deleteCollection({name: 'neo-agent-memory'})` from a process whose
 * `aiConfig` resolved to canonical names (e.g., `npx playwright` without unit-test config)
 * bypasses the path-target guard entirely. This collection-name-level guard closes that gap.
 *
 * **Why the gate is uniform (not canonical-set-gated):**
 *
 * A guard that returns early for non-canonical names leaves the "non-canonical name as bypass
 * surface" open. A production caller could invoke
 * `deleteCollection({name: 'arbitrary-collection'})` and bypass the substrate-level invariant
 * entirely. The uniform-gate shape forces every destructive caller to thread either the test
 * env or the explicit confirmation token, regardless of collection name.
 *
 * @param {Object}  options
 * @param {String}  options.name                  Chroma collection name about to be deleted.
 * @param {String} [options.subsystem]            Owning subsystem identifier for diagnostics ('memory-core' or 'knowledge-base').
 * @param {String} [options.confirmation]         Production-recovery confirmation token; must equal `DESTRUCTIVE_PRODUCTION_CONFIRMATION` to bypass.
 * @throws {CanonicalCollectionGuardError} When neither bypass applies.
 */
export function assertCanonicalCollectionDeleteAllowed({name, subsystem, confirmation} = {}) {
    if (process.env.UNIT_TEST_MODE === 'true') {
        return;
    }
    if (confirmation === DESTRUCTIVE_PRODUCTION_CONFIRMATION) {
        return;
    }
    throw new CanonicalCollectionGuardError({name, subsystem});
}

/**
 * @summary Error thrown when a restore is aimed at a canonical collection through the disposable-target override.
 *
 * Separate from {@link CanonicalCollectionGuardError} because the rejected operation is a
 * **write**, not a delete, and the remedy is the opposite: there is deliberately no bypass token.
 * A confirmation flag here would recreate the hazard the override exists to remove — a diagnostic
 * path that can be pointed at production by typing one more argument.
 *
 * @class DisposableRestoreTargetError
 * @extends Error
 */
export class DisposableRestoreTargetError extends Error {
    constructor({name}) {
        super(
            `DISPOSABLE_RESTORE_TARGET_REQUIRED: refusing to restore into "${name}" — it is a canonical ` +
            `collection. The target override exists so a restore can be exercised somewhere throwaway; ` +
            `naming a canonical collection through it defeats that purpose entirely, so there is no ` +
            `confirmation token for this refusal. Canonical names: ` +
            `${[...GUARDED_CANONICAL_COLLECTION_NAMES].sort().join(', ')}. ` +
            `To restore into a canonical collection, omit the override and use the ordinary restore path.`
        );
        this.name       = 'DisposableRestoreTargetError';
        this.code       = 'DISPOSABLE_RESTORE_TARGET_REQUIRED';
        this.collection = name;
    }
}

/**
 * @summary Asserts a restore target is a disposable (non-canonical) collection name.
 *
 * The write-side counterpart of {@link assertCanonicalCollectionDeleteAllowed}, and deliberately
 * the **inverse shape**. That gate is uniform: it refuses every destructive delete regardless of
 * name, because there a non-canonical name is a bypass surface. Here a non-canonical name is the
 * entire point — the override exists so a restore can be exercised against something throwaway —
 * so this gate must *admit* disposable names and refuse only canonical ones.
 *
 * **That inversion is why the refusal needs proving in both directions.** A uniform-refusal
 * implementation would pass any test that only checks "a canonical target is rejected" while
 * making the override useless; a permit-everything implementation passes any test that only
 * checks "a disposable target succeeds". Neither half witnesses this guard on its own, so the
 * spec asserts both directions.
 *
 * Reuses {@link GUARDED_CANONICAL_COLLECTION_NAMES} rather than deriving names from config. That
 * set is hardcoded on purpose — see its docblock — and the reason applies with more force here:
 * a diagnostic override must not become reachable against production because runtime config
 * resolved without the test-isolation layer.
 *
 * @param {Object} options
 * @param {String} options.name Proposed restore target collection name.
 * @returns {String} The validated target name, so callers can assign from the assertion.
 * @throws {DisposableRestoreTargetError} When `name` is a canonical collection.
 * @throws {Error} When `name` is absent or not a non-empty string.
 */
export function assertDisposableRestoreTarget({name} = {}) {
    if (typeof name !== 'string' || name.trim() === '') {
        throw new Error(
            'assertDisposableRestoreTarget requires a non-empty `name` string. An absent target must ' +
            'not silently fall back to the canonical collection — that fallback is the failure mode ' +
            'the override exists to prevent.'
        );
    }

    const trimmed = name.trim();

    if (GUARDED_CANONICAL_COLLECTION_NAMES.has(trimmed)) {
        throw new DisposableRestoreTargetError({name: trimmed});
    }

    return trimmed
}

/**
 * @summary Error thrown when a destructive AI substrate operation targets a production path.
 *
 * Carries a stable `code` for callers and tests while preserving the rejected operation,
 * subsystem, mode, target, and source metadata for operator-facing diagnostics.
 *
 * @class DestructiveOperationBlockedError
 * @extends Error
 */
export class DestructiveOperationBlockedError extends Error {
    /**
     * @param {Object} options
     */
    constructor({operation, subsystem, mode, target, source, reason, pathResults}) {
        super(
            `DESTRUCTIVE_TARGET_BLOCKED: ${subsystem || 'unknown'} ${operation || 'operation'} ` +
            `(${mode || 'unknown'}) rejected: ${reason}. Set ${DESTRUCTIVE_PRODUCTION_BYPASS_ENV}=true ` +
            `and pass confirmation '${DESTRUCTIVE_PRODUCTION_CONFIRMATION}' only for deliberate production maintenance.`
        );

        this.name        = 'DestructiveOperationBlockedError';
        this.code        = 'DESTRUCTIVE_TARGET_BLOCKED';
        this.operation   = operation;
        this.subsystem   = subsystem;
        this.mode        = mode;
        this.target      = target;
        this.source      = source;
        this.reason      = reason;
        this.pathResults = pathResults;
    }
}

/**
 * @summary Shared fail-closed guard for destructive AI substrate operations.
 *
 * Provides the canonical `assertDestructiveTargetAllowed()` contract for Memory Core,
 * Knowledge Base, and restore tooling. The guard intentionally reasons over explicit target
 * descriptors instead of ambient `UNIT_TEST_MODE` state: disposable targets are allowed when
 * their storage paths resolve to SQLite `:memory:`, the OS temp directory, or the repository
 * `tmp/` folder; production-like or unresolved targets are blocked unless an operator supplies
 * both the production bypass environment variable and the explicit confirmation token.
 *
 * @class Neo.ai.mcp.server.shared.services.DestructiveOperationGuard
 * @extends Neo.core.Base
 * @singleton
 */
class DestructiveOperationGuard extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.mcp.server.shared.services.DestructiveOperationGuard'
         * @protected
         */
        className: 'Neo.ai.mcp.server.shared.services.DestructiveOperationGuard',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * Asserts that a destructive target is disposable, or explicitly operator-confirmed.
     *
     * @param {Object}        options
     * @param {String}        options.operation             Stable operation identifier.
     * @param {String}        options.subsystem             Owning subsystem.
     * @param {String}        options.mode                  Destructive mode, e.g. `delete`, `drop`, or `replace`.
     * @param {Object}        options.target                Target descriptor.
     * @param {String}       [options.target.path]          Target data path.
     * @param {String}       [options.target.sqlitePath]    Target SQLite path.
     * @param {String}       [options.target.bundlePath]    Target backup bundle path when it is the destructive destination.
     * @param {Object}       [options.target.chroma]        Chroma target descriptor.
     * @param {String}       [options.target.collectionName] Chroma collection name.
     * @param {String}       [options.target.repoRoot]      Repository root for `tmp/` allowance.
     * @param {String[]}     [options.target.disposableRoots] Additional disposable root paths.
     * @param {Object}       [options.source]               Optional source descriptor for diagnostics.
     * @param {String|Object} [options.confirmation]         Explicit production confirmation token.
     * @param {Object}       [options.env=process.env]      Environment map, injectable for tests.
     * @returns {Promise<Object>} An allow result containing classification details.
     * @throws {DestructiveOperationBlockedError} When the target is production-like or unresolved.
     */
    async assertDestructiveTargetAllowed(options = {}) {
        return this.assertDestructiveTargetAllowedSync(options);
    }

    /**
     * Synchronous version of assertDestructiveTargetAllowed.
     * Asserts that a destructive target is disposable, or explicitly operator-confirmed.
     *
     * @param {Object}        options
     * @param {String}        options.operation             Stable operation identifier.
     * @param {String}        options.subsystem             Owning subsystem.
     * @param {String}        options.mode                  Destructive mode, e.g. `delete`, `drop`, or `replace`.
     * @param {Object}        options.target                Target descriptor.
     * @param {String}       [options.target.path]          Target data path.
     * @param {String}       [options.target.sqlitePath]    Target SQLite path.
     * @param {String}       [options.target.bundlePath]    Target backup bundle path when it is the destructive destination.
     * @param {Object}       [options.target.chroma]        Chroma target descriptor.
     * @param {String}       [options.target.collectionName] Chroma collection name.
     * @param {String}       [options.target.repoRoot]      Repository root for `tmp/` allowance.
     * @param {String[]}     [options.target.disposableRoots] Additional disposable root paths.
     * @param {Object}       [options.source]               Optional source descriptor for diagnostics.
     * @param {String|Object} [options.confirmation]         Explicit production confirmation token.
     * @param {Object}       [options.env=process.env]      Environment map, injectable for tests.
     * @returns {Object} An allow result containing classification details.
     * @throws {DestructiveOperationBlockedError} When the target is production-like or unresolved.
     */
    assertDestructiveTargetAllowedSync({
        operation,
        subsystem,
        mode,
        target = {},
        source,
        confirmation,
        env = process.env
    } = {}) {
        if (this.#isProductionConfirmed({confirmation, env})) {
            return {
                allowed       : true,
                classification: 'operator-confirmed',
                operation,
                subsystem,
                mode
            }
        }

        const pathResults = this.#classifyTargetPaths(target);
        let reason;

        if (pathResults.length === 0) {
            reason = 'target descriptor does not include a resolvable destructive path';
        } else if (pathResults.every(result => result.disposable)) {
            return {
                allowed       : true,
                classification: 'disposable',
                operation,
                subsystem,
                mode,
                pathResults
            }
        } else {
            const blocked = pathResults.filter(result => !result.disposable).map(result => result.value).join(', ');
            reason = `target path is not disposable (${blocked})`;
        }

        throw new DestructiveOperationBlockedError({
            operation,
            subsystem,
            mode,
            target,
            source,
            reason,
            pathResults
        })
    }

    /**
     * Determines whether both production-bypass gates are present.
     *
     * @param {Object}        options
     * @param {String|Object} options.confirmation
     * @param {Object}        options.env
     * @returns {Boolean}
     * @private
     */
    #isProductionConfirmed({confirmation, env}) {
        const token = typeof confirmation === 'object' && confirmation !== null
            ? confirmation.token
            : confirmation;

        return env?.[DESTRUCTIVE_PRODUCTION_BYPASS_ENV] === 'true' &&
            token === DESTRUCTIVE_PRODUCTION_CONFIRMATION
    }

    /**
     * Builds disposable/prod classification records for every target destination path.
     *
     * @param {Object} target
     * @returns {Object[]}
     * @private
     */
    #classifyTargetPaths(target) {
        const paths = this.#collectTargetPaths(target);

        return paths.map(value => {
            if (value === ':memory:') {
                return {value, disposable: true, reason: 'sqlite-memory'}
            }

            const resolved        = path.resolve(value),
                  disposableRoots = this.#getDisposableRoots(target);

            return {
                value     : resolved,
                disposable: disposableRoots.some(root => this.#isPathInside(resolved, root)),
                reason    : 'path'
            }
        })
    }

    /**
     * Collects target destination paths from the canonical descriptor shape.
     *
     * @param {Object} target
     * @returns {String[]}
     * @private
     */
    #collectTargetPaths(target) {
        const paths = new Set();

        [
            target?.path,
            target?.sqlitePath,
            target?.bundlePath,
            target?.chroma?.path,
            target?.chroma?.dataDir
        ].forEach(value => {
            if (typeof value === 'string' && value.trim()) {
                paths.add(value);
            }
        });

        return [...paths]
    }

    /**
     * Resolves the built-in and caller-provided disposable roots.
     *
     * @param {Object} target
     * @returns {String[]}
     * @private
     */
    #getDisposableRoots(target) {
        const repoRoot = target?.repoRoot || process.cwd();
        const roots    = [
            os.tmpdir(),
            path.resolve(repoRoot, 'tmp'),
            ...(Array.isArray(target?.disposableRoots) ? target.disposableRoots : [])
        ];

        return roots
            .filter(root => typeof root === 'string' && root.trim())
            .map(root => path.resolve(root))
    }

    /**
     * Checks if `childPath` is inside `parentPath`.
     *
     * @param {String} childPath
     * @param {String} parentPath
     * @returns {Boolean}
     * @private
     */
    #isPathInside(childPath, parentPath) {
        const relative = path.relative(parentPath, childPath);
        return relative === '' || (!!relative && !relative.startsWith('..') && !path.isAbsolute(relative))
    }
}

export default Neo.setupClass(DestructiveOperationGuard);
