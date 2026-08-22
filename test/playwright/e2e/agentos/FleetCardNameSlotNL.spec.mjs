import {test, expect}                                                          from '../../fixtures.mjs';
import FleetRegistryService                                                    from '../../../../ai/services/fleet/FleetRegistryService.mjs';
import {startFleetBridgeServer}                                                from '../../../../ai/services/fleet/fleetBridgeServer.mjs';
import {authenticatedFleetOptions, reloadRoster, wireAuthenticatedFleetBridge} from './authenticatedFleetHarness.mjs';
import fs                                                                      from 'fs';
import os                                                                      from 'os';
import path                                                                    from 'path';

/**
 * Whitebox-e2e for the card name slot on LIVE roster data: a real Brain registry seeds one
 * resident over the production App-Worker wire, the cockpit's authoritative roster replaces the
 * sample seed, and the rendered card proves the name-slot contract end to end — the Brain-folded
 * display name renders as the drill target, and the provenance chip states honestly how that name
 * is grounded (`declared` — registry display state, naming-layer trail not yet wired), with the
 * long copy reachable on title/aria. Engine truth (record fields) and DOM truth are asserted
 * together, Neural-Link-verified.
 */
test.describe('AgentOS Fleet card — name slot on live roster data (Neural Link)', () => {
    test.setTimeout(120000);

    test('a live-registry resident renders the folded name + an honest provenance chip', async ({page, neuralLink}) => {
        const
            priorDataDir = FleetRegistryService.dataDir,
            tmpDir       = fs.mkdtempSync(path.join(os.tmpdir(), 'fleet-name-slot-e2e-')),
            agentId      = 'name-slot-proof-agent';

        FleetRegistryService.dataDir = tmpDir;
        FleetRegistryService.defineAgent({
            githubUsername: agentId,
            harnessType   : 'codex'
        });

        const options  = authenticatedFleetOptions(),
              server   = await startFleetBridgeServer(options),
              fleetUrl = `http://127.0.0.1:${server.address().port}/fleet`;

        try {
            await page.goto(`/apps/agentos/index.html?${new URLSearchParams({fleetUrl})}`);
            await expect(page.locator('.agent-shell')).toBeVisible({timeout: 60000});

            // Boot installs the FAIL-CLOSED bridge; the bearer arrives through the worker-realm
            // product injector, then the sanctioned re-poll reads the roster against the live wire.
            const app = await neuralLink.connectToApp('AgentOS');

            await wireAuthenticatedFleetBridge({app, fleetUrl, bearerToken: options.bearerToken});
            await reloadRoster(app);

            // the authoritative roster replaces the sample seed: exactly the seeded resident renders
            const card = page.locator('.fm-agent-card');

            await expect(card).toHaveCount(1, {timeout: 30000});

            // DOM truth: the Brain-folded name (displayName -> name -> githubUsername -> id, folded
            // Brain-side) is the drill target; the chip states the honest provenance register
            await expect(card.locator('.fm-card-name .neo-button-text')).toHaveText(agentId);
            await expect(card.locator('.fm-name-provenance')).toHaveText('◇');
            await expect(card.locator('.fm-name-provenance')).toHaveAttribute('title', /declared display state/);
            await expect(card.locator('.fm-name-provenance')).toHaveAttribute('aria-label', /declared display state/);

            // engine truth through the Neural Link: the record carries the durable id and the
            // folded display name — the same durable resident the DOM renders
            const
                cards = await app.queryComponent({className: 'AgentOS.view.fleet.roster.card.Container'}, ['record']),
                row   = (Array.isArray(cards) ? cards : [cards]).find(candidate => candidate?.properties?.record?.agentId === agentId);

            expect(row, 'the seeded resident reached the rendered card through the live wire').toBeTruthy();
            expect(row.properties.record.displayName).toBe(agentId)
        } finally {
            server && await new Promise(resolve => server.close(resolve));
            FleetRegistryService.dataDir = priorDataDir;
            fs.rmSync(tmpDir, {force: true, recursive: true})
        }
    })
});
