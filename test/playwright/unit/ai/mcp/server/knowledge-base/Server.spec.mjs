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

    /**
     * @summary Creates a Server instance whose async boot is suppressed and fully settled.
     *
     * `core.Base.construct()` schedules `initAsync()` on a Promise microtask, so a plain
     * `Neo.create()` returns BEFORE boot runs. `destroy()` then deletes every writable own
     * property — and `aiConfig` is a public instance field, so it goes with them. The queued
     * boot afterwards reaches `assertPlaneIdentity()` on a gutted instance and throws
     * `declared plane member booted without aiConfig`.
     *
     * That rejection is unowned and asynchronous, so it does not fail THIS spec — it surfaces
     * in whichever test happens to be running when it fires, which is why the symptom appeared
     * in an unrelated cross-server smoke test. Tests reading pure/synchronous methods must
     * therefore still let the lifecycle settle before destroying.
     *
     * Suppressing `boot` (rather than awaiting a real one) keeps these tests hermetic: the
     * methods under test are pure, so booting real Knowledge Base services would add durable
     * storage and network surface this spec does not exercise.
     *
     * Mirrors the established pattern in `memory-core/Server.spec.mjs`.
     * @returns {Promise<Object>} a settled instance, safe to `destroy()`
     */
    async function createServerWithoutBoot() {
        const originalBoot = Server.prototype.boot;

        Server.prototype.boot = async () => {};

        const serverInstance = Neo.create(Server);

        try {
            await serverInstance.ready();
        } finally {
            Server.prototype.boot = originalBoot;
        }

        return serverInstance;
    }

    test.beforeAll(async () => {
        Server = (await import('../../../../../../../ai/mcp/server/knowledge-base/Server.mjs')).default;
    });

    test('#15886: the plane-identity assertion names its ORIGIN server, not the shared class name', async () => {
        const serverInstance = await createServerWithoutBoot();

        // Reproduce the exact state the queued-boot race produced: an instance whose `aiConfig`
        // is gone. `destroy()` deletes it (a writable own property), which is what made the
        // original defect throw from a server nobody could identify.
        serverInstance.destroy();

        // `className` survives destruction, so the diagnostic still resolves here — the one
        // condition it has to work in.
        expect(() => serverInstance.assertPlaneIdentity())
            .toThrow(/\[Neo\.ai\.mcp\.server\.knowledge-base\.Server] declared plane member booted without aiConfig/);

        // The regression guard: `constructor.name` is `Server` for EVERY MCP server class, so a
        // bare `[Server]` prefix identifies nothing. This is what the message used to say.
        expect(() => serverInstance.assertPlaneIdentity()).not.toThrow(/\[Server]/);
    });

    test('#12752/#13464: health exemptions expose recovery tools but not retired database lifecycle tools', async () => {
        const serverInstance = await createServerWithoutBoot();

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
