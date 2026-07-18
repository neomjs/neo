import fs                    from 'fs-extra';
import path                  from 'path';
import crypto                from 'crypto';
import Base                  from '../../../src/core/Base.mjs';
import config                from '../../mcp/server/memory-core/config.mjs';
import logger                from '../../mcp/server/memory-core/logger.mjs';
import RequestContextService from '../../mcp/server/shared/services/RequestContextService.mjs';

/**
 * @summary The neutral source-registration lifecycle transitions Memory Core owns.
 *
 * Only an `ACTIVE` registration whose submitted `registrationEpoch` matches server-owned state may
 * admit a batch. Reprovisioning (`REVOKED -> PROVISIONED`) and each fresh provision bump the epoch,
 * fencing stale connectors WITHOUT changing the durable `sourceInstanceId` FK. There is no direct
 * path back to `ACTIVE` from `REVOKED`: a revoked source must be re-provisioned (new epoch) first,
 * which is what makes a crash/retry unable to reactivate a revoked or stale epoch (AC8).
 * @member {Object<String, String[]>}
 */
const LIFECYCLE_TRANSITIONS = {
    REQUESTED  : ['PROVISIONED'],
    PROVISIONED: ['ACTIVE', 'REVOKED'],
    ACTIVE     : ['REVOKED'],
    REVOKED    : ['PROVISIONED']
};

/**
 * @summary States whose entry mints a fresh (higher) registrationEpoch, so any connector holding a
 * prior epoch is fenced. Entering `PROVISIONED` is the only epoch-advancing transition.
 * @member {Set<String>}
 */
const EPOCH_ADVANCING_STATES = new Set(['PROVISIONED']);

/**
 * @summary Server-authoritative, tenant-scoped registry of neutral community source identities.
 *
 * This is a dedicated Memory-Core operational table — NOT the Native Edge Graph, NOT the Knowledge
 * Base `SourceRegistry`, and NOT AiConfig — source registrations are operational records, not
 * configuration. Because GraphService RLS does not protect new tables, **every** read and write re-applies a server-authoritative
 * `(tenant_id, source_instance_id)` (or `(tenant_id, provider identity)`) predicate in-query. The
 * `tenantId` is resolved server-side from the request context and is never caller-supplied.
 *
 * @class Neo.ai.services.memory-core.SourceRegistryService
 * @extends Neo.core.Base
 * @singleton
 * @see learn/agentos/decisions/0036-durable-community-activity-authority.md
 */
class SourceRegistryService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.services.memory-core.SourceRegistryService'
         * @protected
         */
        className: 'Neo.ai.services.memory-core.SourceRegistryService',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true,
        /**
         * @member {Object|null} db=null
         * @summary SQLite connection to the Memory Core database (dedicated table, not the graph).
         * @protected
         */
        db: null
    }

    /**
     * Opens the SQLite connection and ensures the dedicated registration schema.
     * @returns {Promise<void>}
     */
    async initAsync() {
        await super.initAsync();

        if (this.db) return;

        try {
            const dbPath = config.storagePaths.graph;

            if (!dbPath) {
                logger.warn('[SourceRegistryService] storagePaths.graph not configured. Registry disabled.');
                return;
            }

            if (dbPath !== ':memory:') {
                await fs.ensureDir(path.dirname(dbPath));
            }

            const Database = (await import('better-sqlite3')).default;

            this.db = new Database(dbPath, {verbose: null});

            if (dbPath !== ':memory:') {
                this.db.pragma('journal_mode = WAL');
            }

            this.ensureSchema();
            logger.info('[SourceRegistryService] Connected to Memory Core mc_source_registration.');
        } catch (err) {
            logger.warn('[SourceRegistryService] Failed to initialize SQLite connection:', err.message);
        }
    }

    /**
     * Creates the dedicated registration table and indexes if absent. The UNIQUE identity index is
     * scoped by `tenant_id` so provider identity is tenant-private; a rename updates
     * `display_locator` without forking `source_instance_id`.
     * @returns {void}
     */
    ensureSchema() {
        if (!this.db) return;

        this.db.exec(`
            CREATE TABLE IF NOT EXISTS mc_source_registration (
                source_instance_id      TEXT    PRIMARY KEY,
                tenant_id               TEXT    NOT NULL,
                provider                TEXT    NOT NULL,
                canonical_provider_host TEXT    NOT NULL,
                resource_kind           TEXT    NOT NULL,
                provider_resource_id    TEXT    NOT NULL,
                display_locator         TEXT,
                grant_ref               TEXT,
                provider_capabilities   TEXT,
                registration_epoch      INTEGER NOT NULL DEFAULT 1,
                lifecycle_state         TEXT    NOT NULL DEFAULT 'REQUESTED',
                created_at              INTEGER NOT NULL,
                updated_at              INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_mc_source_registration_tenant
                ON mc_source_registration(tenant_id);
            CREATE UNIQUE INDEX IF NOT EXISTS idx_mc_source_registration_identity
                ON mc_source_registration(tenant_id, canonical_provider_host, resource_kind, provider_resource_id);
        `);
    }

    /**
     * @summary Resolves the server-authoritative tenant key. NEVER caller-supplied.
     *
     * The isolation key is the request-context `userId` (bound at the auth boundary via
     * `RequestContextService.run`, per its contract `getUserId()` is the tenant-isolation key). In an
     * explicit local-single-user bootstrap the caller opts in with `allowLocalBootstrap` AND the
     * request context still resolves no hosted tenant; only then does the local subject stand in.
     * Hosted or ambiguous contexts with no resolved tenant return `null`, so callers fail closed.
     * @param {Object}  [options]
     * @param {Boolean} [options.allowLocalBootstrap=false] Opt into the explicit local-single-user path.
     * @param {String}  [options.localSubjectId] The explicit local subject to equate with the tenant.
     * @returns {String|null}
     */
    resolveTenantId({allowLocalBootstrap = false, localSubjectId} = {}) {
        const tenantId = RequestContextService.getUserId?.();

        if (tenantId) return tenantId;

        if (allowLocalBootstrap && localSubjectId) {
            return localSubjectId;
        }

        return null;
    }

    /**
     * @summary Registers (or idempotently returns) a neutral source identity in the REQUESTED state.
     *
     * Idempotent on the tenant-private provider identity `(host, resourceKind, providerResourceId)`:
     * a repeat call returns the existing `sourceInstanceId` and updates only the mutable
     * `display_locator` (rename), so identity survives rename and grant rotation (AC1). No secret is
     * stored — `grantRef` is a non-secret binding; `credentialRef` never enters this table (AC5).
     * @param {Object}  data
     * @param {String}  data.provider
     * @param {String}  data.canonicalProviderHost
     * @param {String}  data.resourceKind
     * @param {String}  data.providerResourceId
     * @param {String}  [data.displayLocator]
     * @param {String}  [data.grantRef]
     * @param {Object}  [data.providerCapabilities]
     * @param {Object}  [context]
     * @param {Boolean} [context.allowLocalBootstrap=false]
     * @param {String}  [context.localSubjectId]
     * @returns {Object} The stored registration row (camelCase).
     * @throws {Error} `SOURCE_REGISTRATION_NO_TENANT` when no server tenant resolves (fail closed).
     */
    register(data, context = {}) {
        const tenantId = this.resolveTenantId(context);

        if (!tenantId) {
            throw new Error('SOURCE_REGISTRATION_NO_TENANT');
        }

        const
            {provider, canonicalProviderHost, resourceKind, providerResourceId, displayLocator = null, grantRef = null, providerCapabilities = null} = data,
            now      = Date.now(),
            existing = this.db.prepare(
                `SELECT source_instance_id FROM mc_source_registration
                 WHERE tenant_id = ? AND canonical_provider_host = ? AND resource_kind = ? AND provider_resource_id = ?`
            ).get(tenantId, canonicalProviderHost, resourceKind, providerResourceId);

        if (existing) {
            this.db.prepare(
                `UPDATE mc_source_registration SET display_locator = ?, grant_ref = ?, updated_at = ?
                 WHERE tenant_id = ? AND source_instance_id = ?`
            ).run(displayLocator, grantRef, now, tenantId, existing.source_instance_id);

            return this.getRegistration(existing.source_instance_id, context);
        }

        const sourceInstanceId = crypto.randomUUID();

        this.db.prepare(
            `INSERT INTO mc_source_registration (
                source_instance_id, tenant_id, provider, canonical_provider_host, resource_kind,
                provider_resource_id, display_locator, grant_ref, provider_capabilities,
                registration_epoch, lifecycle_state, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'REQUESTED', ?, ?)`
        ).run(
            sourceInstanceId, tenantId, provider, canonicalProviderHost, resourceKind,
            providerResourceId, displayLocator, grantRef,
            providerCapabilities ? JSON.stringify(providerCapabilities) : null,
            now, now
        );

        return this.getRegistration(sourceInstanceId, context);
    }

    /**
     * Loads one registration, always scoped by the resolved server tenant + the source id, so a
     * caller can never read another tenant's row (AC4). Returns `null` when absent for this tenant.
     * @param {String} sourceInstanceId
     * @param {Object} [context]
     * @returns {Object|null}
     */
    getRegistration(sourceInstanceId, context = {}) {
        const tenantId = this.resolveTenantId(context);

        if (!tenantId) return null;

        const row = this.db.prepare(
            `SELECT * FROM mc_source_registration WHERE tenant_id = ? AND source_instance_id = ?`
        ).get(tenantId, sourceInstanceId);

        return row ? this.#toCamel(row) : null;
    }

    /**
     * @summary Advances a registration's lifecycle through a validated transition, epoch-fenced.
     *
     * Rejects any transition not permitted by {@link LIFECYCLE_TRANSITIONS} (AC2). Entering
     * `PROVISIONED` mints a strictly higher `registration_epoch`, fencing any connector still holding
     * the prior epoch (AC2/AC8). All work is scoped by `(tenant_id, source_instance_id)`.
     * @param {String} sourceInstanceId
     * @param {String} toState One of REQUESTED|PROVISIONED|ACTIVE|REVOKED.
     * @param {Object} [context]
     * @returns {Object} The updated registration row.
     * @throws {Error} `SOURCE_REGISTRATION_NO_TENANT` | `SOURCE_REGISTRATION_NOT_FOUND` | `SOURCE_REGISTRATION_INVALID_TRANSITION`.
     */
    transitionLifecycle(sourceInstanceId, toState, context = {}) {
        const tenantId = this.resolveTenantId(context);

        if (!tenantId) {
            throw new Error('SOURCE_REGISTRATION_NO_TENANT');
        }

        const current = this.db.prepare(
            `SELECT lifecycle_state, registration_epoch FROM mc_source_registration
             WHERE tenant_id = ? AND source_instance_id = ?`
        ).get(tenantId, sourceInstanceId);

        if (!current) {
            throw new Error('SOURCE_REGISTRATION_NOT_FOUND');
        }

        if (!LIFECYCLE_TRANSITIONS[current.lifecycle_state]?.includes(toState)) {
            throw new Error('SOURCE_REGISTRATION_INVALID_TRANSITION');
        }

        const nextEpoch = EPOCH_ADVANCING_STATES.has(toState)
            ? current.registration_epoch + 1
            : current.registration_epoch;

        this.db.prepare(
            `UPDATE mc_source_registration SET lifecycle_state = ?, registration_epoch = ?, updated_at = ?
             WHERE tenant_id = ? AND source_instance_id = ?`
        ).run(toState, nextEpoch, Date.now(), tenantId, sourceInstanceId);

        return this.getRegistration(sourceInstanceId, context);
    }

    /**
     * @summary The admission gate: true only for an ACTIVE registration whose submitted epoch matches
     * current server-owned state (AC3/AC8). A stale or revoked epoch can never admit.
     * @param {String} sourceInstanceId
     * @param {Number} submittedEpoch
     * @param {Object} [context]
     * @returns {Boolean}
     */
    canAdmit(sourceInstanceId, submittedEpoch, context = {}) {
        const registration = this.getRegistration(sourceInstanceId, context);

        return !!registration
            && registration.lifecycleState   === 'ACTIVE'
            && registration.registrationEpoch === submittedEpoch;
    }

    /**
     * Maps a snake_case DB row to the camelCase neutral shape. `credentialRef` is
     * intentionally absent — it is connector-only and never stored here.
     * @param {Object} row
     * @returns {Object}
     * @private
     */
    #toCamel(row) {
        return {
            sourceInstanceId     : row.source_instance_id,
            tenantId             : row.tenant_id,
            provider             : row.provider,
            canonicalProviderHost: row.canonical_provider_host,
            resourceKind         : row.resource_kind,
            providerResourceId   : row.provider_resource_id,
            displayLocator       : row.display_locator,
            grantRef             : row.grant_ref,
            providerCapabilities : row.provider_capabilities ? JSON.parse(row.provider_capabilities) : null,
            registrationEpoch    : row.registration_epoch,
            lifecycleState       : row.lifecycle_state,
            createdAt            : row.created_at,
            updatedAt            : row.updated_at
        };
    }
}

export default Neo.setupClass(SourceRegistryService);
