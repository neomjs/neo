import fs                          from 'fs-extra';
import path                        from 'path';
import crypto                      from 'crypto';
import Base                        from '../../../src/core/Base.mjs';
import config                      from '../../mcp/server/memory-core/config.mjs';
import logger                      from '../../mcp/server/memory-core/logger.mjs';
import RequestContextService       from '../../mcp/server/shared/services/RequestContextService.mjs';
import {carriesCredentialMaterial} from './communityBatchContract.mjs';

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
 * @summary Canonical durable audit-table columns shared by fresh creation and legacy migration.
 * @member {String}
 */
const SOURCE_REGISTRATION_AUDIT_COLUMNS_SQL = `
    audit_sequence     INTEGER PRIMARY KEY AUTOINCREMENT,
    audit_id           TEXT    UNIQUE NOT NULL,
    tenant_id          TEXT    NOT NULL,
    source_instance_id TEXT    NOT NULL,
    actor_id           TEXT    NOT NULL,
    action             TEXT    NOT NULL,
    from_state         TEXT,
    to_state           TEXT    NOT NULL,
    registration_epoch INTEGER NOT NULL,
    recorded_at        INTEGER NOT NULL
`;

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
        db: null,
        /**
         * @member {String|null} localSubjectId=null
         * @summary The subject an explicit local-single-user deployment equates with its tenant.
         *
         * Bound ONCE at the trusted server/deployment boundary (startup injection) — never supplied
         * by a caller, and never defaulted. `null` means this process is not an explicit
         * local-single-user deployment, so no caller holds source-admin authority and the local
         * mutation path fails closed. Hosted provisioning is the separate co-located operator path;
         * an ordinary authenticated hosted subject is NOT a source admin.
         */
        localSubjectId: null
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
     * @summary Creates the dedicated registry schema and migrates legacy audit rows to a durable
     * append sequence. The one-time rebuild preserves the old `(recorded_at, audit_id)` read order;
     * future reads use the AUTOINCREMENT sequence, never wall-clock or UUID coincidence.
     *
     * The UNIQUE registration identity index is scoped by `tenant_id` so provider identity is
     * tenant-private; a rename updates `display_locator` without forking `source_instance_id`.
     * @returns {void}
     */
    ensureSchema() {
        if (!this.db) return;

        // Multiple Memory Core processes can open one store during rollout. Serialize schema
        // inspection + rebuild so no second process can observe or attempt a partial migration.
        this.db.transaction(() => {
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

                CREATE TABLE IF NOT EXISTS mc_source_registration_audit (
                    ${SOURCE_REGISTRATION_AUDIT_COLUMNS_SQL}
                );
            `);

            const auditColumns = new Set(
                this.db.prepare(`PRAGMA table_info(mc_source_registration_audit)`).all()
                    .map(column => column.name)
            );

            if (!auditColumns.has('audit_sequence')) {
                this.db.exec(`
                    DROP INDEX IF EXISTS idx_mc_source_registration_audit_tenant_source;
                    ALTER TABLE mc_source_registration_audit
                        RENAME TO mc_source_registration_audit_legacy;
                    CREATE TABLE mc_source_registration_audit (
                        ${SOURCE_REGISTRATION_AUDIT_COLUMNS_SQL}
                    );
                    INSERT INTO mc_source_registration_audit (
                        audit_id, tenant_id, source_instance_id, actor_id, action, from_state,
                        to_state, registration_epoch, recorded_at
                    )
                    SELECT audit_id, tenant_id, source_instance_id, actor_id, action, from_state,
                           to_state, registration_epoch, recorded_at
                    FROM mc_source_registration_audit_legacy
                    ORDER BY recorded_at, audit_id;
                    DROP TABLE mc_source_registration_audit_legacy;
                `)
            }

            const auditIndexColumns = this.db.prepare(
                `PRAGMA index_info(idx_mc_source_registration_audit_tenant_source)`
            ).all().map(column => column.name);

            if (auditIndexColumns.length && auditIndexColumns.join(',') !== 'tenant_id,source_instance_id,audit_sequence') {
                this.db.exec(`DROP INDEX idx_mc_source_registration_audit_tenant_source`)
            }

            this.db.exec(`
                CREATE INDEX IF NOT EXISTS idx_mc_source_registration_audit_tenant_source
                    ON mc_source_registration_audit(tenant_id, source_instance_id, audit_sequence);
            `)
        }).immediate()
    }

    /**
     * @summary Resolves the READ-scope tenant key. NEVER caller-supplied.
     *
     * The isolation key is the request-context `userId` (bound at the auth boundary via
     * `RequestContextService.run`; per its contract `getUserId()` is the tenant-isolation key). With
     * no request context, an explicit local-single-user deployment reads as its injected subject.
     * Anything else resolves `null`, so reads fail closed rather than spanning tenants.
     *
     * Read scope is deliberately wider than mutation authority: any authenticated subject may read
     * its own registrations, but reading is not source-admin authority — see {@link #resolveAdminTenantId}.
     * @returns {String|null}
     */
    resolveTenantId() {
        return RequestContextService.getUserId() || this.localSubjectId || null
    }

    /**
     * @summary Resolves the tenant key for a CONTROL-PLANE mutation, or throws.
     *
     * Source-admin authority is a deployment property, not a session property. Only an explicit
     * local-single-user deployment — whose subject the server injected at startup — may use this local
     * mutation path. An ordinary authenticated hosted subject is NOT a source admin; hosted bootstrap
     * routes through the distinct co-located operator CLI, never through request context or MCP tier.
     * This path therefore fails closed with a stable, distinguishable error instead of self-serving.
     * @returns {String} The server-owned tenant key for the mutation.
     * @throws {Error} `SOURCE_REGISTRATION_AUTHORITY_UNAVAILABLE` for a hosted subject (deferred authority).
     * @throws {Error} `SOURCE_REGISTRATION_NO_TENANT` when no deployment authority resolves at all.
     */
    resolveAdminTenantId() {
        const {localSubjectId} = this;

        if (!localSubjectId) {
            // A hosted subject is authenticated but not a source admin; distinguish it from the
            // no-authority case so callers can surface the right operator-facing message.
            throw new Error(RequestContextService.getUserId()
                ? 'SOURCE_REGISTRATION_AUTHORITY_UNAVAILABLE'
                : 'SOURCE_REGISTRATION_NO_TENANT')
        }

        return localSubjectId
    }

    /**
     * @summary Registers (or idempotently returns) a neutral source identity in the REQUESTED state.
     *
     * Idempotent on the tenant-private provider identity `(host, resourceKind, providerResourceId)`:
     * a repeat call returns the existing `sourceInstanceId` and refreshes the two mutable bindings —
     * `display_locator` (rename) and `grant_ref` (grant rotation) — so durable identity survives both
     * (AC1). No secret is stored: `grantRef` is a non-secret binding and `credentialRef` never enters
     * this table (AC5).
     * @param {Object}  data
     * @param {String}  data.provider
     * @param {String}  data.canonicalProviderHost
     * @param {String}  data.resourceKind
     * @param {String}  data.providerResourceId
     * @param {String}  [data.displayLocator]
     * @param {String}  [data.grantRef]
     * @param {Object}  [data.providerCapabilities]
     * @returns {Object} The stored registration row (camelCase).
     * @throws {Error} `SOURCE_REGISTRATION_AUTHORITY_UNAVAILABLE` | `SOURCE_REGISTRATION_NO_TENANT` —
     * registration is a control-plane mutation, so it requires deployment-bound source-admin authority.
     */
    register(data) {
        const tenantId = this.resolveAdminTenantId();

        return this.registerForTenant(tenantId, data, {actorId: `local:${tenantId}`})
    }

    /**
     * @summary Registers a source for an explicit tenant at the co-located deployment-operator boundary.
     *
     * This method is intentionally NOT mapped to MCP. Possession of an MCP `admin` tool tier is metadata,
     * not source-admin authority; hosted bootstrap runs only through the server-side operator CLI whose
     * process already owns the Memory Core database. Every call writes a credential-free audit row.
     * @param {String} tenantId Deployment-owned tenant key.
     * @param {Object} data Neutral registration fields.
     * @param {Object} authority
     * @param {String} authority.actorId Deployment operator audit identity.
     * @returns {Object}
     */
    registerForTenant(tenantId, data, {actorId} = {}) {
        this.#assertOperatorAuthority(tenantId, actorId);
        this.#assertNeutralRegistration(data);

        return this.db.transaction(() => {
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

                const registration = this.getRegistrationForTenant(tenantId, existing.source_instance_id);

                this.#recordAudit({
                    tenantId,
                    sourceInstanceId : registration.sourceInstanceId,
                    actorId,
                    action           : 'REFRESHED',
                    fromState        : registration.lifecycleState,
                    toState          : registration.lifecycleState,
                    registrationEpoch: registration.registrationEpoch,
                    recordedAt       : now
                });

                return registration
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

            const registration = this.getRegistrationForTenant(tenantId, sourceInstanceId);

            this.#recordAudit({
                tenantId,
                sourceInstanceId,
                actorId,
                action           : 'REGISTERED',
                fromState        : null,
                toState          : registration.lifecycleState,
                registrationEpoch: registration.registrationEpoch,
                recordedAt       : now
            });

            return registration
        })()
    }

    /**
     * Loads one registration, always scoped by the resolved read tenant + the source id, so a
     * caller can never read another tenant's row (AC4). Returns `null` when absent for this tenant.
     * @param {String} sourceInstanceId
     * @returns {Object|null}
     */
    getRegistration(sourceInstanceId) {
        const tenantId = this.resolveTenantId();

        if (!tenantId) return null;

        return this.getRegistrationForTenant(tenantId, sourceInstanceId)
    }

    /**
     * @summary Loads one registration under an explicit server-owned tenant predicate.
     * @param {String} tenantId
     * @param {String} sourceInstanceId
     * @returns {Object|null}
     */
    getRegistrationForTenant(tenantId, sourceInstanceId) {
        const row = this.db.prepare(
            `SELECT * FROM mc_source_registration WHERE tenant_id = ? AND source_instance_id = ?`
        ).get(tenantId, sourceInstanceId);

        return row ? this.#toCamel(row) : null;
    }

    /**
     * @summary Resolves a caller-neutral provider identity to the current tenant's durable source row.
     * @param {Object} identity
     * @param {String} identity.canonicalProviderHost
     * @param {String} identity.resourceKind
     * @param {String} identity.providerResourceId
     * @returns {Object|null}
     */
    resolveRegistration(identity) {
        const tenantId = this.resolveTenantId();

        if (!tenantId) return null;

        const row = this.db.prepare(
            `SELECT * FROM mc_source_registration
             WHERE tenant_id = ? AND canonical_provider_host = ? AND resource_kind = ? AND provider_resource_id = ?`
        ).get(tenantId, identity.canonicalProviderHost, identity.resourceKind, identity.providerResourceId);

        return row ? this.#toCamel(row) : null
    }

    /**
     * @summary Advances a registration's lifecycle as one compare-and-swap against the control
     * generation the caller observed — the stale-writer fence.
     *
     * A read-then-write transition is not a fence: between the read and the write another actor can
     * revoke, and an unconditional UPDATE would silently resurrect the superseded state. So the
     * caller must present the `(expectedState, expectedEpoch)` it observed, and that generation joins
     * tenant + source in the UPDATE predicate, making the whole transition a single atomic statement.
     * A superseded writer matches zero rows and fails with `SOURCE_REGISTRATION_STALE_CONTROL` instead
     * of overwriting newer truth. Entering `PROVISIONED` mints a strictly higher epoch, so a retry
     * holding pre-revoke authority can never traverse `REVOKED -> PROVISIONED -> ACTIVE` (AC2/AC8).
     * @param {String} sourceInstanceId
     * @param {String} toState One of REQUESTED|PROVISIONED|ACTIVE|REVOKED.
     * @param {Object} generation The control generation the caller observed.
     * @param {String} generation.expectedState
     * @param {Number} generation.expectedEpoch
     * @returns {Object} The updated registration row.
     * @throws {Error} `SOURCE_REGISTRATION_AUTHORITY_UNAVAILABLE` | `SOURCE_REGISTRATION_NO_TENANT` |
     * `SOURCE_REGISTRATION_CONTROL_GENERATION_REQUIRED` | `SOURCE_REGISTRATION_INVALID_TRANSITION` |
     * `SOURCE_REGISTRATION_STALE_CONTROL`.
     */
    transitionLifecycle(sourceInstanceId, toState, {expectedState, expectedEpoch} = {}) {
        const tenantId = this.resolveAdminTenantId();

        return this.transitionLifecycleForTenant(tenantId, sourceInstanceId, toState, {
            actorId: `local:${tenantId}`,
            expectedState,
            expectedEpoch
        })
    }

    /**
     * @summary Applies one lifecycle CAS for a co-located deployment operator and audits the result.
     * @param {String} tenantId
     * @param {String} sourceInstanceId
     * @param {String} toState
     * @param {Object} generation
     * @param {String} generation.actorId
     * @param {String} generation.expectedState
     * @param {Number} generation.expectedEpoch
     * @returns {Object}
     */
    transitionLifecycleForTenant(tenantId, sourceInstanceId, toState, {actorId, expectedState, expectedEpoch} = {}) {
        this.#assertOperatorAuthority(tenantId, actorId);

        return this.db.transaction(() => {
            if (!expectedState || !Number.isInteger(expectedEpoch)) {
                throw new Error('SOURCE_REGISTRATION_CONTROL_GENERATION_REQUIRED');
            }

            if (!LIFECYCLE_TRANSITIONS[expectedState]?.includes(toState)) {
                throw new Error('SOURCE_REGISTRATION_INVALID_TRANSITION');
            }

            const
                nextEpoch = EPOCH_ADVANCING_STATES.has(toState) ? expectedEpoch + 1 : expectedEpoch,
                result    = this.db.prepare(
                    `UPDATE mc_source_registration SET lifecycle_state = ?, registration_epoch = ?, updated_at = ?
                     WHERE tenant_id = ? AND source_instance_id = ? AND lifecycle_state = ? AND registration_epoch = ?`
                ).run(toState, nextEpoch, Date.now(), tenantId, sourceInstanceId, expectedState, expectedEpoch);

            if (result.changes === 0) {
                throw new Error('SOURCE_REGISTRATION_STALE_CONTROL');
            }

            const registration = this.getRegistrationForTenant(tenantId, sourceInstanceId);

            this.#recordAudit({
                tenantId,
                sourceInstanceId,
                actorId,
                action           : toState,
                fromState        : expectedState,
                toState,
                registrationEpoch: registration.registrationEpoch,
                recordedAt       : registration.updatedAt
            });

            return registration
        })()
    }

    /**
     * @summary Returns the credential-free operator audit trail for one tenant-scoped source.
     * @param {String} tenantId
     * @param {String} sourceInstanceId
     * @returns {Object[]}
     */
    listAuditForTenant(tenantId, sourceInstanceId) {
        return this.db.prepare(
            `SELECT * FROM mc_source_registration_audit
             WHERE tenant_id = ? AND source_instance_id = ? ORDER BY audit_sequence`
        ).all(tenantId, sourceInstanceId).map(row => ({
            auditId          : row.audit_id,
            tenantId         : row.tenant_id,
            sourceInstanceId : row.source_instance_id,
            actorId          : row.actor_id,
            action           : row.action,
            fromState        : row.from_state,
            toState          : row.to_state,
            registrationEpoch: row.registration_epoch,
            recordedAt       : row.recorded_at
        }))
    }

    /**
     * @summary The admission gate: true only for an ACTIVE registration whose submitted epoch matches
     * current server-owned state (AC3/AC8). A stale or revoked epoch can never admit.
     * @param {String} sourceInstanceId
     * @param {Number} submittedEpoch
     * @returns {Boolean}
     */
    canAdmit(sourceInstanceId, submittedEpoch) {
        const registration = this.getRegistration(sourceInstanceId);

        return !!registration
            && registration.lifecycleState   === 'ACTIVE'
            && registration.registrationEpoch === submittedEpoch;
    }

    /**
     * @param {String} tenantId
     * @param {String} actorId
     * @throws {Error} Stable operator-boundary errors.
     * @private
     */
    #assertOperatorAuthority(tenantId, actorId) {
        if (typeof tenantId !== 'string' || !tenantId.trim()) {
            throw new Error('SOURCE_OPERATOR_TENANT_REQUIRED')
        }
        if (typeof actorId !== 'string' || !actorId.trim()) {
            throw new Error('SOURCE_OPERATOR_ACTOR_REQUIRED')
        }
    }

    /**
     * @param {Object} data
     * @throws {Error} When identity is incomplete or credential-shaped material is present.
     * @private
     */
    #assertNeutralRegistration(data) {
        const required = ['provider', 'canonicalProviderHost', 'resourceKind', 'providerResourceId'];

        if (!data || typeof data !== 'object' || required.some(key => typeof data[key] !== 'string' || !data[key].trim())) {
            throw new Error('SOURCE_REGISTRATION_IDENTITY_INVALID')
        }
        if (carriesCredentialMaterial(data)) {
            throw new Error('SOURCE_REGISTRATION_CREDENTIAL_MATERIAL_FORBIDDEN')
        }
    }

    /**
     * @param {Object} event
     * @returns {void}
     * @private
     */
    #recordAudit(event) {
        this.db.prepare(
            `INSERT INTO mc_source_registration_audit (
                audit_id, tenant_id, source_instance_id, actor_id, action, from_state,
                to_state, registration_epoch, recorded_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
            crypto.randomUUID(), event.tenantId, event.sourceInstanceId, event.actorId, event.action,
            event.fromState, event.toState, event.registrationEpoch, event.recordedAt
        )
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
