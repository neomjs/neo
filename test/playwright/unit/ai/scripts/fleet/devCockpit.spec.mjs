import {test, expect}  from '@playwright/test';
import {spawn}         from 'node:child_process';
import fs              from 'node:fs';
import {createServer}  from 'node:net';
import os              from 'node:os';
import path            from 'node:path';
import {fileURLToPath} from 'node:url';

// Neo namespace bootstrap (entry-point invariant): the fleet transport's module chain reaches the
// fleet singletons' `Neo.setupClass` at load — mirror devFleetServer's bootstrap order.
import Neo             from '../../../../../../src/Neo.mjs';
import * as core       from '../../../../../../src/core/_export.mjs';
import InstanceManager from '../../../../../../src/manager/Instance.mjs';

import http from 'node:http';

import {COCKPIT_OPEN_TARGET, FLEET_PROBE_METHOD, buildFleetChildEnv, planCockpitBoot, probeFleetEndpoint, probePlaneIdentity, resolveLivePlaneConfig} from '../../../../../../ai/scripts/fleet/devCockpit.mjs';
import {startFleetBridgeServer}                                                                                                                       from '../../../../../../ai/services/fleet/fleetBridgeServer.mjs';
import {generateLocalBearerToken}                                                                                                                     from '../../../../../../ai/mcp/server/shared/helpers/localBearer.mjs';

const authenticatedOptions = overrides => ({
    port         : 0,
    bearerToken  : generateLocalBearerToken(),
    viewerContext: {userId: 'cockpit-witness', username: 'Cockpit Witness', agentIdentityNodeId: '@cockpit-witness'},
    runInContext : (context, fn) => fn(),
    ...overrides
});

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../../..');

/**
 * The boot-plan witnesses for the one-command cockpit launcher: the pure decision seam
 * (refuse-on-authority-violation, refuse-on-incompatible-occupant, reuse-on-fleet-identity,
 * spawn-on-free) and the identity probe run against the REAL fleet transport, a bare TCP
 * listener, and a closed port — a listener is never presumed to be a fleet server.
 */
test.describe('ai/scripts/fleet/devCockpit — the live-by-default boot plan', () => {
    // Two witnesses below OWN the real :8083 endpoint (the composed boot and the reuse
    // falsifier). Parallel workers would race them onto the same port — and under the
    // authenticated-reuse contract the loser correctly REFUSES, failing the wrong test.
    test.describe.configure({mode: 'serial'});

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

    test('a fleet occupant WITH the authenticated proof → REUSE, never a second server', () => {
        const plan = planCockpitBoot({
            fleetPort     : 8083,
            endpointStatus: 'fleet',
            endpointDetail: 'wire-protocol identity confirmed',
            reuseProof    : {reusable: true, reason: 'same token, same viewer', viewer: '@cockpit-witness', pid: 4242}
        });

        expect(plan.refuse).toBe(false);
        expect(plan.spawnFleet).toBe(false);
        expect(plan.spawnWebpack).toBe(true);
        expect(plan.notes[0]).toContain('VERIFIED same token, same viewer');
        expect(plan.notes[0]).toContain('@cockpit-witness');
        expect(plan.notes[0]).toContain('not spawning a second server')
    });

    test('a fleet occupant WITHOUT the authenticated proof → REFUSED; protocol identity is never adoption authority', () => {
        // The composition this closes: the page a reuse-plan opens can REDEEM the incumbent's
        // bearer, so an unauthenticated 401-signature match must not select the page's credential
        // authority. No proof, failed proof, and wrong-viewer proof all refuse with the remediation.
        for (const reuseProof of [
            null,
            {reusable: false, reason: 'no NEO_FLEET_BEARER pin in this environment — the launcher holds no credential to authenticate the incumbent with'},
            {reusable: false, reason: "the existing Fleet is bound to viewer '@viewer-a' but this launch resolved '@viewer-b' — wrong-viewer process; refusing silent reuse"}
        ]) {
            const plan = planCockpitBoot({fleetPort: 8083, endpointStatus: 'fleet', reuseProof});

            expect(plan.refuse, JSON.stringify(reuseProof)).toBe(true);
            expect(plan.spawnFleet, JSON.stringify(reuseProof)).toBe(false);
            expect(plan.spawnWebpack, 'no credential-redeeming page may open').toBe(false);
            expect(plan.notes[0]).toContain('cannot verify');
            expect(plan.notes[1]).toContain('credential authority');
            reuseProof?.reason && expect(plan.notes[0]).toContain(reuseProof.reason)
        }
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
        const launcher = spawn(process.execPath, [path.join(repoRoot, 'ai/scripts/fleet/devCockpit.mjs')], {
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

    test('⭐ real-ingress reuse falsifier: an armed incumbent bound to viewer/token A is NEVER adopted by launcher B — and the same-token+same-viewer control IS', async () => {
        test.setTimeout(60000);

        if ((await probeFleetEndpoint(8083)).status !== 'free') {
            test.skip(true, 'the default fleet endpoint is occupied on this machine — the reuse falsifier needs to own it');
            return
        }

        // The ARMED incumbent: viewer A, token A, handshake armed — the exact process whose bearer
        // a wrongly-adopting launcher's page could redeem.
        const tokenA    = generateLocalBearerToken(),
              tokenB    = generateLocalBearerToken(),
              incumbent = await startFleetBridgeServer(authenticatedOptions({
                  port           : 8083,
                  bearerToken    : tokenA,
                  bearerHandshake: true
              }));

        const launchCockpit = env => new Promise(resolve => {
            const child = spawn(process.execPath, [path.join(repoRoot, 'ai/scripts/fleet/devCockpit.mjs')], {
                cwd: repoRoot,
                env: {
                    ...process.env,
                    // the webpack stub prints a marker so "no page opened" is directly observable
                    NEO_COCKPIT_WEBPACK_CMD: JSON.stringify([process.execPath, '-e', 'console.log("WEBPACK_STUB_STARTED"); setInterval(() => {}, 1000)']),
                    ...env
                },
                stdio: ['ignore', 'pipe', 'pipe']
            });

            let output = '';

            child.stdout.on('data', chunk => output += chunk);
            child.stderr.on('data', chunk => output += chunk);
            child.on('exit', code => resolve({code, output, child}));

            // the positive control never exits on its own — give it time to prove the reuse plan,
            // then tear it down; the refusal path exits(1) well inside this window.
            // wall-clock-under-test: the still-running child inside this window IS the reuse-plan
            // proof; the kill only tears down a passing child
            setTimeout(() => {
                if (child.exitCode === null) {
                    child.kill('SIGTERM')
                }
            }, 8000)
        });

        try {
            // Falsifier: launcher B (different token, different identity claim) must refuse before
            // any page exists — no webpack stub, exit 1, remediation named.
            const refused = await launchCockpit({NEO_FLEET_BEARER: tokenB, NEO_AGENT_IDENTITY: '@viewer-b'});

            expect(refused.code).toBe(1);
            expect(refused.output).toContain('REFUSED');
            expect(refused.output).toContain('cannot verify');
            expect(refused.output).not.toContain('WEBPACK_STUB_STARTED');

            // Positive control: same token + same viewer proves reuse through the authenticated
            // probe, and only THEN does the page open.
            const reused = await launchCockpit({NEO_FLEET_BEARER: tokenA, NEO_AGENT_IDENTITY: '@cockpit-witness'});

            expect(reused.output).toContain('VERIFIED same token, same viewer');
            expect(reused.output).toContain('WEBPACK_STUB_STARTED')
        } finally {
            await new Promise(resolve => incumbent.close(resolve))
        }
    });

    test('the composed command opens the COCKPIT surface, not the dev-server root', () => {
        expect(COCKPIT_OPEN_TARGET).toBe('apps/agentos/index.html');
        expect(FLEET_PROBE_METHOD).toContain('probe')
    })
});

/**
 * The live-journey witnesses (`--live`, the `cockpit:live` script): the plane-binding resolution
 * seam (env > file > gh precedence, fail-closed refusals, secret values never in the notes), the
 * unauthenticated plane-identity probe (the auth guard's 401 IS the signature), the child-env
 * custody rule (the fleet child alone carries the materialized bearer), and three composed runs
 * through the REAL launcher — the full live boot against a fixture plane, the unreachable-plane
 * fail-fast, and the never-adopt-an-incumbent refusal.
 */
test.describe('ai/scripts/fleet/devCockpit — the live-plane journey (cockpit:live)', () => {
    // The composed witnesses below own :8083 in turn (serial, same discipline as the boot-plan suite).
    test.describe.configure({mode: 'serial'});

    test('resolveLivePlaneConfig: env pin wins and the gh seam is never consulted', async () => {
        const resolved = await resolveLivePlaneConfig({
            env        : {NEO_FLEET_PLANE_BASE: 'http://127.0.0.1:4000', NEO_FLEET_PLANE_BEARER: 'env-token'},
            readGhToken: async () => { throw new Error('the gh seam must not run when the env pins the bearer') }
        });

        expect(resolved.refuse).toBe(false);
        expect(resolved.planeBase).toBe('http://127.0.0.1:4000');
        expect(resolved.planeBearer).toBe('env-token');
        expect(resolved.bearerSource).toBe('env');
        expect(resolved.notes[0]).toContain('pinned via NEO_FLEET_PLANE_BASE')
    });

    test('resolveLivePlaneConfig: the secret-file half materializes and never consults gh', async () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cockpit-live-'));

        fs.writeFileSync(path.join(dir, 'token'), '  file-token-42\n');

        const resolved = await resolveLivePlaneConfig({
            env        : {NEO_FLEET_PLANE_BEARER_FILE: path.join(dir, 'token')},
            readGhToken: async () => { throw new Error('the gh seam must not run when the file pins the bearer') }
        });

        expect(resolved.refuse).toBe(false);
        expect(resolved.planeBearer).toBe('file-token-42');
        expect(resolved.bearerSource).toBe('file');
        expect(resolved.planeBase).toBe('http://127.0.0.1:3102');
        expect(resolved.notes[0]).toContain('canonical local plane')
    });

    test('resolveLivePlaneConfig: gh is the fallback of last resort — and a pinned-but-dead file REFUSES instead of falling through', async () => {
        const viaGh = await resolveLivePlaneConfig({env: {}, readGhToken: async () => 'gh-token'});

        expect(viaGh.refuse).toBe(false);
        expect(viaGh.bearerSource).toBe('gh');
        expect(viaGh.planeBearer).toBe('gh-token');

        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cockpit-live-'));

        for (const pinned of [path.join(dir, 'missing'), path.join(dir, 'empty')]) {
            if (pinned.endsWith('empty')) {
                fs.writeFileSync(pinned, '   \n')
            }

            const resolved = await resolveLivePlaneConfig({
                env        : {NEO_FLEET_PLANE_BEARER_FILE: pinned},
                readGhToken: async () => 'gh-token-that-must-not-be-reached'
            });

            expect(resolved.refuse, pinned).toBe(true);
            expect(resolved.planeBearer, pinned).toBe('');
            expect(resolved.notes.at(-1), pinned).toContain('REFUSED');
            expect(resolved.notes.at(-1), pinned).toContain('must never silently fall through');
            expect(resolved.notes.join(' '), pinned).not.toContain('gh-token-that-must-not-be-reached')
        }
    });

    test('resolveLivePlaneConfig: the gh fallback is COUPLED to a loopback destination — a pinned remote or unreadable base with no explicit bearer refuses, gh never consulted', async () => {
        // The axis that decides trust is the HOST, not the port: every pre-existing witness varies
        // the port on loopback; this one pins the dangerous field. gh is a throwing seam — reaching
        // it at all is the failure being guarded.
        for (const base of ['https://plane.example.internal', 'not-a-url']) {
            const resolved = await resolveLivePlaneConfig({
                env        : {NEO_FLEET_PLANE_BASE: base},
                readGhToken: async () => { throw new Error('the gh seam must never run for a non-loopback base without an explicit bearer') }
            });

            expect(resolved.refuse, base).toBe(true);
            expect(resolved.planeBearer, base).toBe('');
            expect(resolved.bearerSource, base).toBe(null);
            expect(resolved.notes.at(-1), base).toContain('REFUSED');
            expect(resolved.notes.at(-1), base).toContain('non-loopback');
            expect(resolved.notes.at(-1), base).toContain('NEO_FLEET_PLANE_BEARER');
            expect(resolved.notes.at(-1), base).toContain('canonical local journey')
        }
    });

    test('resolveLivePlaneConfig: a pinned remote base with an EXPLICIT bearer proceeds — the credential decision matches the destination decision', async () => {
        // The gate couples the IMPLICIT fallback only: an explicit credential is an explicit
        // decision, valid for any destination the operator pins.
        const resolved = await resolveLivePlaneConfig({
            env        : {NEO_FLEET_PLANE_BASE: 'https://plane.example.internal', NEO_FLEET_PLANE_BEARER: 'explicit-remote-token'},
            readGhToken: async () => { throw new Error('the gh seam must not run when the env pins the bearer') }
        });

        expect(resolved.refuse).toBe(false);
        expect(resolved.planeBearer).toBe('explicit-remote-token');
        expect(resolved.bearerSource).toBe('env')
    });

    test('resolveLivePlaneConfig: all-three-empty refuses with the remediation — and no resolved value ever reaches the notes', async () => {
        const resolved = await resolveLivePlaneConfig({env: {}, readGhToken: async () => ''});

        expect(resolved.refuse).toBe(true);
        expect(resolved.notes.at(-1)).toContain('REFUSED');
        expect(resolved.notes.at(-1)).toContain('NEO_FLEET_PLANE_BEARER');
        expect(resolved.notes.at(-1)).toContain('gh auth login');

        // The custody witness: a resolved bearer VALUE never leaks into the operator-facing notes
        // (sources are named, secrets are not) — across all three sources.
        const SECRET = 'fixture-secret-value-that-must-stay-out-of-logs';

        for (const [env, readGhToken] of [
            [{NEO_FLEET_PLANE_BEARER: SECRET}, async () => ''],
            [{}, async () => SECRET]
        ]) {
            const leakProbe = await resolveLivePlaneConfig({env, readGhToken});

            expect(leakProbe.refuse).toBe(false);
            expect(leakProbe.notes.join(' ')).not.toContain(SECRET)
        }
    });

    test('probePlaneIdentity: the auth guard 401 IS the plane signature; anything else is named', async () => {
        // (a) a fixture ingress answering 401 before any session — the plane's fail-closed shape
        const guard = http.createServer((req, res) => {
            res.writeHead(401, {'Content-Type': 'application/json'});
            res.end(JSON.stringify({error: 'invalid_token', error_description: 'Missing Authorization header'}))
        });

        await new Promise(resolve => guard.listen(0, '127.0.0.1', resolve));

        const guardPort  = guard.address().port,
              guardProbe = await probePlaneIdentity({planeBase: `http://127.0.0.1:${guardPort}`});

        expect(guardProbe.status).toBe('plane');
        expect(guardProbe.detail).toContain('identity confirmed');

        await new Promise(resolve => guard.close(resolve));

        // (b) an HTTP-ish occupant answering 200-ok is NOT the authenticated ingress
        const foreign = http.createServer((req, res) => {
            res.writeHead(200, {'Content-Type': 'application/json'});
            res.end(JSON.stringify({ok: true}))
        });

        await new Promise(resolve => foreign.listen(0, '127.0.0.1', resolve));

        const foreignProbe = await probePlaneIdentity({planeBase: `http://127.0.0.1:${foreign.address().port}`});

        expect(foreignProbe.status).toBe('incompatible');
        expect(foreignProbe.detail).toContain('HTTP 200');

        await new Promise(resolve => foreign.close(resolve));

        // (c) the just-closed port → unreachable, with the plane-start remediation named
        const deadProbe = await probePlaneIdentity({planeBase: `http://127.0.0.1:${guardPort}`});

        expect(deadProbe.status).toBe('unreachable');
        expect(deadProbe.detail).toContain('docker compose');
        expect(deadProbe.detail).toContain('local-agent-os')
    });

    test('buildFleetChildEnv: the fleet child alone carries the binding — the base env is never mutated', () => {
        const baseEnv = {PATH: '/usr/bin'},
              env     = buildFleetChildEnv({baseEnv, fleetBearer: 'transport-bearer', livePlane: {planeBase: 'http://127.0.0.1:3102', planeBearer: 'plane-secret'}});

        expect(env.NEO_FLEET_BEARER).toBe('transport-bearer');
        expect(env.NEO_FLEET_BEARER_HANDSHAKE).toBe('1');
        expect(env.NEO_FLEET_PLANE_BASE).toBe('http://127.0.0.1:3102');
        expect(env.NEO_FLEET_PLANE_BEARER).toBe('plane-secret');

        // custody: nothing reached back into the launcher's own environment (the webpack child's)
        expect(baseEnv).toEqual({PATH: '/usr/bin'});

        // the in-process journey adds no plane surface at all
        const inProcess = buildFleetChildEnv({baseEnv, fleetBearer: 'transport-bearer'});

        expect('NEO_FLEET_PLANE_BASE' in inProcess).toBe(false);
        expect('NEO_FLEET_PLANE_BEARER' in inProcess).toBe(false)
    });

    test('composed live boot: the file-pinned bearer materializes into the FLEET child only — the webpack child never sees it', async () => {
        test.setTimeout(60000);

        if ((await probeFleetEndpoint(8083)).status !== 'free') {
            test.skip(true, 'the default fleet endpoint is occupied on this machine — the composed live witness needs to own it');
            return
        }

        // the fixture plane: an ingress whose 401-before-session is the identity signature
        const fixturePlane = http.createServer((req, res) => {
            res.writeHead(401, {'Content-Type': 'application/json'});
            res.end(JSON.stringify({error: 'invalid_token'}))
        });

        await new Promise(resolve => fixturePlane.listen(0, '127.0.0.1', resolve));

        const
            planeBase = `http://127.0.0.1:${fixturePlane.address().port}`,
            dir       = fs.mkdtempSync(path.join(os.tmpdir(), 'cockpit-live-')),
            tokenFile = path.join(dir, 'plane-token');

        fs.writeFileSync(tokenFile, 'fixture-file-token-42\n');

        const launcher = spawn(process.execPath, [path.join(repoRoot, 'ai/scripts/fleet/devCockpit.mjs'), '--live'], {
            cwd: repoRoot,
            env: {
                ...process.env,
                NEO_FLEET_PLANE_BASE       : planeBase,
                NEO_FLEET_PLANE_BEARER_FILE: tokenFile,
                // the fleet stub proves the materialized binding ARRIVED (value compared inside the
                // child, only the boolean printed); the webpack stub proves custody (its env lacks it)
                NEO_COCKPIT_FLEET_CMD   : JSON.stringify([process.execPath, '-e',
                    `console.log('FLEET_STUB planeBase=' + process.env.NEO_FLEET_PLANE_BASE + ' bearerMatch=' + (process.env.NEO_FLEET_PLANE_BEARER === 'fixture-file-token-42')); setInterval(() => {}, 1000)`]),
                NEO_COCKPIT_WEBPACK_CMD : JSON.stringify([process.execPath, '-e',
                    `console.log('WEBPACK_STUB planeBearerAbsent=' + (process.env.NEO_FLEET_PLANE_BEARER === undefined)); setInterval(() => {}, 1000)`])
            },
            stdio: ['ignore', 'pipe', 'pipe']
        });

        let output = '';
        launcher.stdout.on('data', chunk => output += chunk);
        launcher.stderr.on('data', chunk => output += chunk);

        try {
            await expect.poll(() => output.includes('WEBPACK_STUB'), {timeout: 15000}).toBe(true);

            expect(output).toContain(`[cockpit:live] plane identity confirmed (authenticated ingress refusal) at ${planeBase}`);
            expect(output).toContain(`FLEET_STUB planeBase=${planeBase} bearerMatch=true`);
            expect(output).toContain('WEBPACK_STUB planeBearerAbsent=true');
            // and the bearer VALUE stayed out of every launcher log line
            expect(output).not.toContain('fixture-file-token-42')
        } finally {
            const exited = new Promise(resolve => launcher.on('exit', resolve));
            launcher.kill('SIGTERM');
            await exited;
            await new Promise(resolve => fixturePlane.close(resolve))
        }
    });

    test('live mode fails FAST on an unreachable plane — before any page or transport spawns', async () => {
        test.setTimeout(30000);

        const launcher = spawn(process.execPath, [path.join(repoRoot, 'ai/scripts/fleet/devCockpit.mjs'), '--live'], {
            cwd: repoRoot,
            env: {
                ...process.env,
                NEO_FLEET_PLANE_BASE   : 'http://127.0.0.1:9',
                NEO_FLEET_PLANE_BEARER : 'dummy-token',
                NEO_COCKPIT_WEBPACK_CMD: JSON.stringify([process.execPath, '-e', 'console.log("WEBPACK_STUB_STARTED"); setInterval(() => {}, 1000)'])
            },
            stdio: ['ignore', 'pipe', 'pipe']
        });

        let output = '';
        launcher.stdout.on('data', chunk => output += chunk);
        launcher.stderr.on('data', chunk => output += chunk);

        const code = await new Promise(resolve => launcher.on('exit', resolve));

        expect(code).toBe(1);
        expect(output).toContain('[cockpit:live] REFUSED: no plane answering');
        expect(output).toContain('docker compose');
        expect(output).not.toContain('WEBPACK_STUB_STARTED')
    });

    test('live mode NEVER adopts an incumbent fleet transport — its plane binding is not probe-observable', async () => {
        test.setTimeout(60000);

        if ((await probeFleetEndpoint(8083)).status !== 'free') {
            test.skip(true, 'the default fleet endpoint is occupied on this machine — the no-adoption witness needs to own it');
            return
        }

        const incumbent = await startFleetBridgeServer(authenticatedOptions({port: 8083}));

        try {
            const result = await new Promise(resolve => {
                const child = spawn(process.execPath, [path.join(repoRoot, 'ai/scripts/fleet/devCockpit.mjs'), '--live'], {
                    cwd: repoRoot,
                    env: {
                        ...process.env,
                        NEO_FLEET_PLANE_BASE   : 'http://127.0.0.1:3102',
                        NEO_FLEET_PLANE_BEARER : 'dummy-token',
                        NEO_COCKPIT_WEBPACK_CMD: JSON.stringify([process.execPath, '-e', 'console.log("WEBPACK_STUB_STARTED"); setInterval(() => {}, 1000)'])
                    },
                    stdio: ['ignore', 'pipe', 'pipe']
                });

                let output = '';
                child.stdout.on('data', chunk => output += chunk);
                child.stderr.on('data', chunk => output += chunk);
                child.on('exit', code => resolve({code, output}))
            });

            // The plane probe may refuse first on machines without a serving plane — both refusals
            // are fail-closed before any page; the witness pins the no-adoption reason when the
            // plane half passed (fixture-free: the probe result decides which refusal surfaced).
            expect(result.code).toBe(1);
            expect(result.output).toContain('[cockpit:live] REFUSED');
            expect(result.output).not.toContain('WEBPACK_STUB_STARTED');

            if (result.output.includes('already serves a fleet transport')) {
                expect(result.output).toContain('plane binding is not observable');
                expect(result.output).toContain('npm run cockpit')
            }
        } finally {
            await new Promise(resolve => incumbent.close(resolve))
        }
    })
});
