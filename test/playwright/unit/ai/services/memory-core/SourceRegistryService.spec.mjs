import {setup} from '../../../../setup.mjs';

const appName = 'SourceRegistryServiceTest';

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect}        from '@playwright/test';
import Neo                   from '../../../../../../src/Neo.mjs';
import * as core             from '../../../../../../src/core/_export.mjs';
import crypto                from 'crypto';
import fs                    from 'fs';
import path                  from 'path';
import RequestContextService from '../../../../../../ai/mcp/server/shared/services/RequestContextService.mjs';

/**
 * @summary Security matrix for the tenant-scoped community source registry.
 *
 * Two properties carry the weight: source-admin authority is a deployment property (never a caller
 * or session property), and every lifecycle transition is a compare-and-swap against the control
 * generation the caller observed, so a superseded writer cannot resurrect revoked state.
 */
test.describe('Neo.ai.services.memory-core.SourceRegistryService', () => {
    const sample = {
        provider             : 'github',
        canonicalProviderHost: 'github.com',
        resourceKind         : 'repository',
        providerResourceId   : 'neomjs/neo',
        displayLocator       : 'neomjs/neo'
    };

    let SourceRegistryService, originalEnv, testDbPath;

    const
        asTenant = (userId, fn) => RequestContextService.run({userId}, fn),

        /**
         * Seeds a row for an arbitrary tenant directly, bypassing authority — a fixture for the
         * read-isolation case, which must be provable independently of who may mutate.
         */
        seed = tenantId => {
            const id  = crypto.randomUUID(),
                  now = Date.now();

            SourceRegistryService.db.prepare(
                `INSERT INTO mc_source_registration (
                    source_instance_id, tenant_id, provider, canonical_provider_host, resource_kind,
                    provider_resource_id, display_locator, grant_ref, provider_capabilities,
                    registration_epoch, lifecycle_state, created_at, updated_at
                 ) VALUES (?, ?, 'github', 'github.com', 'repository', 'neomjs/neo', 'neomjs/neo', null, null, 1, 'REQUESTED', ?, ?)`
            ).run(id, tenantId, now, now);

            return id
        },

        /** Registers under an explicit local-single-user deployment. */
        registerLocally = (subject, data = sample) => {
            SourceRegistryService.localSubjectId = subject;
            return SourceRegistryService.register(data)
        };

    test.beforeAll(async () => {
        originalEnv = {
            NEO_MEMORY_DB_PATH_TEST: process.env.NEO_MEMORY_DB_PATH_TEST,
            UNIT_TEST_MODE         : process.env.UNIT_TEST_MODE
        };

        const tmpDir = path.resolve(process.cwd(), 'tmp');
        if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, {recursive: true});

        testDbPath = path.join(tmpDir, `mc-source-registry-test-${process.pid}-${Date.now()}.sqlite`);
        for (const suffix of ['', '-wal', '-shm']) {
            try { fs.unlinkSync(`${testDbPath}${suffix}`); } catch (e) {}
        }

        process.env.UNIT_TEST_MODE          = 'true';
        process.env.NEO_MEMORY_DB_PATH_TEST = testDbPath;

        SourceRegistryService = (await import('../../../../../../ai/services/memory-core/SourceRegistryService.mjs')).default;
        await SourceRegistryService.initAsync();
    });

    test.afterAll(() => {
        Object.entries(originalEnv).forEach(([k, v]) => {
            v === undefined ? delete process.env[k] : (process.env[k] = v);
        });
    });

    test.beforeEach(() => {
        SourceRegistryService.db.exec(`
            DROP TRIGGER IF EXISTS fail_source_audit;
            DELETE FROM mc_source_registration_audit;
            DELETE FROM mc_source_registration;
        `);
        // Fail-closed default: this process is NOT an explicit local-single-user deployment.
        SourceRegistryService.localSubjectId = null;
    });

    // ---------------------------------------------------------------- authority (AC6/AC7)

    test('an ordinary authenticated hosted subject is not a source admin', async () => {
        await asTenant('u-alice', () => {
            expect(() => SourceRegistryService.register(sample)).toThrow('SOURCE_REGISTRATION_AUTHORITY_UNAVAILABLE');
        });

        expect(SourceRegistryService.db.prepare('SELECT count(*) AS c FROM mc_source_registration').get().c).toBe(0);
    });

    test('a caller cannot spoof local authority — authority is deployment-bound, not request-bound', async () => {
        // The old caller-supplied opt-in shape is inert: extra keys confer nothing.
        await asTenant('u-mallory', () => {
            expect(() => SourceRegistryService.register({...sample, allowLocalBootstrap: true, localSubjectId: 'u-mallory'}))
                .toThrow('SOURCE_REGISTRATION_AUTHORITY_UNAVAILABLE');
        });

        // And with no request context at all, it still refuses without an injected deployment subject.
        expect(() => SourceRegistryService.register({...sample, allowLocalBootstrap: true, localSubjectId: 'nobody'}))
            .toThrow('SOURCE_REGISTRATION_NO_TENANT');

        expect(SourceRegistryService.db.prepare('SELECT count(*) AS c FROM mc_source_registration').get().c).toBe(0);
    });

    test('an explicit local-single-user deployment registers under its injected subject', () => {
        const reg = registerLocally('local-subject');

        expect(reg.tenantId).toBe('local-subject');
        expect(reg.lifecycleState).toBe('REQUESTED');
        expect(reg.registrationEpoch).toBe(1);
    });

    test('same-clock reverse UUIDs preserve causal operator-audit order through a durable sequence', () => {
        const
            originalNow        = Date.now,
            originalRandomUUID = crypto.randomUUID,
            uuids              = [
                '00000000-0000-4000-8000-000000000001', // source id
                'ffffffff-ffff-4fff-8fff-ffffffffffff', // REGISTERED audit: sorts last by UUID
                '00000000-0000-4000-8000-000000000000'  // PROVISIONED audit: sorts first by UUID
            ];

        let uuidIndex = 0;

        Date.now         = () => 123456789;
        crypto.randomUUID = () => uuids[uuidIndex++];

        try {
            const reg = SourceRegistryService.registerForTenant('tenant-a', sample, {actorId: 'deploy-operator'});

            const provisioned = SourceRegistryService.transitionLifecycleForTenant(
                'tenant-a', reg.sourceInstanceId, 'PROVISIONED', {
                    actorId      : 'deploy-operator',
                    expectedState: 'REQUESTED',
                    expectedEpoch: 1
                }
            );

            const events = SourceRegistryService.listAuditForTenant('tenant-a', reg.sourceInstanceId);

            expect(provisioned.registrationEpoch).toBe(2);
            expect(events.map(event => event.action)).toEqual(['REGISTERED', 'PROVISIONED']);

            const stored = SourceRegistryService.db.prepare(
                `SELECT audit_sequence FROM mc_source_registration_audit
                 WHERE tenant_id = ? AND source_instance_id = ? ORDER BY audit_sequence`
            ).all('tenant-a', reg.sourceInstanceId);

            expect(stored).toHaveLength(2);
            expect(stored[1].audit_sequence).toBeGreaterThan(stored[0].audit_sequence)
        } finally {
            Date.now          = originalNow;
            crypto.randomUUID = originalRandomUUID
        }
    });

    test('ensureSchema migrates legacy audit rows in prior deterministic order and is idempotent', () => {
        const
            Database  = SourceRegistryService.db.constructor,
            legacyDb  = new Database(':memory:'),
            currentDb = SourceRegistryService.db;

        legacyDb.exec(`
            CREATE TABLE mc_source_registration_audit (
                audit_id           TEXT    PRIMARY KEY,
                tenant_id          TEXT    NOT NULL,
                source_instance_id TEXT    NOT NULL,
                actor_id           TEXT    NOT NULL,
                action             TEXT    NOT NULL,
                from_state         TEXT,
                to_state           TEXT    NOT NULL,
                registration_epoch INTEGER NOT NULL,
                recorded_at        INTEGER NOT NULL
            );
            CREATE INDEX idx_mc_source_registration_audit_tenant_source
                ON mc_source_registration_audit(tenant_id, source_instance_id, recorded_at);
            INSERT INTO mc_source_registration_audit VALUES
                ('z-audit', 'tenant-a', 'source-a', 'operator', 'INSERTED_FIRST',  null, 'REQUESTED', 1, 1000),
                ('a-audit', 'tenant-a', 'source-a', 'operator', 'INSERTED_SECOND', null, 'REQUESTED', 1, 1000);
        `);

        try {
            SourceRegistryService.set({db: legacyDb});
            SourceRegistryService.ensureSchema();
            SourceRegistryService.ensureSchema();

            const
                columns = legacyDb.prepare(`PRAGMA table_info(mc_source_registration_audit)`).all(),
                rows    = legacyDb.prepare(
                    `SELECT audit_sequence, audit_id FROM mc_source_registration_audit ORDER BY audit_sequence`
                ).all();

            expect(columns.find(column => column.name === 'audit_sequence')).toMatchObject({
                type: 'INTEGER',
                pk  : 1
            });
            expect(columns.find(column => column.name === 'audit_id')).toMatchObject({
                notnull: 1,
                pk     : 0
            });
            expect(rows.map(row => row.audit_id)).toEqual(['a-audit', 'z-audit']);
            expect(rows[1].audit_sequence).toBeGreaterThan(rows[0].audit_sequence);
            expect(legacyDb.prepare(
                `PRAGMA index_info(idx_mc_source_registration_audit_tenant_source)`
            ).all().map(column => column.name)).toEqual([
                'tenant_id', 'source_instance_id', 'audit_sequence'
            ]);
            expect(() => legacyDb.prepare(
                `INSERT INTO mc_source_registration_audit (
                    audit_id, tenant_id, source_instance_id, actor_id, action, from_state,
                    to_state, registration_epoch, recorded_at
                 ) VALUES ('a-audit', 'tenant-a', 'source-a', 'operator', 'DUPLICATE', null,
                    'REQUESTED', 1, 1001)`
            ).run()).toThrow()
        } finally {
            SourceRegistryService.set({db: currentDb});
            legacyDb.close()
        }
    });

    test('operator registration refuses credential-shaped fields before any row or audit is written', () => {
        expect(() => SourceRegistryService.registerForTenant('tenant-a', {
            ...sample,
            credentialRef: 'vault://github/token'
        }, {actorId: 'deploy-operator'})).toThrow('SOURCE_REGISTRATION_CREDENTIAL_MATERIAL_FORBIDDEN');

        expect(SourceRegistryService.db.prepare('SELECT count(*) AS c FROM mc_source_registration').get().c).toBe(0);
        expect(SourceRegistryService.db.prepare('SELECT count(*) AS c FROM mc_source_registration_audit').get().c).toBe(0);
    });

    test('an audit-write failure rolls back the operator authority mutation', () => {
        const reg = SourceRegistryService.registerForTenant('tenant-a', sample, {actorId: 'deploy-operator'});

        SourceRegistryService.db.exec(`
            CREATE TRIGGER fail_source_audit BEFORE INSERT ON mc_source_registration_audit
            WHEN NEW.action = 'PROVISIONED'
            BEGIN
                SELECT RAISE(ABORT, 'forced audit failure');
            END;
        `);

        expect(() => SourceRegistryService.transitionLifecycleForTenant(
            'tenant-a', reg.sourceInstanceId, 'PROVISIONED', {
                actorId      : 'deploy-operator',
                expectedState: 'REQUESTED',
                expectedEpoch: 1
            }
        )).toThrow();

        expect(SourceRegistryService.getRegistrationForTenant('tenant-a', reg.sourceInstanceId)).toMatchObject({
            lifecycleState   : 'REQUESTED',
            registrationEpoch: 1
        });
        expect(SourceRegistryService.listAuditForTenant('tenant-a', reg.sourceInstanceId).map(event => event.action))
            .toEqual(['REGISTERED']);
    });

    // ---------------------------------------------------------------- isolation (AC4)

    test('a tenant cannot read another tenant\'s registration', async () => {
        const aliceRow = seed('u-alice');

        expect(await asTenant('u-bob', () => SourceRegistryService.getRegistration(aliceRow)), 'bob cannot read alice\'s row').toBeNull();
        expect((await asTenant('u-alice', () => SourceRegistryService.getRegistration(aliceRow))).sourceInstanceId).toBe(aliceRow);
    });

    // ---------------------------------------------------------------- identity (AC1) + secrets (AC5)

    test('rename + grant rotation preserve sourceInstanceId', () => {
        const a = registerLocally('local-subject', {...sample, grantRef: 'grant-1'}),
              b = registerLocally('local-subject', {...sample, displayLocator: 'neomjs/neo-renamed', grantRef: 'grant-2'});

        expect(b.sourceInstanceId, 'rename does not fork identity').toBe(a.sourceInstanceId);
        expect(b.displayLocator).toBe('neomjs/neo-renamed');
        expect(b.grantRef).toBe('grant-2');
    });

    test('no secret column and no credentialRef in the neutral shape', () => {
        const reg  = registerLocally('local-subject', {...sample, grantRef: 'grant-x'}),
              cols = SourceRegistryService.db.prepare('PRAGMA table_info(mc_source_registration)').all().map(c => c.name);

        expect(reg).not.toHaveProperty('credentialRef');
        expect(cols).not.toContain('credential_ref');
        expect(cols).toContain('grant_ref');
    });

    // ---------------------------------------------------------------- lifecycle + fencing (AC2/AC3/AC8)

    test('a transition without a control generation is refused', () => {
        const reg = registerLocally('local-subject');

        expect(() => SourceRegistryService.transitionLifecycle(reg.sourceInstanceId, 'PROVISIONED'))
            .toThrow('SOURCE_REGISTRATION_CONTROL_GENERATION_REQUIRED');
    });

    test('an invalid lifecycle transition is rejected', () => {
        const reg = registerLocally('local-subject');

        expect(() => SourceRegistryService.transitionLifecycle(reg.sourceInstanceId, 'ACTIVE', {expectedState: 'REQUESTED', expectedEpoch: 1}))
            .toThrow('SOURCE_REGISTRATION_INVALID_TRANSITION');
    });

    test('epoch fences stale and revoked admission', () => {
        const reg = registerLocally('local-subject'),
              id  = reg.sourceInstanceId;

        const provisioned = SourceRegistryService.transitionLifecycle(id, 'PROVISIONED', {expectedState: 'REQUESTED', expectedEpoch: 1});
        expect(provisioned.registrationEpoch, 'provisioning advances the epoch').toBe(2);

        SourceRegistryService.transitionLifecycle(id, 'ACTIVE', {expectedState: 'PROVISIONED', expectedEpoch: 2});

        expect(SourceRegistryService.canAdmit(id, 2), 'current epoch admits').toBe(true);
        expect(SourceRegistryService.canAdmit(id, 1), 'stale epoch is fenced').toBe(false);

        SourceRegistryService.transitionLifecycle(id, 'REVOKED', {expectedState: 'ACTIVE', expectedEpoch: 2});
        expect(SourceRegistryService.canAdmit(id, 2), 'revoked cannot admit').toBe(false);
    });

    test('revoke wins over a stale activate — the superseded writer cannot resurrect ACTIVE', () => {
        const id = registerLocally('local-subject').sourceInstanceId;

        SourceRegistryService.transitionLifecycle(id, 'PROVISIONED', {expectedState: 'REQUESTED', expectedEpoch: 1});

        // Writer A observed PROVISIONED@2 and intends to activate.
        const staleGeneration = {expectedState: 'PROVISIONED', expectedEpoch: 2};

        // An intervening revoke lands first.
        SourceRegistryService.transitionLifecycle(id, 'REVOKED', {expectedState: 'PROVISIONED', expectedEpoch: 2});

        // Writer A now finishes against its superseded generation.
        expect(() => SourceRegistryService.transitionLifecycle(id, 'ACTIVE', staleGeneration))
            .toThrow('SOURCE_REGISTRATION_STALE_CONTROL');

        expect(SourceRegistryService.getRegistration(id).lifecycleState, 'the revocation survives').toBe('REVOKED');
    });

    test('a pre-revoke retry cannot reprovision or reactivate across the fence', () => {
        const id = registerLocally('local-subject').sourceInstanceId;

        SourceRegistryService.transitionLifecycle(id, 'PROVISIONED', {expectedState: 'REQUESTED', expectedEpoch: 1});
        SourceRegistryService.transitionLifecycle(id, 'ACTIVE',      {expectedState: 'PROVISIONED', expectedEpoch: 2});
        SourceRegistryService.transitionLifecycle(id, 'REVOKED',     {expectedState: 'ACTIVE', expectedEpoch: 2});

        // A retry replaying pre-revoke authority is refused.
        expect(() => SourceRegistryService.transitionLifecycle(id, 'REVOKED', {expectedState: 'ACTIVE', expectedEpoch: 2}))
            .toThrow('SOURCE_REGISTRATION_STALE_CONTROL');

        // A legitimate reprovision advances the epoch, invalidating every older generation.
        const reprovisioned = SourceRegistryService.transitionLifecycle(id, 'PROVISIONED', {expectedState: 'REVOKED', expectedEpoch: 2});
        expect(reprovisioned.registrationEpoch).toBe(3);

        // The pre-revoke generation still cannot activate after the fence advanced.
        expect(() => SourceRegistryService.transitionLifecycle(id, 'ACTIVE', {expectedState: 'PROVISIONED', expectedEpoch: 2}))
            .toThrow('SOURCE_REGISTRATION_STALE_CONTROL');
        expect(SourceRegistryService.canAdmit(id, 2), 'the old epoch never admits again').toBe(false);
    });
});
