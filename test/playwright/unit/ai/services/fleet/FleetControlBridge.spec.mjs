import {setup} from '../../../../setup.mjs';

const appName = 'FleetControlBridgeTest';

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

import {test, expect}       from '@playwright/test';
import Neo                  from '../../../../../../src/Neo.mjs';
import * as core            from '../../../../../../src/core/_export.mjs';
import FleetControlBridge   from '../../../../../../ai/services/fleet/FleetControlBridge.mjs';
import FleetManager         from '../../../../../../ai/services/fleet/FleetManager.mjs';
import FleetRegistryService from '../../../../../../ai/services/fleet/FleetRegistryService.mjs';

// FleetControlBridge is a singleton — the default export is the instance. Its `registry` / `manager`
// are plain injectable-seam fields (the sibling FleetManager.lifecycleService precedent), so each test
// swaps in a recording stub and afterEach resets them to null — the shared singleton never leaks state
// between tests, and no real registry/manager (which would touch disk / spawn processes) is ever hit.

test.describe('Neo.ai.services.fleet.FleetControlBridge — capability allowlist over the two Brain singletons', () => {
    let calls, registryStub, managerStub, tenantServiceStub;

    test.beforeEach(() => {
        calls = [];

        registryStub = {
            defineAgent   : def => { calls.push(['defineAgent', def]); const {credential, ...pub} = def; return {id: def.id || def.githubUsername, ...pub}; },
            configureAgent: intent => { calls.push(['configureAgent', intent]); return intent.id === 'alice' ? {id: 'alice', harnessType: intent.harnessType} : null; },
            listAgents    : ()  => { calls.push(['listAgents']);       return [{id: 'alice'}, {id: 'bob'}]; },
            getAgent      : id  => { calls.push(['getAgent', id]);     return {id}; }
        };

        managerStub = {
            startAgent     : async id => { calls.push(['startAgent', id]);   return {id, state: 'running'}; },
            stopAgent      : async id => { calls.push(['stopAgent', id]);    return {success: true, id, state: 'stopped'}; },
            restartAgent   : async id => { calls.push(['restartAgent', id]); return {id, state: 'running'}; },
            removeAgent    : async id => { calls.push(['removeAgent', id]);  return {success: true, id}; },
            fleetRepoStatus: ()       => { calls.push(['fleetRepoStatus']);  return [{id: 'alice', repo: 'clean'}]; },
            setRepo        : payload  => { calls.push(['setRepo', payload]);   return {id: payload.id, metadata: {repo: payload}}; },
            setAvatar      : payload  => { calls.push(['setAvatar', payload]); return {id: payload.id, metadata: {avatarUrl: payload.avatarUrl}}; }
        };

        tenantServiceStub = {
            resolveMcpResources: tenantId => {
                calls.push(['resolveMcpResources', tenantId]);

                return tenantId === 'connected'
                    ? {tenantId, resources: {'memory-core': {}, 'knowledge-base': {}}}
                    : null
            }
        };

        FleetControlBridge.registry = registryStub;
        FleetControlBridge.manager  = managerStub;
        FleetControlBridge.tenantService = tenantServiceStub;
    });

    test.afterEach(() => {
        FleetControlBridge.registry           = null;
        FleetControlBridge.manager            = null;
        FleetControlBridge.bootIdentitySource = null;
        FleetControlBridge.activitySource     = null;
        FleetControlBridge.historySource      = null;
        FleetControlBridge.mailboxMirrorSource = null;
        FleetControlBridge.identityResolver   = null;
        FleetControlBridge.tenantService      = null;
    });

    // ---- delegation: the registry (define / list / get) half ----

    test('defineAgent forwards the definition verbatim to the registry and returns its public shape', () => {
        const def    = {githubUsername: 'alice', harnessType: 'codex', credential: 'ghp_secret'},
              result = FleetControlBridge.defineAgent(def);

        expect(calls).toEqual([['defineAgent', def]]);
        expect(result.githubUsername).toBe('alice');
        // the bridge adds no credential path of its own — it returns exactly the registry's public API result
        expect(result.credential).toBeUndefined();
    });

    test('defineAgent exposes only controlled registry-domain reasons; unexpected failures still throw', () => {
        registryStub.defineAgent = () => {
            throw new TypeError("FleetRegistryService.defineAgent: id 'alice' already exists; use a scoped update operation.")
        };
        expect(FleetControlBridge.defineAgent({githubUsername: 'alice', harnessType: 'codex'})).toEqual({
            status: 'rejected',
            reason: "id 'alice' already exists; use a scoped update operation."
        });

        registryStub.defineAgent = () => { throw new Error('/secret/storage/path failed') };
        expect(() => FleetControlBridge.defineAgent({githubUsername: 'alice', harnessType: 'codex'}))
            .toThrow('/secret/storage/path failed')
    });

    test('defineAgent rejects retired target-as-transport input through the real registry boundary', () => {
        const retiredTargetField = ['mcp', 'Transport'].join('');

        FleetControlBridge.registry = FleetRegistryService;

        expect(FleetControlBridge.defineAgent({
            githubUsername      : 'legacy-wire',
            harnessType         : 'codex',
            [retiredTargetField]: {
                mode    : ['remote', 'http'].join('-'),
                tenantId: 'tenant-a'
            }
        })).toEqual({
            status: 'rejected',
            reason: "retired target-as-transport input is not accepted; use 'mcpTarget'."
        })
    });

    test('defineAgent rejects a new unavailable tenant target before registry persistence', () => {
        registryStub.getAgent = id => {
            calls.push(['getAgent', id]);

            return null
        };

        const definition = {
            githubUsername: 'new-peer',
            harnessType   : 'codex',
            mcpTarget     : {kind: 'tenant', tenantId: 'missing'}
        };

        expect(FleetControlBridge.defineAgent(definition)).toEqual({
            status: 'rejected',
            reason: "MCP tenant 'missing' is unavailable."
        });
        expect(calls).toEqual([
            ['getAgent', 'new-peer'],
            ['resolveMcpResources', 'missing']
        ])
    });

    test('configureAgent forwards one curated payload and returns accepted/rejected domain outcomes', () => {
        const intent = {id: 'alice', harnessType: 'claude-code', mcpServers: {'memory-core': false}};

        expect(FleetControlBridge.configureAgent(intent)).toEqual({
            status: 'accepted',
            agent : {id: 'alice', harnessType: 'claude-code'}
        });
        expect(calls).toEqual([['configureAgent', intent]]);

        calls.length = 0;
        expect(FleetControlBridge.configureAgent({id: 'ghost', harnessType: 'codex'}))
            .toEqual({status: 'rejected', reason: "Unknown agent 'ghost'."})
    });

    test('configureAgent exposes only controlled validation reasons; unexpected failures still throw', () => {
        registryStub.configureAgent = () => {
            throw new TypeError("FleetRegistryService.configureAgent: unsupported field 'credential'.")
        };
        expect(FleetControlBridge.configureAgent({id: 'alice', credential: 'secret'}))
            .toEqual({status: 'rejected', reason: "unsupported field 'credential'."});

        registryStub.configureAgent = () => { throw new Error('/secret/storage/path failed') };
        expect(() => FleetControlBridge.configureAgent({id: 'alice', harnessType: 'codex'}))
            .toThrow('/secret/storage/path failed')
    });

    test('configureAgent admits only a connected NEW tenant target and never persists an unavailable one', () => {
        const available = {
            id       : 'alice',
            mcpTarget: {kind: 'tenant', tenantId: 'connected'}
        };

        expect(FleetControlBridge.configureAgent(available)).toEqual({
            status: 'accepted',
            agent : {id: 'alice', harnessType: undefined}
        });
        expect(calls).toEqual([
            ['getAgent', 'alice'],
            ['resolveMcpResources', 'connected'],
            ['configureAgent', available]
        ]);

        calls.length = 0;

        const unavailable = {
            id       : 'alice',
            mcpTarget: {kind: 'tenant', tenantId: 'missing'}
        };

        expect(FleetControlBridge.configureAgent(unavailable)).toEqual({
            status: 'rejected',
            reason: "MCP tenant 'missing' is unavailable."
        });
        expect(calls).toEqual([
            ['getAgent', 'alice'],
            ['resolveMcpResources', 'missing']
        ])
    });

    test('configureAgent preserves an unchanged saved remote target for the start-time readiness gate', () => {
        registryStub.getAgent = id => {
            calls.push(['getAgent', id]);

            return {id, mcpTarget: {kind: 'tenant', tenantId: 'stale-saved'}}
        };

        const intent = {
            id       : 'alice',
            mcpTarget: {kind: 'tenant', tenantId: 'stale-saved'}
        };

        expect(FleetControlBridge.configureAgent(intent).status).toBe('accepted');
        expect(calls).toEqual([
            ['getAgent', 'alice'],
            ['configureAgent', intent]
        ])
    });

    test('listAgents delegates to the registry roster', () => {
        expect(FleetControlBridge.listAgents()).toEqual([{id: 'alice'}, {id: 'bob'}]);
        expect(calls).toEqual([['listAgents']]);
    });

    test('getAgent delegates by id', () => {
        expect(FleetControlBridge.getAgent('alice')).toEqual({id: 'alice'});
        expect(calls).toEqual([['getAgent', 'alice']]);
    });

    // ---- read-observe: the boot-identity fact (advisory read verb; carries no lifecycle-write) ----

    test('getBootIdentity returns the injected source advisory fact — read-observe, never a lifecycle-write', async () => {
        const advisoryFact = {fact: {bootAt: '2026-07-04T00:00:00.000Z', sourceRef: 'abc123'}, classification: 'current', advisory: true, reason: 'fresh'};
        FleetControlBridge.bootIdentitySource = {produceBootIdentityFact: async () => { calls.push(['produceBootIdentityFact']); return advisoryFact; }};

        const result = await FleetControlBridge.getBootIdentity();

        expect(result).toEqual(advisoryFact);
        expect(result.advisory).toBe(true);   // advisory read — carries no restart / lifecycle-write command
        expect(calls).toEqual([['produceBootIdentityFact']]);
    });

    test('getBootIdentity yields an advisory-empty fact when the source is unwired — never fabricated liveness', () => {
        FleetControlBridge.bootIdentitySource = null;

        expect(FleetControlBridge.getBootIdentity()).toEqual({fact: null, classification: 'unknown', advisory: true, reason: 'no-boot-identity-source'});
    });

    // ---- read-observe: the fleet activity snapshot (advisory read verb; carries no lifecycle-write) ----

    test('fleetActivity returns the injected source snapshot — read-observe, never a lifecycle-write', async () => {
        const snapshot = {
            capability: {source: 'fleet:activity-adapters', state: 'wired', confidence: 'observed'},
            events    : [{type: 'lane-claim', source: 'memory-core:mailbox', agentId: 'neo-opus-vega', occurredAt: '2026-07-05T00:00:00.000Z', payload: {kind: 'a2a-lane-claim', subject: '[lane-claim] #14606'}}]
        };
        FleetControlBridge.activitySource = {readActivitySnapshot: async params => { calls.push(['readActivitySnapshot', params]); return snapshot; }};

        const result = await FleetControlBridge.fleetActivity({limit: 25});

        expect(result).toEqual(snapshot);
        expect(calls).toEqual([['readActivitySnapshot', {limit: 25}]]);   // bounds forwarded verbatim to the source
    });

    test('fleetActivity yields an honest source-not-wired snapshot when the source is unwired — never fabricated activity', () => {
        FleetControlBridge.activitySource = null;

        const result = FleetControlBridge.fleetActivity();

        expect(result.events).toEqual([]);   // no invented traffic
        expect(result.capability).toMatchObject({state: 'not-wired', confidence: 'none', reason: 'fleet activity source not wired'});
    });

    // ---- invoked history: source-owned envelopes + runtime-only explicit anchor write ----

    test('fleetHistory and markFleetCaughtUp route verbatim to one injected viewer-bound source', async () => {
        const snapshot = {
            capability: {state: 'wired'},
            partition : '@neo-opus-ada',
            window    : {windowStart: '2026-07-17T12:00:00.000Z', windowEnd: '2026-07-18T12:00:00.000Z'},
            sources   : {memory: {state: 'available'}, pullRequests: {state: 'available'}}
        };

        FleetControlBridge.historySource = {
            readHistory : async params => { calls.push(['readHistory', params]); return snapshot; },
            markCaughtUp: async params => { calls.push(['markCaughtUp', params]); return {status: 'advanced', lastSeen: params.windowEnd}; }
        };

        await expect(FleetControlBridge.fleetHistory({partition: '@neo-opus-ada'})).resolves.toBe(snapshot);
        await expect(FleetControlBridge.markFleetCaughtUp({windowEnd: snapshot.window.windowEnd})).resolves.toEqual({
            status  : 'advanced',
            lastSeen: snapshot.window.windowEnd
        });
        expect(calls).toEqual([
            ['readHistory', {partition: '@neo-opus-ada'}],
            ['markCaughtUp', {windowEnd: snapshot.window.windowEnd}]
        ])
    });

    test('an unwired history source is named unavailable; mark never fabricates an advance', () => {
        FleetControlBridge.historySource = null;

        expect(FleetControlBridge.fleetHistory({partition: '@neo-opus-ada'})).toMatchObject({
            capability: {state: 'unavailable'},
            partition : '@neo-opus-ada',
            window    : null,
            sources   : null
        });
        expect(FleetControlBridge.markFleetCaughtUp({windowEnd: '2026-07-18T12:00:00.000Z'}))
            .toEqual({status: 'not-wired', reason: 'fleet history source not wired'})
    });

    // ---- read-observe: the per-agent mailbox mirror (S1; advisory read verb, no mutation path) ----

    test('fleetMailboxMirror routes to the injected source — the bridge never authors an admission fact', async () => {
        const snapshot = {
            capability: {source: 'memory-core:mailbox', state: 'wired', confidence: 'observed', capturedAt: '2026-07-16T12:00:00.000Z', reason: null},
            admission : {state: 'granted', viewerIdentity: '@tobiu', subjectAgentId: '@neo-opus-vega', checkedAt: '2026-07-16T12:00:00.000Z', reason: null},
            rows      : [],
            page      : {limit: 50, offset: 0, count: 0}
        };
        FleetControlBridge.mailboxMirrorSource = {readMailboxMirror: async params => { calls.push(['readMailboxMirror', params]); return snapshot; }};

        const result = await FleetControlBridge.fleetMailboxMirror({subjectAgentId: '@neo-opus-vega', limit: 25, offset: 0});

        expect(result).toEqual(snapshot);
        // subject + bounds forwarded verbatim: the source owns the identity binding, not this verb
        expect(calls).toEqual([['readMailboxMirror', {subjectAgentId: '@neo-opus-vega', limit: 25, offset: 0}]]);

        FleetControlBridge.mailboxMirrorSource = null
    });

    test('fleetMailboxMirror unwired degrades through the ADAPTER shape — never an empty inbox for a missing feed', () => {
        FleetControlBridge.mailboxMirrorSource = null;

        const result = FleetControlBridge.fleetMailboxMirror({subjectAgentId: '@neo-opus-vega'});

        // "no mail" and "no mailbox feed" are different claims — only the producer may make the first
        expect(result.admission.state).toBe('unavailable');
        expect(result.admission.state).not.toBe('granted');
        expect(result.capability.state).toBe('degraded');
        expect(result.capability.reason).toContain('not wired');
        expect(result.rows).toEqual([]);
        expect(result.page.count).toBe(0);

        // shape-identical to a live snapshot: the consuming pane cannot tell the envelopes apart by
        // shape, only by state — an unwired verb that returned a DIFFERENT shape would make the
        // pane's fail-closed envelope guard read it as unrecognized rather than honestly unavailable
        expect(Object.keys(result).sort()).toEqual(['admission', 'capability', 'page', 'rows'])
    });

    // ---- delegation: the lifecycle (start / stop / restart / remove / status) half ----

    test('startAgent delegates to the manager and resolves its lifecycle status', async () => {
        await expect(FleetControlBridge.startAgent('alice')).resolves.toEqual({id: 'alice', state: 'running'});
        expect(calls).toEqual([['startAgent', 'alice']]);
    });

    test('stopAgent delegates to the manager', async () => {
        await expect(FleetControlBridge.stopAgent('alice')).resolves.toEqual({success: true, id: 'alice', state: 'stopped'});
        expect(calls).toEqual([['stopAgent', 'alice']]);
    });

    test('restartAgent delegates to the manager', async () => {
        await expect(FleetControlBridge.restartAgent('alice')).resolves.toEqual({id: 'alice', state: 'running'});
        expect(calls).toEqual([['restartAgent', 'alice']]);
    });

    test('removeAgent delegates to the manager compose (stop + deregister)', async () => {
        await expect(FleetControlBridge.removeAgent('alice')).resolves.toEqual({success: true, id: 'alice'});
        expect(calls).toEqual([['removeAgent', 'alice']]);
    });

    test('setRepo delegates the single payload to the manager definition-update (fleet authority)', () => {
        const payload = {id: 'alice', cloneUrl: 'https://github.com/x/y.git', repoSlug: 'x/y'};
        expect(FleetControlBridge.setRepo(payload)).toEqual({id: 'alice', metadata: {repo: payload}});
        expect(calls).toEqual([['setRepo', payload]]);
    });

    test('setAvatar delegates the single payload to the manager definition-update (fleet authority)', () => {
        const payload = {id: 'alice', avatarUrl: 'https://cdn/x.png'};
        expect(FleetControlBridge.setAvatar(payload)).toEqual({id: 'alice', metadata: {avatarUrl: 'https://cdn/x.png'}});
        expect(calls).toEqual([['setAvatar', payload]]);
    });

    test('fleetStatus delegates to the manager repo-status aggregator', () => {
        expect(FleetControlBridge.fleetStatus()).toEqual([{id: 'alice', repo: 'clean'}]);
        expect(calls).toEqual([['fleetRepoStatus']]);
    });

    test('fleetRuntimeStatus delegates to the manager runtime aggregator', () => {
        managerStub.fleetRuntimeStatus = () => { calls.push(['fleetRuntimeStatus']); return [{agentId: 'alice', state: 'running', running: true, confidence: 'observed', source: 'fleet:runtimeStatus'}]; };
        expect(FleetControlBridge.fleetRuntimeStatus()).toEqual([{agentId: 'alice', state: 'running', running: true, confidence: 'observed', source: 'fleet:runtimeStatus'}]);
        expect(calls).toEqual([['fleetRuntimeStatus']]);
    });

    // ---- fleetRoster: the assembled cockpit DTO with the identity join (the Brain-side assembler) ----

    test('fleetRoster assembles roster + repo + runtime and joins identity display facts through the resolver seam', async () => {
        registryStub.listAgents = () => {
            calls.push(['listAgents']);
            return [
                {id: 'neo-gpt', githubUsername: 'neo-gpt', harnessType: 'codex'},
                {id: 'guest-agent', githubUsername: 'guest-agent', harnessType: 'claude-code'}
            ];
        };
        managerStub.fleetRepoStatus    = () => { calls.push(['fleetRepoStatus']); return [{agentId: 'neo-gpt', state: 'checkout'}]; };
        managerStub.fleetRuntimeStatus = () => { calls.push(['fleetRuntimeStatus']); return [{agentId: 'neo-gpt', state: 'running', running: true, confidence: 'observed'}]; };

        // the ONE join seam — injected here, so the spec pins the SEAM without depending on live root values
        FleetControlBridge.identityResolver = login => {
            calls.push(['resolveIdentityDisplay', login]);
            return login === 'neo-gpt' ? {family: 'gpt', engineTag: 'GPT-5.6 Sol'} : {family: null, engineTag: null};
        };

        const dto = await FleetControlBridge.fleetRoster();

        // the resolver was consulted once per agent, keyed by githubUsername
        expect(calls).toContainEqual(['resolveIdentityDisplay', 'neo-gpt']);
        expect(calls).toContainEqual(['resolveIdentityDisplay', 'guest-agent']);

        expect(dto.rows).toHaveLength(2);
        expect(dto.rows[0]).toMatchObject({
            id       : 'neo-gpt',
            family   : 'gpt',
            engineTag: 'GPT-5.6 Sol',
            lifecycle: {state: 'running', confidence: 'observed'},
            sources  : {runtime: {state: 'wired'}}
        });

        // no identity root -> null facts (rendered unclassified/tagless, never guessed) + honest runtime gap
        expect(dto.rows[1]).toMatchObject({
            id       : 'guest-agent',
            family   : null,
            engineTag: null,
            lifecycle: {state: 'not-wired', confidence: 'none'}
        });

        // activity stays on its own verb; the DTO declares that honestly rather than duplicating it
        expect(dto.capabilities.activity.state).toBe('not-wired');
        expect(dto.capabilities.runtime.state).toBe('wired');
    });

    test('fleetRoster defaults the resolver to the identity-roots join when not injected — family real, engineTag honestly null', async () => {
        registryStub.listAgents        = () => [{id: 'neo-gpt', githubUsername: 'neo-gpt', harnessType: 'codex'}];
        managerStub.fleetRepoStatus    = () => [];
        managerStub.fleetRuntimeStatus = () => [];

        const [row] = (await FleetControlBridge.fleetRoster()).rows;

        // compare against the LIVE root: family is the stable identity fact the roots CAN answer;
        // engineTag stays null until a truthful current-engine source exists (session/era metadata)
        expect(row.family).toBe('gpt');
        expect(row.engineTag).toBeNull();
    });

    test('fleetRoster stamps launch-derived truth per row — templated families carry their auth mode, native-neo stays honestly unlaunchable', async () => {
        registryStub.listAgents = () => [
            {id: 'desk',   githubUsername: 'desk-gh',   harnessType: 'claude-desktop'},
            {id: 'cli',    githubUsername: 'cli-gh',    harnessType: 'codex'},
            {id: 'codexd', githubUsername: 'codexd-gh', harnessType: 'codex-desktop'},
            {id: 'native', githubUsername: 'native-gh', harnessType: 'native-neo'}
        ];
        managerStub.fleetRepoStatus    = () => [];
        managerStub.fleetRuntimeStatus = () => [];
        FleetControlBridge.identityResolver = () => ({family: null, engineTag: null});

        const rows = (await FleetControlBridge.fleetRoster()).rows;

        // DERIVED at read time from the launch seam (LAUNCHABLE_HARNESS_TYPES / getHarnessAuthMode)
        // — a family flips cockpit-launchable exactly when its launch template lands; there is no
        // second hand-maintained list to drift. The start control renders these honestly BEFORE
        // any wire call: native-neo disables with truth, in-app families announce their sign-in.
        expect(rows[0]).toMatchObject({id: 'desk',   launchable: true,  authMode: 'in-app'});
        expect(rows[1]).toMatchObject({id: 'cli',    launchable: true,  authMode: 'marker'});
        expect(rows[2]).toMatchObject({id: 'codexd', launchable: true,  authMode: 'marker'});
        expect(rows[3]).toMatchObject({id: 'native', launchable: false, authMode: null});
    });

    // ---- the security boundary: the allowlist OMITS the Brain-internal secret paths ----

    test('the surface exposes NO Brain-internal secret accessor (the capability allowlist)', () => {
        // A transport serves only the bridge's own methods, so these secret paths must not be reachable
        // on the surface — a forged pane request can then never decrypt a PAT or forge a bridge token.
        for (const secret of ['resolveCredential', 'mintBridgeToken', 'getSigningKey', 'getBridgePublicKey', 'getKey']) {
            expect(typeof FleetControlBridge[secret]).toBe('undefined');
        }
    });

    // ---- default resolution when no stub is injected ----

    test('getRegistry / getManager resolve to the Brain singletons when not injected', () => {
        FleetControlBridge.registry = null;
        FleetControlBridge.manager  = null;
        expect(FleetControlBridge.getRegistry()).toBe(FleetRegistryService);
        expect(FleetControlBridge.getManager()).toBe(FleetManager);
    });
});

// The REAL assembler. `fleetThrottleStatus()` returning a correct snapshot proves nothing about the
// DTO a consumer actually reads — the roster join is the contract, so it is exercised end to end
// here rather than through the producer verb alone.
test.describe('Neo.ai.services.fleet.FleetControlBridge — fleetRoster joins the S2 telltale axes onto the cockpit DTO', () => {
    const rosterManager = ({wake, throttle} = {}) => ({
        fleetRepoStatus   : () => [],
        fleetRuntimeStatus: () => [],
        ...(wake     && {fleetWakeStatus    : async () => wake}),
        ...(throttle && {fleetThrottleStatus: async () => throttle})
    });

    test.beforeEach(() => {
        FleetControlBridge.registry         = {listAgents: () => [{id: 'alice'}, {id: 'bob'}]};
        FleetControlBridge.identityResolver = () => ({family: null, engineTag: null});
    });

    test.afterEach(() => {
        FleetControlBridge.registry         = null;
        FleetControlBridge.manager          = null;
        FleetControlBridge.identityResolver = null;
    });

    test('the throttle producer snapshot reaches the consumed DTO: per-row state + the capability envelope', async () => {
        FleetControlBridge.manager = rosterManager({
            throttle: {
                capability: {source: 'fleet:throttleState', state: 'wired', confidence: 'observed'},
                states    : [
                    {agentId: 'alice', throttle: 'rate-limited', confidence: 'observed', source: 'fleet:throttleState'},
                    {agentId: 'bob',   throttle: 'none',         confidence: 'observed', source: 'fleet:throttleState'}
                ]
            }
        });

        const dto = await FleetControlBridge.fleetRoster();

        expect(dto.rows.map(row => row.throttle.state)).toEqual(['rate-limited', 'none']);
        expect(dto.rows[0].throttle).toMatchObject({source: 'fleet:throttleState', confidence: 'observed'});
        expect(dto.rows[0].sources.throttle).toMatchObject({state: 'wired', confidence: 'observed'});
        expect(dto.capabilities.throttle).toMatchObject({state: 'wired', confidence: 'observed'});
    });

    test('a degraded throttle producer still reaches the DTO honestly — unknown rows carry their reason', async () => {
        FleetControlBridge.manager = rosterManager({
            throttle: {
                capability: {source: 'fleet:throttleState', state: 'degraded', confidence: 'none', reason: 'no throttle truth source exists yet'},
                states    : [{agentId: 'alice', throttle: 'unknown', confidence: 'none', source: 'fleet:throttleState', reason: 'no throttle truth source exists yet'}]
            }
        });

        const dto = await FleetControlBridge.fleetRoster();

        expect(dto.rows[0].throttle).toMatchObject({state: 'unknown', confidence: 'none', reason: 'no throttle truth source exists yet'});
        expect(dto.capabilities.throttle).toMatchObject({state: 'degraded', confidence: 'none'});
    });

    test('a manager seam with NO throttle producer method degrades to not-wired — never a guessed none', async () => {
        FleetControlBridge.manager = rosterManager();

        const dto = await FleetControlBridge.fleetRoster();

        // The observation field stays inside the closed taxonomy; the wiring fact lives in the
        // capability + sources, exactly as the wake axis does.
        expect(dto.rows[0].throttle).toMatchObject({state: 'unknown', confidence: 'none'});
        expect(dto.rows[0].sources.throttle).toMatchObject({state: 'not-wired'});
        expect(dto.capabilities.throttle).toMatchObject({state: 'not-wired'});
    });

    test('both axes join independently — a wired wake producer does not carry a missing throttle producer', async () => {
        FleetControlBridge.manager = rosterManager({
            wake: {
                capability: {source: 'fleet:wakeState', state: 'wired', confidence: 'observed'},
                states    : [{agentId: 'alice', wake: 'on', confidence: 'observed', source: 'fleet:wakeState'}]
            }
        });

        const dto = await FleetControlBridge.fleetRoster();

        expect(dto.rows[0].wake).toMatchObject({state: 'on', confidence: 'observed'});
        expect(dto.capabilities.wake).toMatchObject({state: 'wired'});
        expect(dto.capabilities.throttle).toMatchObject({state: 'not-wired'});
    });
});
