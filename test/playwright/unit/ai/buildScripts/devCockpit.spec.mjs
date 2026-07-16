import {test, expect}  from '@playwright/test';
import {spawn}         from 'node:child_process';
import {createServer}  from 'node:net';
import path            from 'node:path';
import {fileURLToPath} from 'node:url';

// Neo namespace bootstrap (entry-point invariant): the fleet transport's module chain reaches the
// fleet singletons' `Neo.setupClass` at load — mirror devFleetServer's bootstrap order.
import Neo             from '../../../../../src/Neo.mjs';
import * as core       from '../../../../../src/core/_export.mjs';
import InstanceManager from '../../../../../src/manager/Instance.mjs';

import {COCKPIT_OPEN_TARGET, FLEET_PROBE_METHOD, planCockpitBoot, probeFleetEndpoint} from '../../../../../buildScripts/devCockpit.mjs';
import {startFleetBridgeServer}                                                       from '../../../../../ai/services/fleet/fleetBridgeServer.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');

/**
 * The boot-plan witnesses for the one-command cockpit launcher: the pure decision seam
 * (refuse-on-authority-violation, refuse-on-incompatible-occupant, reuse-on-fleet-identity,
 * spawn-on-free) and the identity probe run against the REAL fleet transport, a bare TCP
 * listener, and a closed port — a listener is never presumed to be a fleet server.
 */
test.describe('buildScripts/devCockpit — the live-by-default boot plan', () => {

    test('a non-default fleet port REFUSES with the named endpoint-authority reason', () => {
        const plan = planCockpitBoot({fleetPort: 9999});

        expect(plan.refuse).toBe(true);
        expect(plan.spawnFleet).toBe(false);
        expect(plan.spawnWebpack).toBe(false);
        expect(plan.notes[0]).toContain('REFUSED');
        expect(plan.notes[0]).toContain('installFleetBridge');
        expect(plan.notes[0]).toContain(':8083');
        expect(plan.notes[1]).toContain('follow-up')
    });

    test('an incompatible occupant REFUSES with the named occupant detail — never a false reuse', () => {
        const plan = planCockpitBoot({fleetPort: 8083, endpointStatus: 'incompatible', endpointDetail: 'listener answered non-JSON — not a fleet server'});

        expect(plan.refuse).toBe(true);
        expect(plan.spawnFleet).toBe(false);
        expect(plan.notes[0]).toContain('REFUSED');
        expect(plan.notes[0]).toContain('NOT a fleet server');
        expect(plan.notes[0]).toContain('non-JSON')
    });

    test('a confirmed fleet occupant → REUSE, never a second server', () => {
        const plan = planCockpitBoot({fleetPort: 8083, endpointStatus: 'fleet', endpointDetail: 'wire-protocol identity confirmed'});

        expect(plan.refuse).toBe(false);
        expect(plan.spawnFleet).toBe(false);
        expect(plan.spawnWebpack).toBe(true);
        expect(plan.notes[0]).toContain('reusing');
        expect(plan.notes[0]).toContain('not spawning a second server')
    });

    test('a free endpoint → spawn the transport', () => {
        const plan = planCockpitBoot({fleetPort: 8083, endpointStatus: 'free'});

        expect(plan.refuse).toBe(false);
        expect(plan.spawnFleet).toBe(true);
        expect(plan.spawnWebpack).toBe(true);
        expect(plan.notes[0]).toContain('starting fleet transport')
    });

    test('probeFleetEndpoint: a REAL fleet server confirms identity; a bare listener is incompatible; a closed port is free', async () => {
        // (a) the REAL transport with the REAL dispatch chain (the wire allowlist): the probe
        // method is not on the allowlist, so the deterministic rejection envelope IS the identity
        const realFleet = await startFleetBridgeServer({port: 0});
        const realPort  = realFleet.address().port;

        const probe = await probeFleetEndpoint(realPort);
        expect(probe.status).toBe('fleet');
        expect(probe.detail).toContain('identity confirmed');

        await new Promise(resolve => realFleet.close(resolve));

        // (b) an HTTP-ish occupant that answers with a NON-fleet envelope must read incompatible —
        // an injected always-ok dispatch proves the probe checks the ENVELOPE, not just HTTP-ness
        let   dispatched = 0;
        const foreign    = await startFleetBridgeServer({
            port    : 0,
            dispatch: async () => { dispatched++; return {ok: true}; }
        });
        const foreignPort = foreign.address().port;

        const foreignProbe = await probeFleetEndpoint(foreignPort);
        expect(foreignProbe.status).toBe('incompatible');
        expect(dispatched).toBe(1);

        await new Promise(resolve => foreign.close(resolve));

        // (c) a bare TCP listener that never speaks HTTP → incompatible (accepted, never answered).
        // Track its accepted sockets: the probe's client-side destroy can leave the server-side
        // socket lingering, and net.Server.close() waits on it — destroy them before closing.
        const bare        = createServer(),
              bareSockets = [];

        bare.on('connection', socket => bareSockets.push(socket));
        await new Promise(resolve => bare.listen(0, '127.0.0.1', resolve));
        const barePort = bare.address().port;

        const bareProbe = await probeFleetEndpoint(barePort, 600);
        expect(bareProbe.status).toBe('incompatible');

        bareSockets.forEach(socket => socket.destroy());
        await new Promise(resolve => bare.close(resolve));

        // (d) the now-closed port → free
        expect((await probeFleetEndpoint(realPort)).status).toBe('free')
    });

    test('composed boot: the launcher brings the fleet transport up, supervises, and tears down on SIGTERM', async () => {
        test.setTimeout(60000);

        // pre-condition: the default endpoint must be free on this machine, else this witness
        // cannot own the lifecycle it asserts — skip honestly rather than reuse-or-fight
        if ((await probeFleetEndpoint(8083)).status !== 'free') {
            test.skip(true, 'the default fleet endpoint is occupied on this machine — the composed-boot witness needs to own it');
            return
        }

        // the webpack child is stubbed via the injectable command seam — the composed-boot witness
        // targets the SUPERVISION + fleet identity, not a webpack build (its own suite territory)
        const launcher = spawn(process.execPath, [path.join(repoRoot, 'buildScripts/devCockpit.mjs')], {
            cwd: repoRoot,
            env: {
                ...process.env,
                NEO_COCKPIT_WEBPACK_CMD: JSON.stringify([process.execPath, '-e', 'setInterval(() => {}, 1000)'])
            },
            stdio: ['ignore', 'pipe', 'pipe']
        });

        let output = '';
        launcher.stdout.on('data', chunk => output += chunk);
        launcher.stderr.on('data', chunk => output += chunk);

        try {
            // the fresh-boot assertion: the REAL fleet transport reaches protocol identity on the
            // default endpoint with zero manual server starts
            await expect.poll(async () => (await probeFleetEndpoint(8083)).status, {timeout: 30000}).toBe('fleet');

            expect(output).toContain('starting fleet transport on :8083')
        } finally {
            // supervision teardown: one SIGTERM to the launcher ends the whole session
            const exited = new Promise(resolve => launcher.on('exit', resolve));
            launcher.kill('SIGTERM');
            await exited;
        }

        await expect.poll(async () => (await probeFleetEndpoint(8083)).status, {timeout: 10000}).toBe('free')
    });

    test('the composed command opens the COCKPIT surface, not the dev-server root', () => {
        expect(COCKPIT_OPEN_TARGET).toBe('apps/agentos/index.html');
        expect(FLEET_PROBE_METHOD).toContain('probe')
    })
});
