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
import fs                    from 'fs';
import path                  from 'path';
import RequestContextService from '../../../../../../ai/mcp/server/shared/services/RequestContextService.mjs';

/**
 * @summary Security matrix for the tenant-scoped community source registry.
 * Every case maps to a stated AC; the cross-tenant and epoch cases are the load-bearing ones.
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

    const asTenant = (userId, fn) => RequestContextService.run({userId}, fn);

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
        SourceRegistryService.db.exec('DELETE FROM mc_source_registration;');
    });

    test('AC4 — a tenant cannot read or transition another tenant\'s registration', async () => {
        const reg = await asTenant('u-alice', () => SourceRegistryService.register(sample));
        expect(reg.tenantId).toBe('u-alice');

        const bobView = await asTenant('u-bob', () => SourceRegistryService.getRegistration(reg.sourceInstanceId));
        expect(bobView, 'bob cannot read alice\'s row').toBeNull();

        await asTenant('u-bob', () => {
            expect(() => SourceRegistryService.transitionLifecycle(reg.sourceInstanceId, 'PROVISIONED'))
                .toThrow('SOURCE_REGISTRATION_NOT_FOUND');
        });

        const aliceView = await asTenant('u-alice', () => SourceRegistryService.getRegistration(reg.sourceInstanceId));
        expect(aliceView.sourceInstanceId, 'alice still sees her own row').toBe(reg.sourceInstanceId);
    });

    test('AC1 — rename + grant rotation preserve sourceInstanceId', async () => {
        const a = await asTenant('u-alice', () => SourceRegistryService.register({...sample, grantRef: 'grant-1'}));
        const b = await asTenant('u-alice', () => SourceRegistryService.register({...sample, displayLocator: 'neomjs/neo-renamed', grantRef: 'grant-2'}));

        expect(b.sourceInstanceId, 'rename does not fork identity').toBe(a.sourceInstanceId);
        expect(b.displayLocator).toBe('neomjs/neo-renamed');
        expect(b.grantRef, 'grant rotation updates the non-secret binding').toBe('grant-2');
    });

    test('AC2 — an invalid lifecycle transition is rejected', async () => {
        const reg = await asTenant('u-alice', () => SourceRegistryService.register(sample));
        expect(reg.lifecycleState).toBe('REQUESTED');

        await asTenant('u-alice', () => {
            expect(() => SourceRegistryService.transitionLifecycle(reg.sourceInstanceId, 'ACTIVE'))
                .toThrow('SOURCE_REGISTRATION_INVALID_TRANSITION');
        });
    });

    test('AC2/AC3/AC8 — epoch fences stale + revoked admission', async () => {
        const reg = await asTenant('u-alice', () => SourceRegistryService.register(sample));
        expect(reg.registrationEpoch).toBe(1);

        const provisioned = await asTenant('u-alice', () => SourceRegistryService.transitionLifecycle(reg.sourceInstanceId, 'PROVISIONED'));
        expect(provisioned.registrationEpoch, 'provisioning bumps the epoch').toBe(2);

        await asTenant('u-alice', () => SourceRegistryService.transitionLifecycle(reg.sourceInstanceId, 'ACTIVE'));

        await asTenant('u-alice', () => {
            expect(SourceRegistryService.canAdmit(reg.sourceInstanceId, 2), 'current epoch admits').toBe(true);
            expect(SourceRegistryService.canAdmit(reg.sourceInstanceId, 1), 'stale epoch is fenced').toBe(false);
        });

        await asTenant('u-alice', () => SourceRegistryService.transitionLifecycle(reg.sourceInstanceId, 'REVOKED'));
        await asTenant('u-alice', () => {
            expect(SourceRegistryService.canAdmit(reg.sourceInstanceId, 2), 'revoked cannot admit').toBe(false);
        });

        const reprovisioned = await asTenant('u-alice', () => SourceRegistryService.transitionLifecycle(reg.sourceInstanceId, 'PROVISIONED'));
        expect(reprovisioned.registrationEpoch, 'reprovision bumps epoch again, fencing the old connector').toBe(3);
    });

    test('AC5 — no secret column and no credentialRef in the neutral shape', async () => {
        const reg  = await asTenant('u-alice', () => SourceRegistryService.register({...sample, grantRef: 'grant-x'}));
        const cols = SourceRegistryService.db.prepare('PRAGMA table_info(mc_source_registration)').all().map(c => c.name);

        expect(reg).not.toHaveProperty('credentialRef');
        expect(cols).not.toContain('credential_ref');
        expect(cols, 'grant_ref (non-secret) is retained').toContain('grant_ref');
    });

    test('AC6/AC7 — fail closed without a tenant; explicit local bootstrap opts in; hosted tenant wins', async () => {
        // No request context + no explicit local subject -> fail closed.
        expect(() => SourceRegistryService.register(sample)).toThrow('SOURCE_REGISTRATION_NO_TENANT');

        // Explicit local-single-user bootstrap.
        const local = SourceRegistryService.register(sample, {allowLocalBootstrap: true, localSubjectId: 'local-subject'});
        expect(local.tenantId).toBe('local-subject');

        // A hosted tenant context is never overridden by an allowLocalBootstrap flag.
        const hosted = await asTenant('u-alice', () =>
            SourceRegistryService.register({...sample, providerResourceId: 'neomjs/other'}, {allowLocalBootstrap: true, localSubjectId: 'local-subject'}));
        expect(hosted.tenantId, 'the real server tenant wins over a local-bootstrap request').toBe('u-alice');
    });
});
