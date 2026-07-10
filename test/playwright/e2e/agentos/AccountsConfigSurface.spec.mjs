import {test, expect} from '../../fixtures.mjs';
import {NeuralLink_DataService} from '../../../../ai/services.mjs';
import FleetRegistryService from '../../../../ai/services/fleet/FleetRegistryService.mjs';
import {startFleetBridgeServer} from '../../../../ai/services/fleet/fleetBridgeServer.mjs';
import fs   from 'fs';
import os   from 'os';
import path from 'path';

/**
 * @summary Verifies the agent-scoped Accounts configuration surface mounts end-to-end: the
 * selector strip derives from the roster store, the configuration card renders the scoped agent's
 * registry-derived configuration (harness chips, MCP-server rows, tri-state operational rows),
 * and the add-form's harness radios carry the shared registry's entries. The save journey uses the
 * production App-Worker bridge, a real Brain registry/server, and Neural Link store inspection;
 * it is behavioral evidence rather than a screenshot generator.
 *
 * @see apps/agentos/view/Accounts.mjs
 * @see apps/agentos/view/AgentConfigCard.mjs
 */
test.describe('AgentOS Accounts — agent-scoped configuration surface', () => {
    test.setTimeout(120000);

    test('cold-loads, saves, and freshly rehydrates sparse config over the real Fleet wire + NL store', async ({page, neuralLink}) => {
        const
            priorDataDir = FleetRegistryService.dataDir,
            tmpDir       = fs.mkdtempSync(path.join(os.tmpdir(), 'fleet-config-e2e-')),
            agentId      = 'config-proof-agent';

        FleetRegistryService.dataDir = tmpDir;
        FleetRegistryService.defineAgent({
            id            : agentId,
            githubUsername: agentId,
            harnessType   : 'codex',
            credential    : 'ghp_e2e_must_stay_brain_side'
        });

        let server;

        try {
            // Fixed product port by design. EADDRINUSE is a hard red: never reuse a foreign server
            // and accidentally test another checkout's tree.
            server = await startFleetBridgeServer({port: 8083});
            await page.goto('/apps/agentos/index.html');

            await expect(page.locator('.agent-shell')).toBeVisible({timeout: 60000});

            await page.locator('.agent-shell').getByText('Accounts', {exact: true}).click();
            await expect(page.locator('.agent-panel-accounts')).toBeVisible({timeout: 30000});

            // The provider store cold-hydrates from the REAL Brain registry; the bridge-pending seed
            // is gone before an existing agent can be edited.
            await expect(page.locator('.agent-selector-button').filter({hasText: agentId})).toHaveCount(1);

            await expect(page.locator('.agent-config-card')).toBeVisible();
            expect(await page.locator('.agent-config-chip').count()).toBe(5);
            await expect(page.locator('.agent-config-chip.is-selected')).toHaveCount(1);

            const memoryCore = page.locator('.agent-config-toggle').filter({hasText: 'Memory Core'});
            await expect(memoryCore).toHaveClass(/is-enabled/);
            // Docked keeper views may render beyond the browser viewport while remaining the live
            // mounted surface. Dispatch through the real DOM listener instead of weakening the
            // component path with a direct method call.
            await memoryCore.dispatchEvent('click');
            await expect(page.locator('.agent-config-save-status.is-accepted')).toContainText('Configuration saved');
            await expect(memoryCore).toHaveClass(/is-disabled/);

            expect(FleetRegistryService.getDefinition(agentId).mcpServers).toEqual({'memory-core': false});

            const app       = await neuralLink.connectToApp('AgentOS'),
                  stores    = await NeuralLink_DataService.listStores({sessionId: app.sessionId}),
                  storeMeta = stores.stores.find(candidate => candidate.model === 'AgentOS.model.AgentDefinition'),
                  snapshot  = await NeuralLink_DataService.inspectStore({
                      sessionId: app.sessionId,
                      storeId  : storeMeta.id,
                      limit    : 10
                  }),
                  row       = snapshot.items.find(item => item.id === agentId);

            expect(row.mcpServers).toEqual({'memory-core': false});
            expect(JSON.stringify(row)).not.toMatch(/credential|pat|token|ghp_e2e_must_stay_brain_side/i);

            // A fresh page/store hydration must re-read the canonical sparse result, not the
            // request or the seed. This also proves persisted state survived the first app session.
            await page.reload();
            await page.locator('.agent-shell').getByText('Accounts', {exact: true}).click();
            await expect(page.locator('.agent-selector-button').filter({hasText: agentId})).toHaveCount(1);
            await expect(page.locator('.agent-config-toggle').filter({hasText: 'Memory Core'})).toHaveClass(/is-disabled/);

            expect(await page.locator('.agent-harness-picker .neo-radiofield').count()).toBe(5)
        } finally {
            server && await new Promise(resolve => server.close(resolve));
            FleetRegistryService.dataDir = priorDataDir;
            fs.rmSync(tmpDir, {recursive: true, force: true})
        }
    });
});
