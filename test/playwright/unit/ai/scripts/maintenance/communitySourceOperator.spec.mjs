import {setup} from '../../../../setup.mjs';

setup({
    neoConfig: {unitTestMode: true},
    appConfig: {
        name             : 'CommunitySourceOperatorTest',
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';

/**
 * @summary CLI routing witnesses for the co-located, non-MCP source control plane.
 */
test.describe('communitySourceOperator — audited hosted bootstrap (#15156)', () => {
    let parseArgs, runOperator, validateArgs;

    test.beforeAll(async () => {
        ({parseArgs, runOperator, validateArgs} =
            await import('../../../../../../ai/scripts/maintenance/communitySourceOperator.mjs'))
    });

    test('lifecycle actions require tenant, source id, and an observed CAS generation', () => {
        expect(validateArgs(parseArgs(['--action', 'activate'], {NEO_COMMUNITY_OPERATOR_ID: 'deploy-1'})))
            .toEqual([
                '--tenant-id is required.',
                '--source-instance-id is required for lifecycle transitions.',
                '--expected-state is required for lifecycle transitions.',
                '--expected-epoch must be an integer for lifecycle transitions.'
            ])
    });

    test('activate routes exact tenant + generation + deployment actor to the registry owner', async () => {
        const calls = [];
        const args  = parseArgs([
            '--action', 'activate',
            '--tenant-id', 'tenant-a',
            '--source-instance-id', 'source-1',
            '--expected-state', 'PROVISIONED',
            '--expected-epoch', '2'
        ], {NEO_COMMUNITY_OPERATOR_ID: 'deploy-1'});

        const result = await runOperator({
            args,
            registry: {
                async ready() { calls.push({type: 'ready'}) },
                transitionLifecycleForTenant(tenantId, sourceInstanceId, toState, generation) {
                    calls.push({tenantId, sourceInstanceId, toState, generation});
                    return {lifecycleState: toState}
                }
            }
        });

        expect(result).toEqual({lifecycleState: 'ACTIVE'});
        expect(calls[1]).toEqual({
            tenantId        : 'tenant-a',
            sourceInstanceId: 'source-1',
            toState         : 'ACTIVE',
            generation      : {
                actorId      : 'deploy-1',
                expectedState: 'PROVISIONED',
                expectedEpoch: 2
            }
        });
    });

    test('audit is a co-located registry read, not an MCP admin operation', async () => {
        const audit = [
            {auditId: 'z-audit', action: 'REGISTERED'},
            {auditId: 'a-audit', action: 'PROVISIONED'}
        ];
        const result = await runOperator({
            args: {
                action          : 'audit',
                tenantId        : 'tenant-a',
                sourceInstanceId: 'source-1'
            },
            registry: {
                async ready() {},
                listAuditForTenant: () => audit
            }
        });

        expect(result).toBe(audit);
        expect(result.map(event => event.action)).toEqual(['REGISTERED', 'PROVISIONED'])
    });
});
