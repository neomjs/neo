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
    let AdmissionService, createTransportVisibleToolFacade, hostedFacade, localFacade, originalAdmit, originalHealth;

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
                providerEntityId      : 'review-1',
                parentProviderEntityId: 'pull-1',
                occurrenceKind        : 'pull.review.submitted',
                occurrenceCoordinate  : 'review-1:create',
                occurredAt            : '2026-07-18T10:00:00Z',
                actorKind             : 'user',
                providerState         : 'APPROVED',
                sourceAssociation     : 'MEMBER'
            }],
            nextProviderState: {cursor: 'p2'},
            nextInventoryHash: 'inv-1',
            coverage         : {fromBasis: 'c1', toBasis: 'c9', complete: true}
        }
    });

    test.beforeAll(async () => {
        ({createTransportVisibleToolFacade} = await import(
            '../../../../../../../ai/mcp/server/memory-core/toolService.mjs'
        ));

        hostedFacade     = createTransportVisibleToolFacade({resolveTransport: () => 'streamable-http'});
        localFacade      = createTransportVisibleToolFacade({resolveTransport: () => 'stdio'});
        AdmissionService = (await import('../../../../../../../ai/services/memory-core/CommunityBatchAdmissionService.mjs')).default;

        originalAdmit  = AdmissionService.admitHostedBatch;
        originalHealth = AdmissionService.getHostedSourceHealth;
    });

    test.afterAll(() => {
        AdmissionService.admitHostedBatch       = originalAdmit;
        AdmissionService.getHostedSourceHealth = originalHealth;
    });

    test('streamable-http lists both bounded tools and dispatches the authority-free envelope', async () => {
        const pushed = [];

        AdmissionService.admitHostedBatch = args => {
            pushed.push(args);
            return {status: 'accepted'}
        };
        AdmissionService.getHostedSourceHealth = () => ({ready: true, code: 'COMMUNITY_SOURCE_READY'});

        const names = hostedFacade.listTools().tools.map(tool => tool.name);
        expect(names).toContain('admit_community_batch');
        expect(names).toContain('get_community_source_health');

        await expect(hostedFacade.callTool('admit_community_batch', envelope())).resolves.toEqual({status: 'accepted'});
        expect(pushed).toEqual([envelope()]);
        await expect(hostedFacade.callTool('get_community_source_health', {source: envelope().source}))
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

        await expect(hostedFacade.callTool('admit_community_batch', forged)).resolves.toMatchObject({
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

        await expect(hostedFacade.callTool('admit_community_batch', withProse)).resolves.toMatchObject({
            status: 'conflict',
            code  : 'COMMUNITY_BATCH_ENVELOPE_INVALID',
            errors: expect.arrayContaining(['OBSERVATION_0_CARRIES_PROSE_TITLE'])
        });
        await expect(hostedFacade.callTool('get_community_source_health', {
            source     : envelope().source,
            accessToken: 'must not disappear'
        })).resolves.toEqual({ready: false, code: 'COMMUNITY_SOURCE_IDENTITY_INVALID'});
        expect(admissionDispatched).toBe(false);
        expect(healthDispatched).toBe(false);
    });

    test('stdio hides and refuses hosted tools while direct service admission remains available', async () => {
        const names = localFacade.listTools().tools.map(tool => tool.name);
        expect(names).not.toContain('admit_community_batch');
        expect(names).not.toContain('get_community_source_health');
        await expect(localFacade.callTool('admit_community_batch', envelope())).rejects.toThrow(/streamable-http/);
    });

    test('transport authority resolves at call time and unknown transports fail closed', async () => {
        let transport = 'stdio';

        const facade = createTransportVisibleToolFacade({resolveTransport: () => transport});

        expect(facade.listTools().tools.map(tool => tool.name)).not.toContain('admit_community_batch');

        transport = 'streamable-http';
        expect(facade.listTools().tools.map(tool => tool.name)).toContain('admit_community_batch');

        transport = 'websocket';
        expect(facade.listTools().tools.map(tool => tool.name)).not.toContain('admit_community_batch');
        await expect(facade.callTool('admit_community_batch', envelope())).rejects.toThrow(/streamable-http/);
    });
});
