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
import {
    createFleetWireOffer,
    createFleetWireRequest,
    FLEET_WIRE_RESPONSE_STATES
} from '../../../../../../ai/services/fleet/fleetWireMethods.mjs';
import {installFleetBridge}       from '../../../../../../apps/agentos/fleet/installFleetBridge.mjs';
import {generateLocalBearerToken} from '../../../../../../ai/mcp/server/shared/helpers/localBearer.mjs';
import RequestContextService      from '../../../../../../ai/mcp/server/shared/services/RequestContextService.mjs';
import fs                         from 'fs';
import os                         from 'os';
import path                       from 'path';

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

    let server, tmpDir, priorDataDir, registryBridge, bearerToken;

    test.beforeAll(async () => {
        tmpDir       = fs.mkdtempSync(path.join(os.tmpdir(), 'fleet-integration-'));
        priorDataDir = FleetRegistryService.dataDir;
        FleetRegistryService.dataDir = tmpDir;

        // The ingress trust chain at full fidelity: a real process bearer, a server-stamped viewer, and
        // the REAL RequestContextService as the per-request identity boundary — the exact wiring
        // the launch path installs in production.
        bearerToken = generateLocalBearerToken();

        server = await startFleetBridgeServer({
            port         : 0,
            bearerToken,
            viewerContext: {userId: 'integration-viewer', username: 'Integration Viewer', agentIdentityNodeId: '@integration-viewer'},
            runInContext : (context, fn) => RequestContextService.run(context, fn)
        });
        const url = `http://127.0.0.1:${server.address().port}/fleet`;

        // exactly the App-Worker startup path, with the real global fetch + the in-memory bearer
        const target = {};
        installFleetBridge({url, bearerToken, target});
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

    test('configureAgent crosses the full one-params wire, persists sparse overrides, and reads back canonically', async () => {
        FleetRegistryService.setLaunchOverride('integration-alice', {
            command: '/secret/bin/codex',
            args   : ['--secret'],
            env    : {TRANSPORT_SECRET: 'hidden'}
        });

        const intent = {
            id         : 'integration-alice',
            harnessType: 'claude-code',
            mcpServers : {'memory-core': true, 'github-workflow': true}
        };
        const outcome = await registryBridge.configureAgent(intent);

        expect(outcome.status).toBe('accepted');
        expect(outcome.agent).toMatchObject({
            id         : 'integration-alice',
            harnessType: 'claude-code',
            mcpServers : {'github-workflow': true}
        });
        expect(outcome.agent.credential).toBeUndefined();
        expect(outcome.agent.metadata.launch).toBeUndefined();
        expect(JSON.stringify(outcome)).not.toMatch(/ghp_SECRET_integration|secret-bin|TRANSPORT_SECRET|hidden/);

        const [readback] = await registryBridge.listAgents();
        expect(readback.harnessType).toBe('claude-code');
        expect(readback.mcpServers).toEqual({'github-workflow': true})
    });

    test('configureAgent returns a safe rejection over the real wire and preserves persisted state', async () => {
        const before  = FleetRegistryService.getAgent('integration-alice'),
              outcome = await registryBridge.configureAgent({
                  id        : 'integration-alice',
                  mcpServers: {'not-registered': true}
              });

        expect(outcome).toEqual({status: 'rejected', reason: "Unknown MCP server 'not-registered'."});
        expect(FleetRegistryService.getAgent('integration-alice')).toEqual(before)
    });

    test('an off-allowlist method is rejected in layers: 401 unauthenticated, allowlist-refused authenticated', async () => {
        const url  = `http://127.0.0.1:${server.address().port}/fleet`,
              body = JSON.stringify({method: 'getManager', params: 'x', protocol: createFleetWireOffer()});

        // Layer 1 (ingress): without the process bearer the request dies at the ingress guard —
        // the resolver-seam probe never even reaches the method allowlist.
        const unauthenticated = await fetch(url, {method: 'POST', headers: {'Content-Type': 'application/json'}, body});

        expect(unauthenticated.status).toBe(401);
        expect((await unauthenticated.json()).ok).toBe(false);

        // Layer 2: an AUTHENTICATED caller naming a non-wire method is refused by the allowlist
        // choke-point — the original resolver-seam guarantee, intact behind the new boundary.
        const authenticated = await fetch(url, {
            method : 'POST',
            headers: {'Content-Type': 'application/json', Authorization: `Bearer ${bearerToken}`},
            body
        });
        const envelope = await authenticated.json();

        expect(envelope.ok).toBe(false);
        expect(envelope.state).toBe(FLEET_WIRE_RESPONSE_STATES.unsupportedMethod);
        expect(envelope.error).toContain('not on the control surface')
    });

    test('resolveViewerIdentity (whoami): the stamped viewer round-trips through the authenticated wire; refusal shapes are named, never a fallback identity', async () => {
        const
            {default: FleetControlBridge}    = await import('../../../../../../ai/services/fleet/FleetControlBridge.mjs'),
            {default: RequestContextService} = await import('../../../../../../ai/mcp/server/shared/services/RequestContextService.mjs'),
            url                              = `http://127.0.0.1:${server.address().port}/fleet`,
            priorSource                      = FleetControlBridge.viewerIdentitySource;

        // the launch-entry wiring shape: whoami reads the SAME per-request binding the mirror uses
        FleetControlBridge.viewerIdentitySource = {
            resolveViewerIdentity: () => RequestContextService.getAgentIdentityNodeId()
        };

        try {
            // The bootstrap leg end to end: an authenticated caller with NO identity knowledge asks
            // whoami; the answer is the TRANSPORT-stamped viewer — the exact @-id the cockpit then
            // passes back explicitly as the mirror's subjectAgentId.
            const admitted = await fetch(url, {
                method : 'POST',
                headers: {'Content-Type': 'application/json', Authorization: `Bearer ${bearerToken}`},
                body   : JSON.stringify(createFleetWireRequest('resolveViewerIdentity'))
            });
            const {ok, result} = await admitted.json();

            expect(ok).toBe(true);
            expect(result).toEqual({ok: true, agentIdentityNodeId: '@integration-viewer'});

            // Unbound context (a direct call outside runInContext): named refusal, no fallback.
            const unbound = FleetControlBridge.resolveViewerIdentity();
            expect(unbound).toEqual({ok: false, error: 'viewer identity unbound — authenticated ingress required'});

            // Unwired source: the honest source-not-wired refusal.
            FleetControlBridge.viewerIdentitySource = null;
            expect(FleetControlBridge.resolveViewerIdentity()).toEqual({ok: false, error: 'fleet viewer identity source not wired'});

            // Unauthenticated: dies at the ingress guard before any method resolution.
            const denied = await fetch(url, {
                method : 'POST',
                headers: {'Content-Type': 'application/json'},
                body   : JSON.stringify(createFleetWireRequest('resolveViewerIdentity'))
            });
            expect(denied.status).toBe(401)
        } finally {
            FleetControlBridge.viewerIdentitySource = priorSource
        }
    });

    test('the mailbox-admission chain: HTTP -> stamped context -> real adapter reads UNDER the transport viewer; a smuggled viewer is refused through the wire', async () => {
        const url = `http://127.0.0.1:${server.address().port}/fleet`;

        // The REAL adapter with an injected listMessages recorder: the one seam MailboxService's
        // own unit battery does not cover is whether the TRANSPORT's stamped identity is what the
        // adapter's resolveBoundIdentity reads at the moment of the read — capture it in-flight.
        const
            {readFleetMailboxMirror}         = await import('../../../../../../ai/services/fleet/fleetMailboxMirrorAdapter.mjs'),
            {default: FleetControlBridge}    = await import('../../../../../../ai/services/fleet/FleetControlBridge.mjs'),
            {default: RequestContextService} = await import('../../../../../../ai/mcp/server/shared/services/RequestContextService.mjs'),
            identitiesSeenByRead             = [];

        const priorSource = FleetControlBridge.mailboxMirrorSource;

        FleetControlBridge.mailboxMirrorSource = {
            readMailboxMirror: params => readFleetMailboxMirror({
                listMessages: async () => {
                    identitiesSeenByRead.push(RequestContextService.getAgentIdentityNodeId());
                    return {messages: []}
                },
                resolveBoundIdentity: () => RequestContextService.getAgentIdentityNodeId(),
                ...params
            })
        };

        try {
            const admitted = await fetch(url, {
                method : 'POST',
                headers: {'Content-Type': 'application/json', Authorization: `Bearer ${bearerToken}`},
                body   : JSON.stringify(createFleetWireRequest(
                    'fleetMailboxMirror',
                    {subjectAgentId: '@integration-viewer'}
                ))
            });
            const {ok, result} = await admitted.json();

            expect(ok).toBe(true);
            // the read executed INSIDE the stamped context — the transport's viewer, not a caller claim
            expect(identitiesSeenByRead).toEqual(['@integration-viewer']);
            // and the snapshot attributes admission to that same transport-stamped viewer
            expect(result.admission.viewerIdentity).toBe('@integration-viewer');

            // The spoof, through the FULL wire: a caller-asserted viewerIdentity that mismatches the
            // bound identity is refused by the adapter's own verification — the assertion can never
            // override the binding.
            const spoofed = await fetch(url, {
                method : 'POST',
                headers: {'Content-Type': 'application/json', Authorization: `Bearer ${bearerToken}`},
                body   : JSON.stringify(createFleetWireRequest(
                    'fleetMailboxMirror',
                    {subjectAgentId: '@integration-viewer', viewerIdentity: '@evil'}
                ))
            });
            const spoofEnvelope = await spoofed.json();

            expect(spoofEnvelope.ok).toBe(true);
            expect(spoofEnvelope.result.admission.state).not.toBe('admitted');
            expect(identitiesSeenByRead, 'the spoofed request must never reach the read').toHaveLength(1);

            // Unauthenticated: the chain is unreachable — the recorder count proves zero side effects.
            const denied = await fetch(url, {
                method : 'POST',
                headers: {'Content-Type': 'application/json'},
                body   : JSON.stringify(createFleetWireRequest(
                    'fleetMailboxMirror',
                    {subjectAgentId: '@integration-viewer'}
                ))
            });

            expect(denied.status).toBe(401);
            expect(identitiesSeenByRead).toHaveLength(1)
        } finally {
            FleetControlBridge.mailboxMirrorSource = priorSource
        }
    });

    test('session custody over the REAL wire: the true bearer verified-retires the ingress, a wrong bearer preserves it', async () => {
        // The L3 live non-destructive probe for the custody lifecycle: real server, real fetch,
        // real authenticated whoami — "verify the new connection" is the server's stamped answer.
        const {establishFleetSessionCustody} = await import('../../../../../../apps/agentos/app.mjs');
        const url                            = `http://127.0.0.1:${server.address().port}/fleet`;

        const verifiedTarget = {AgentOS: {fleet: {bearerToken}}};
        const established    = establishFleetSessionCustody({bearerToken, fleetUrl: url, target: verifiedTarget});

        expect(verifiedTarget.AgentOS.fleet.bearerToken, 'retire must wait for the wire').toBe(bearerToken);
        await expect(established.custodySettled).resolves.toBe(true);
        expect('bearerToken' in verifiedTarget.AgentOS.fleet).toBe(false);
        expect(established.bridge.profileId).toBe(`fleet-profile:v1:${url}`);

        // A DIFFERENT valid-format bearer: the server refuses it, so custody never verifies and the
        // launcher ingress survives untouched — the rollback state a wrong credential must not burn.
        const wrongBearer     = generateLocalBearerToken();
        const preservedTarget = {AgentOS: {fleet: {bearerToken: wrongBearer}}};
        const refused         = establishFleetSessionCustody({bearerToken: wrongBearer, fleetUrl: url, target: preservedTarget});

        await expect(refused.custodySettled).resolves.toBe(false);
        expect(preservedTarget.AgentOS.fleet.bearerToken).toBe(wrongBearer)
    });
});
