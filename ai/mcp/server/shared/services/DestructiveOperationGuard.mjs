import os   from 'os';
import path from 'path';
import Base from '../../../../../src/core/Base.mjs';

export const DESTRUCTIVE_PRODUCTION_BYPASS_ENV  = 'NEO_ALLOW_PRODUCTION_DESTRUCTIVE_AI_SUBSTRATE';
export const DESTRUCTIVE_PRODUCTION_CONFIRMATION = 'CONFIRM_PRODUCTION_DESTRUCTIVE_AI_SUBSTRATE';

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
    async assertDestructiveTargetAllowed({
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
