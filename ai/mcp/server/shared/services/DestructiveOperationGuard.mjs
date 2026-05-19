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
 * - `neo-agent-memory`   — Memory Core memories collection (`aiConfig.collections.memory`).
 * - `neo-agent-sessions` — Memory Core summaries collection (`aiConfig.collections.session`).
 * - `neo-agent-graph`    — Memory Core graph collection (`aiConfig.collections.graph`).
 * - `neo-knowledge-base` — Knowledge Base canonical collection (`aiConfig.collectionName`).
 *
 * Names are hardcoded (not derived from config) so a caller that loads a misconfigured
 * `config.mjs` (e.g., running `npx playwright` without the unit-test config) still gets
 * the canonical name blocked. The empirical anchor is the 2026-05-17 Memory Core wipe,
 * where `aiConfig.collections.memory` returned canonical `'neo-agent-memory'` because
 * `UNIT_TEST_MODE` was absent in the bare-playwright invocation environment.
 *
 * @see https://github.com/neomjs/neo/issues/11652
 */
export const GUARDED_CANONICAL_COLLECTION_NAMES = Object.freeze(new Set([
    'neo-agent-memory',
    'neo-agent-sessions',
    'neo-agent-graph',
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
        super(
            `CANONICAL_COLLECTION_GUARDED: refusing to delete canonical Chroma collection ` +
            `"${name}" (subsystem: ${subsystem || 'unknown'}). Set UNIT_TEST_MODE=true for ` +
            `tests, or pass confirmation '${DESTRUCTIVE_PRODUCTION_CONFIRMATION}' for ` +
            `operator-acknowledged production recovery.`
        );
        this.name      = 'CanonicalCollectionGuardError';
        this.code      = 'CANONICAL_COLLECTION_GUARDED';
        this.collection = name;
        this.subsystem  = subsystem;
    }
}

/**
 * Asserts a ChromaManager `deleteCollection({name})` call is allowed against a canonical
 * production collection name. Returns silently for non-canonical names (test-prefixed
 * collection names, ad-hoc names, etc.). Returns silently for canonical names under
 * either bypass: `process.env.UNIT_TEST_MODE === 'true'` OR a `confirmation` argument
 * equal to `DESTRUCTIVE_PRODUCTION_CONFIRMATION`. Throws {@link CanonicalCollectionGuardError}
 * otherwise.
 *
 * **Why this guard is necessary alongside `assertDestructiveTargetAllowed`:**
 *
 * The path-target guard reasons over filesystem paths (`tmp/`, OS tempdir, `:memory:`).
 * It does NOT see chroma-collection-name semantics, so a caller invoking
 * `ChromaManager.client.deleteCollection({name: 'neo-agent-memory'})` from a process
 * whose `aiConfig` resolved to canonical names (e.g., `npx playwright` without unit-test
 * config) bypasses the path-target guard entirely. This collection-name-level guard
 * closes that gap.
 *
 * @param {Object}  options
 * @param {String}  options.name                  Chroma collection name about to be deleted.
 * @param {String} [options.subsystem]            Owning subsystem identifier for diagnostics ('memory-core' or 'knowledge-base').
 * @param {String} [options.confirmation]         Production-recovery confirmation token; must equal `DESTRUCTIVE_PRODUCTION_CONFIRMATION` to bypass.
 * @throws {CanonicalCollectionGuardError} When `name` is canonical and neither bypass applies.
 */
export function assertCanonicalCollectionDeleteAllowed({name, subsystem, confirmation} = {}) {
    if (!GUARDED_CANONICAL_COLLECTION_NAMES.has(name)) {
        return;
    }
    if (process.env.UNIT_TEST_MODE === 'true') {
        return;
    }
    if (confirmation === DESTRUCTIVE_PRODUCTION_CONFIRMATION) {
        return;
    }
    throw new CanonicalCollectionGuardError({name, subsystem});
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
