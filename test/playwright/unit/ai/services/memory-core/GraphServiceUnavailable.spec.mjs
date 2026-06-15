import {setup} from '../../../../setup.mjs';

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name             : 'GraphServiceUnavailableTest',
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect}        from '@playwright/test';
import Neo                   from '../../../../../../src/Neo.mjs';
import * as core             from '../../../../../../src/core/_export.mjs';
import RequestContextService from '../../../../../../ai/mcp/server/shared/services/RequestContextService.mjs';

test.describe('Memory Core graph unavailable guard', () => {
    let GraphService, MailboxService, PermissionService, WakeSubscriptionService;
    let originalDb, originalGraphInitError;

    test.beforeAll(async () => {
        GraphService            = (await import('../../../../../../ai/services/memory-core/GraphService.mjs')).default;
        MailboxService          = (await import('../../../../../../ai/services/memory-core/MailboxService.mjs')).default;
        PermissionService       = (await import('../../../../../../ai/services/memory-core/PermissionService.mjs')).default;
        WakeSubscriptionService = (await import('../../../../../../ai/services/memory-core/WakeSubscriptionService.mjs')).default;
    });

    test.beforeEach(() => {
        originalDb             = GraphService.db;
        originalGraphInitError = GraphService.graphInitError;

        GraphService.db             = null;
        GraphService.graphInitError = {message: 'unit graph mount failed'};
    });

    test.afterEach(() => {
        GraphService.db             = originalDb;
        GraphService.graphInitError = originalGraphInitError;
    });

    test('throws a canonical degraded error for graph-backed mailbox tools', async () => {
        await RequestContextService.run({agentIdentityNodeId: '@neo-gpt'}, async () => {
            await expect(MailboxService.listMessages())
                .rejects.toThrow('[MailboxService.listMessages] GraphService unavailable: unit graph mount failed');

            await expect(MailboxService.addMessage({
                to     : '@neo-opus-ada',
                subject: 'db null guard',
                body   : 'should fail before graph dereference'
            })).rejects.toThrow('[MailboxService.addMessage] GraphService unavailable: unit graph mount failed');
        });
    });

    test('throws a canonical degraded error for permission and wake-subscription tools', async () => {
        await RequestContextService.run({agentIdentityNodeId: '@neo-gpt'}, async () => {
            await expect(PermissionService.listPermissions())
                .rejects.toThrow('[PermissionService.listPermissions] GraphService unavailable: unit graph mount failed');

            expect(() => PermissionService.hasPermission('@neo-gpt', '@neo-opus-ada', 'CAN_REPLY_TO'))
                .toThrow('[PermissionService.hasPermission] GraphService unavailable: unit graph mount failed');

            await expect(WakeSubscriptionService.manage({action: 'list'}))
                .rejects.toThrow('[WakeSubscriptionService.manage] GraphService unavailable: unit graph mount failed');
        });
    });

    test('keeps maintenance count paths fail-soft when graph storage is absent', async () => {
        await RequestContextService.run({agentIdentityNodeId: '@neo-gpt'}, async () => {
            await expect(MailboxService.countMessages()).resolves.toEqual({count: 0});
        });

        await expect(MailboxService.sweepExpiredTasks()).resolves.toEqual({
            success   : true,
            sweptCount: 0
        });
    });
});
