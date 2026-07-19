import {setup} from '../../../../../setup.mjs';

setup({
    neoConfig: {unitTestMode: true},
    appConfig: {
        name             : 'MemoryCoreCommunityBatchToolTest',
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../../src/core/_export.mjs';

/**
 * @summary OpenAPI registration and hosted-transport guards for the community batch facade.
 */
test.describe.configure({mode: 'serial'});

test.describe('Memory Core hosted community tools (#15156)', () => {
    let AdmissionService, aiConfig, callTool, listTools, originalAdmit, originalHealth, originalTransport;

    const envelope = () => ({
        source: {
            canonicalProviderHost: 'github.com',
            resourceKind         : 'repository',
            providerResourceId   : 'neomjs/neo'
        },
        batch: {
            schemaVersion             : 'community-activity-batch.v1',
            resourceFamily            : 'issues',
            adapterSchemaVersion      : 'github-issue.v1',
            providerStateSchemaVersion: 'gh-state.v1',
            baseCheckpointVersion     : 0,
            baseInventoryHash         : null,
            batchId                   : 'batch-1',
            observations              : [{
                providerEntityId    : '1',
                occurrenceKind      : 'issue.opened',
                occurrenceCoordinate: '1:create',
                occurredAt          : '2026-07-18T10:00:00Z',
                actorKind           : 'user'
            }],
            nextProviderState: {cursor: 'p2'},
            nextInventoryHash: 'inv-1',
            coverage         : {fromBasis: 'c1', toBasis: 'c9', complete: true}
        }
    });

    test.beforeAll(async () => {
        ({callTool, listTools} = await import('../../../../../../../ai/mcp/server/memory-core/toolService.mjs'));
        aiConfig         = (await import('../../../../../../../ai/mcp/server/memory-core/config.mjs')).default;
        AdmissionService = (await import('../../../../../../../ai/services/memory-core/CommunityBatchAdmissionService.mjs')).default;

        originalAdmit     = AdmissionService.admitHostedBatch;
        originalHealth    = AdmissionService.getHostedSourceHealth;
        originalTransport = aiConfig.transport;
    });

    test.afterAll(() => {
        AdmissionService.admitHostedBatch       = originalAdmit;
        AdmissionService.getHostedSourceHealth = originalHealth;
        aiConfig.transport                      = originalTransport;
    });

    test.beforeEach(() => {
        aiConfig.transport = 'streamable-http';
    });

    test('streamable-http lists both bounded tools and dispatches the authority-free envelope', async () => {
        const pushed = [];

        AdmissionService.admitHostedBatch = args => {
            pushed.push(args);
            return {status: 'accepted'}
        };
        AdmissionService.getHostedSourceHealth = () => ({ready: true, code: 'COMMUNITY_SOURCE_READY'});

        const names = listTools().tools.map(tool => tool.name);
        expect(names).toContain('admit_community_batch');
        expect(names).toContain('get_community_source_health');

        await expect(callTool('admit_community_batch', envelope())).resolves.toEqual({status: 'accepted'});
        expect(pushed).toEqual([envelope()]);
        await expect(callTool('get_community_source_health', {source: envelope().source}))
            .resolves.toEqual({ready: true, code: 'COMMUNITY_SOURCE_READY'});
    });

    test('OpenAPI rejects caller-stamped authority before service dispatch', async () => {
        let dispatched = false;
        AdmissionService.admitHostedBatch = () => {
            dispatched = true;
            return {status: 'accepted'}
        };

        const forged = envelope();
        forged.batch.registrationEpoch = 2;

        await expect(callTool('admit_community_batch', forged)).resolves.toMatchObject({
            status: 'conflict',
            code  : 'COMMUNITY_BATCH_ENVELOPE_INVALID'
        });
        expect(dispatched).toBe(false);
    });

    test('raw boundary refuses nested prose and health credentials before OpenAPI can strip them', async () => {
        let admissionDispatched = false,
            healthDispatched    = false;

        AdmissionService.admitHostedBatch = () => {
            admissionDispatched = true;
            return {status: 'accepted'}
        };
        AdmissionService.getHostedSourceHealth = () => {
            healthDispatched = true;
            return {ready: true, code: 'COMMUNITY_SOURCE_READY'}
        };

        const withProse = envelope();
        withProse.batch.observations[0].title = 'must not disappear';

        await expect(callTool('admit_community_batch', withProse)).resolves.toMatchObject({
            status: 'conflict',
            code  : 'COMMUNITY_BATCH_ENVELOPE_INVALID',
            errors: expect.arrayContaining(['OBSERVATION_0_CARRIES_PROSE_TITLE'])
        });
        await expect(callTool('get_community_source_health', {
            source     : envelope().source,
            accessToken: 'must not disappear'
        })).resolves.toEqual({ready: false, code: 'COMMUNITY_SOURCE_IDENTITY_INVALID'});
        expect(admissionDispatched).toBe(false);
        expect(healthDispatched).toBe(false);
    });

    test('stdio hides and refuses hosted tools while direct service admission remains available', async () => {
        aiConfig.transport = 'stdio';

        const names = listTools().tools.map(tool => tool.name);
        expect(names).not.toContain('admit_community_batch');
        expect(names).not.toContain('get_community_source_health');
        await expect(callTool('admit_community_batch', envelope())).rejects.toThrow(/streamable-http/);
    });
});
