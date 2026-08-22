import {test, expect}                                            from '../../fixtures.mjs';
import {NeuralLink_DataService}                                  from '../../../../ai/services.mjs';
import FleetRegistryService                                      from '../../../../ai/services/fleet/FleetRegistryService.mjs';
import {startFleetBridgeServer}                                  from '../../../../ai/services/fleet/fleetBridgeServer.mjs';
import {authenticatedFleetOptions, wireAuthenticatedFleetBridge} from './authenticatedFleetHarness.mjs';
import {listHarnessTypes}                                        from '../../../../apps/agentos/config/harnessTypes.mjs';
import fs                                                        from 'fs';
import os                                                        from 'os';
import path                                                      from 'path';

/**
 * @summary Verifies the agent-scoped Accounts configuration surface mounts end-to-end: the
 * selector strip derives from the roster store, the configuration card renders the scoped agent's
 * registry-derived configuration (harness chips, MCP-server rows, tri-state operational rows),
 * and the add-form's harness radios carry the shared registry's entries. The save + operable-cold
 * add journeys use the production App-Worker bridge, a real Brain registry/server, the Viewport's
 * accepted-definition composition handoff, and Neural Link inspection of the deliberately separate
 * AgentDefinitions + FleetRoster stores; this is behavioral evidence rather than a screenshot generator.
 *
 * @see apps/agentos/view/AccountsPanel.mjs
 * @see apps/agentos/view/fleet/detail/AgentConfigComponent.mjs
 */
test.describe('AgentOS Accounts — agent-scoped configuration surface', () => {
    test.setTimeout(120000);

    test('cold-loads, saves config, adds an emergent resident, and freshly rehydrates over the real Fleet wire', async ({page, neuralLink}) => {
        const
            priorDataDir    = FleetRegistryService.dataDir,
            tmpDir          = fs.mkdtempSync(path.join(os.tmpdir(), 'fleet-config-e2e-')),
            agentId         = 'config-proof-agent',
            createdAgentId  = 'cold-proof-agent',
            createdSecret   = 'ghp_e2e_add_must_stay_brain_side',
            duplicateSecret = 'ghp_e2e_duplicate_must_stay_brain_side';

        FleetRegistryService.dataDir = tmpDir;
        FleetRegistryService.defineAgent({
            id            : agentId,
            githubUsername: agentId,
            harnessType   : 'codex',
            credential    : 'ghp_e2e_must_stay_brain_side'
        });

        let server;

        try {
            const options = authenticatedFleetOptions();

            server = await startFleetBridgeServer(options);
            const fleetUrl = `http://127.0.0.1:${server.address().port}/fleet`;

            await page.goto(`/apps/agentos/index.html?${new URLSearchParams({fleetUrl})}`);

            await expect(page.locator('.agent-shell')).toBeVisible({timeout: 60000});

            // Boot installs the FAIL-CLOSED bridge; inject the bearer through the worker-realm
            // product injector BEFORE the Accounts pane mounts, so its cold-hydrate reads live.
            await wireAuthenticatedFleetBridge({app: await neuralLink.connectToApp('AgentOS'), fleetUrl, bearerToken: options.bearerToken});

            await page.locator('.agent-shell').getByText('Accounts', {exact: true}).click();
            await expect(page.locator('.agent-panel-accounts')).toBeVisible({timeout: 30000});

            // The pane constructed at shell boot, so its cold-hydrate raced the fail-closed bridge;
            // re-run the idempotent hydrate now that the injector flipped the bridge live.
            const appHandle  = await neuralLink.connectToApp('AgentOS');
            const [accounts] = await appHandle.queryComponent({className: 'AgentOS.view.AccountsPanel'}, ['id']);

            await appHandle.callMethod(accounts.properties.id, 'loadAgentDefinitions');

            // The provider store cold-hydrates from the REAL Brain registry; the bridge-pending seed
            // is gone before an existing agent can be edited.
            await expect(page.locator('.agent-selector-button').filter({hasText: agentId})).toHaveCount(1);

            await expect(page.locator('.fm-agent-config-card')).toBeVisible();
            expect(await page.locator('.fm-chip').count()).toBe(listHarnessTypes().length);
            await expect(page.locator('.fm-chip.is-selected')).toHaveCount(1);

            const memoryCore = page.locator('.fm-config-toggle').filter({hasText: 'Memory Core'});
            await expect(memoryCore).toHaveClass(/is-enabled/);
            // Docked keeper views may render beyond the browser viewport while remaining the live
            // mounted surface. Dispatch through the real DOM listener instead of weakening the
            // component path with a direct method call.
            await memoryCore.dispatchEvent('click');
            await expect(page.locator('.fm-config-save-status.is-accepted')).toContainText('Configuration saved');
            await expect(memoryCore).toHaveClass(/is-disabled/);

            expect(FleetRegistryService.getDefinition(agentId).mcpServers).toEqual({'memory-core': false});

            // Operable-cold journey: the UI request crosses the production wire once, while the
            // Body applies only the canonical redacted response. The accepted-definition owner
            // intent then makes FleetCockpit re-poll its separate Brain assembler.
            const
                usernameField   = page.getByRole('textbox', {name: 'GitHub username', exact: true}),
                credentialField = page.getByRole('textbox', {name: 'GitHub PAT', exact: true}),
                harnessField    = page.locator('.agent-harness-picker .neo-radiofield').filter({hasText: 'Antigravity'});

            await usernameField.fill(createdAgentId);
            await credentialField.fill(createdSecret);
            await harnessField.locator('label').click();
            await expect(harnessField.locator('input[type="radio"]')).toBeChecked();
            await page.getByRole('button', {name: 'Add agent', exact: true}).click();

            await expect(page.locator('.agent-bridge-status.is-live')).toContainText('Agent added');
            await expect(credentialField).toHaveValue('');
            await expect(page.locator('.agent-selector-button').filter({hasText: createdAgentId})).toHaveCount(1);

            const createdDefinition = FleetRegistryService.getDefinition(createdAgentId);

            expect(createdDefinition).toMatchObject({
                id            : createdAgentId,
                githubUsername: createdAgentId,
                harnessType   : 'antigravity'
            });
            expect(JSON.stringify(createdDefinition)).not.toContain(createdSecret);

            await page.getByRole('tab', {name: 'Fleet', exact: true}).click();

            const createdCard = page.locator('.fm-agent-card').filter({hasText: createdAgentId});

            await expect(createdCard).toHaveCount(1);
            await expect(createdCard).toBeVisible();

            // A registry-domain rejection travels as a controlled outcome: reason visible, no
            // second Body mutation/owner refresh, and the retry PAT is still cleared.
            await page.getByRole('tab', {name: 'Accounts', exact: true}).click();
            await credentialField.fill(duplicateSecret);
            await page.getByRole('button', {name: 'Add agent', exact: true}).click();
            await expect(page.locator('.agent-bridge-status.is-error')).toContainText('already exists');
            await expect(credentialField).toHaveValue('');
            expect(FleetRegistryService.listAgents().filter(agent => agent.id === createdAgentId)).toHaveLength(1);

            const
                app             = await neuralLink.connectToApp('AgentOS'),
                stores          = await NeuralLink_DataService.listStores({sessionId: app.sessionId}),
                definitionsMeta = stores.stores.find(candidate => candidate.model === 'AgentOS.model.AgentDefinition'),
                rosterMeta      = stores.stores.find(candidate => candidate.model === 'AgentOS.model.FleetAgent'),
                definitions     = await NeuralLink_DataService.inspectStore({
                    sessionId: app.sessionId,
                    storeId  : definitionsMeta.id,
                    limit    : 10
                }),
                roster          = await NeuralLink_DataService.inspectStore({
                    sessionId: app.sessionId,
                    storeId  : rosterMeta.id,
                    limit    : 10
                }),
                configRow       = definitions.items.find(item => item.id === agentId),
                definitionRow   = definitions.items.find(item => item.id === createdAgentId),
                rosterRow       = roster.items.find(item => item.agentId === createdAgentId),
                cards           = await app.queryComponent({className: 'AgentOS.view.fleet.roster.card.Container'}, ['record', 'id']),
                card            = cards.find(candidate => candidate.properties?.record?.agentId === createdAgentId);

            expect(configRow.mcpServers).toEqual({'memory-core': false});
            expect(definitionRow).toMatchObject({
                id            : createdAgentId,
                githubUsername: createdAgentId,
                harnessType   : 'antigravity'
            });
            expect(JSON.stringify(definitionRow)).not.toMatch(/credential|pat|ghp_e2e_add_must_stay_brain_side/i);
            expect(rosterRow.agentId).toBe(createdAgentId);
            expect(card.properties.record).toMatchObject({
                agentId  : createdAgentId,
                engineTag: null,
                family   : null
            });

            // A fresh page/store hydration must re-read the canonical sparse result, not the
            // request or the seed. This also proves persisted state survived the first app session.
            await page.reload();
            await expect(page.locator('.agent-shell')).toBeVisible({timeout: 60000});

            // a reload births a fresh App Worker: the in-memory bearer is gone BY CONSTRUCTION,
            // so the injector + idempotent hydrate run again against the new realm.
            const appReloaded = await neuralLink.connectToApp('AgentOS');

            await wireAuthenticatedFleetBridge({app: appReloaded, fleetUrl, bearerToken: options.bearerToken});

            await page.locator('.agent-shell').getByText('Accounts', {exact: true}).click();
            await expect(page.locator('.agent-panel-accounts')).toBeVisible({timeout: 30000});

            const [accountsReloaded] = await appReloaded.queryComponent({className: 'AgentOS.view.AccountsPanel'}, ['id']);

            await appReloaded.callMethod(accountsReloaded.properties.id, 'loadAgentDefinitions');
            await expect(page.locator('.agent-selector-button').filter({hasText: agentId})).toHaveCount(1);
            await expect(page.locator('.agent-selector-button').filter({hasText: createdAgentId})).toHaveCount(1);
            await expect(page.locator('.fm-config-toggle').filter({hasText: 'Memory Core'})).toHaveClass(/is-disabled/);

            expect(await page.locator('.agent-harness-picker .neo-radiofield').count()).toBe(listHarnessTypes().length)
        } finally {
            server && await new Promise(resolve => server.close(resolve));
            FleetRegistryService.dataDir = priorDataDir;
            fs.rmSync(tmpDir, {recursive: true, force: true})
        }
    });
});
