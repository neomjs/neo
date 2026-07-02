import {setup} from '../../../../setup.mjs';

const appName = 'FleetTransportIntegrationTest';

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

import {test, expect}           from '@playwright/test';
import Neo                      from '../../../../../../src/Neo.mjs';
import * as core                from '../../../../../../src/core/_export.mjs';
import FleetRegistryService     from '../../../../../../ai/services/fleet/FleetRegistryService.mjs';
import {startFleetBridgeServer} from '../../../../../../ai/services/fleet/fleetBridgeServer.mjs';
import {installFleetBridge}     from '../../../../../../src/ai/fleet/installFleetBridge.mjs';
import fs                       from 'fs';
import os                       from 'os';
import path                     from 'path';

// Full-chain integration (NO stubs): the browser wiring (installFleetBridge + real fetch) → the real
// HTTP server → the real dispatch → the real FleetControlBridge → the real FleetRegistryService, against
// a temp data dir. Where the stub unit specs prove each link in isolation, this proves the composition +
// the load-bearing PAT boundary end-to-end — the regression guard for "a serialization / toPublic change
// silently leaks the PAT across the wire".

test.describe('fleet transport — full-chain integration (real server + real registry + real wiring)', () => {
    // Stateful + order-dependent (test 1 defines the agent; the rest read it) against a shared real
    // server + registry — force serial so fullyParallel can't split the reads onto a worker that never
    // ran the define.
    test.describe.configure({mode: 'serial'});

    let server, tmpDir, priorDataDir, registryBridge;

    test.beforeAll(async () => {
        tmpDir       = fs.mkdtempSync(path.join(os.tmpdir(), 'fleet-integration-'));
        priorDataDir = FleetRegistryService.dataDir;
        FleetRegistryService.dataDir = tmpDir;

        server = await startFleetBridgeServer({port: 0});
        const url = `http://127.0.0.1:${server.address().port}/fleet`;

        // exactly the App-Worker startup path, with the real global fetch
        const target = {};
        installFleetBridge({url, target});
        registryBridge = target.AgentOS.fleet.registryBridge
    });

    test.afterAll(async () => {
        await new Promise(resolve => server.close(resolve));
        FleetRegistryService.dataDir = priorDataDir;
        fs.rmSync(tmpDir, {recursive: true, force: true})
    });

    test('defineAgent (with a PAT) round-trips to a public definition — the PAT never returns', async () => {
        const result = await registryBridge.defineAgent({
            githubUsername: 'integration-alice',
            harnessType   : 'codex',
            credential    : 'ghp_SECRET_integration'
        });

        expect(result.githubUsername).toBe('integration-alice');
        expect(result.credential).toBeUndefined();
        expect(result.pat).toBeUndefined()
    });

    test('listAgents shows the agent, PAT-free', async () => {
        const list = await registryBridge.listAgents();
        const row  = list.find(a => a.id === 'integration-alice');

        expect(row).toBeTruthy();
        expect(row.credential).toBeUndefined();
        expect(list.every(a => a.credential === undefined)).toBe(true)
    });

    test('the PAT is encrypted on disk — no plaintext in the credential store', () => {
        const credFile = path.join(tmpDir, 'credentials.enc');
        expect(fs.existsSync(credFile)).toBe(true);
        expect(fs.readFileSync(credFile, 'utf8')).not.toContain('ghp_SECRET_integration')
    });

    test('the registry is persisted (no secrets) and reload-safe', () => {
        const regFile = path.join(tmpDir, 'registry.json');
        expect(fs.existsSync(regFile)).toBe(true);
        const raw = fs.readFileSync(regFile, 'utf8');
        expect(raw).toContain('integration-alice');
        expect(raw).not.toContain('ghp_SECRET_integration')
    });

    test('an off-allowlist method is rejected by the real server, never reaching a resolver seam', async () => {
        const url = `http://127.0.0.1:${server.address().port}/fleet`;
        const res = await fetch(url, {
            method : 'POST',
            headers: {'Content-Type': 'application/json'},
            body   : JSON.stringify({method: 'getManager', params: 'x'})
        });
        const envelope = await res.json();

        expect(envelope.ok).toBe(false);
        expect(envelope.error).toContain('not on the control surface')
    });
});
