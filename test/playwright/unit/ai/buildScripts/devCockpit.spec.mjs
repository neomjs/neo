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

import http from 'node:http';

import {COCKPIT_OPEN_TARGET, FLEET_PROBE_METHOD, planCockpitBoot, probeFleetEndpoint} from '../../../../../buildScripts/devCockpit.mjs';
import {startFleetBridgeServer}                                                       from '../../../../../ai/services/fleet/fleetBridgeServer.mjs';
import {generateLocalBearerToken}                                                     from '../../../../../ai/mcp/server/shared/helpers/localBearer.mjs';

const authenticatedOptions = overrides => ({
    port         : 0,
    bearerToken  : generateLocalBearerToken(),
    viewerContext: {userId: 'cockpit-witness', username: 'Cockpit Witness', agentIdentityNodeId: '@cockpit-witness'},
    runInContext : (context, fn) => fn(),
    ...overrides
});

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
        // (a) the REAL authenticated transport: the unauthenticated probe hits the ingress guard's
        // fail-closed 401 envelope BEFORE any body parsing — that refusal IS the identity now
        const realFleet = await startFleetBridgeServer(authenticatedOptions());
        const realPort  = realFleet.address().port;

        const probe = await probeFleetEndpoint(realPort);
        expect(probe.status).toBe('fleet');
        expect(probe.detail).toContain('identity confirmed');

        await new Promise(resolve => realFleet.close(resolve));

        // (b) an HTTP-ish occupant that answers with a NON-fleet envelope must read incompatible —
        // a plain always-ok listener proves the probe checks the ENVELOPE (and the 401 fingerprint),
        // not just HTTP-ness. (A fleet server can no longer produce this shape: its guard 401s every
        // unauthenticated request before dispatch — which is exactly the point of the boundary.)
        let   answered = 0;
        const foreign  = http.createServer((req, res) => {
            answered++;
            res.writeHead(200, {'Content-Type': 'application/json'});
            res.end(JSON.stringify({ok: true}))
        });

        await new Promise(resolve => foreign.listen(0, '127.0.0.1', resolve));
        const foreignPort = foreign.address().port;

        const foreignProbe = await probeFleetEndpoint(foreignPort);
        expect(foreignProbe.status).toBe('incompatible');
        expect(answered).toBe(1);

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
                NEO_COCKPIT_WEBPACK_CMD: JSON.stringify([process.execPath, '-e', 'setInterval(() => {}, 1000)']),
                // The fixture transport proves the LAUNCH CONTRACT: it constructs the real
                // authenticated server from the NEO_FLEET_BEARER the launcher hands down via env —
                // startFleetBridgeServer REFUSES to construct without it, so 'fleet' reaching the
                // probe means the bearer hand-down happened. No graph needed (stub viewer).
                NEO_COCKPIT_FLEET_CMD: JSON.stringify([process.execPath, '--input-type=module', '-e',
                    // absolute specifiers (CWD-independent) + the Neo namespace bootstrap the fleet
                    // module chain requires at load — the same entry-point invariant devFleetServer keeps.
                    // The fixture consumes BOTH env halves of the launch contract exactly like
                    // devFleetServer: the bearer and the handshake arm flag.
                    `const root = ${JSON.stringify(repoRoot)}; await import(root + '/src/Neo.mjs'); await import(root + '/src/core/_export.mjs'); await import(root + '/src/manager/Instance.mjs'); const {startFleetBridgeServer} = await import(root + '/ai/services/fleet/fleetBridgeServer.mjs'); const server = await startFleetBridgeServer({port: 8083, bearerToken: process.env.NEO_FLEET_BEARER, bearerHandshake: process.env.NEO_FLEET_BEARER_HANDSHAKE === '1', viewerContext: {userId: 'cockpit-fixture', username: 'Cockpit Fixture', agentIdentityNodeId: '@cockpit-fixture'}, runInContext: (context, fn) => fn()}); ['SIGTERM', 'SIGINT'].forEach(signal => process.on(signal, () => server.close(() => process.exit(0))))`
                ])
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

            expect(output).toContain('starting fleet transport on :8083');

            // The one-command hand-off, witnessed end-to-end through the REAL launcher: the
            // launcher armed the child (NEO_FLEET_BEARER_HANDSHAKE), so a browser-Origin redemption
            // returns a canonical bearer — and the redeemed value is proven by USE: the
            // constant-time bearer gate on /fleet/probe admits it. Redeem → use, no agent seam.
            const redemption = await fetch('http://127.0.0.1:8083/fleet/handshake', {headers: {Origin: 'http://localhost:8080'}}),
                  {result}   = await redemption.json();

            expect(redemption.status).toBe(200);
            expect(result.bearerToken).toMatch(/^[A-Za-z0-9_-]{43}$/);

            const probeWithRedeemed = await fetch('http://127.0.0.1:8083/fleet/probe', {headers: {Authorization: `Bearer ${result.bearerToken}`}});

            expect(probeWithRedeemed.status).toBe(200);
            expect((await probeWithRedeemed.json()).result.agentIdentityNodeId).toBe('@cockpit-fixture')
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
