import {setup} from '../../../../../setup.mjs';

const appName = 'KnowledgeBaseServerTest';

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

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../../src/core/_export.mjs';
import '../../../../../../../src/manager/Instance.mjs';

test.describe('Neo.ai.mcp.server.knowledge-base.Server', () => {
    let Server;

    test.beforeAll(async () => {
        Server = (await import('../../../../../../../ai/mcp/server/knowledge-base/Server.mjs')).default;
    });

    test('#12752/#13464: health exemptions expose recovery tools but not retired database lifecycle tools', () => {
        const serverInstance = Neo.create(Server);

        try {
            const exemptTools = serverInstance.getHealthExemptTools();

            expect(exemptTools).toEqual(['healthcheck', 'get_ingestion_progress', 'list_agent_faqs', 'manage_knowledge_base']);
            expect(exemptTools).not.toContain('start_database');
            expect(exemptTools).not.toContain('stop_database');
        } finally {
            serverInstance.destroy();
        }
    });
});
