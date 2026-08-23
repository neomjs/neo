import {setup} from '../../../../setup.mjs';

const appName = 'FleetManagerTest';

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
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';
import FleetManager   from '../../../../../../ai/services/fleet/FleetManager.mjs';

// FleetManager is a singleton; `lifecycleService` is a plain injectable seam (default =
// FleetLifecycleService). Each test swaps in a stub whose getRegistry() returns a recording registry
// stub, so setRepo's fleet-authority delegation + its metadata construction are proven without
// touching disk / spawning processes; afterEach resets the seam so no state leaks between tests.

test.describe('Neo.ai.services.fleet.FleetManager — fleet-authority definition-update verbs (setRepo / setAvatar)', () => {
    let calls, registryStub;

    test.beforeEach(() => {
        calls = [];

        registryStub = {
            updateAgent: (id, patch) => { calls.push(['updateAgent', id, patch]); return {id, ...patch}; }
        };

        FleetManager.lifecycleService = {getRegistry: () => registryStub};
    });

    test.afterEach(() => {
        FleetManager.lifecycleService = null;
    });

    test('sets metadata.repo = {cloneUrl, repoSlug} from the single payload — the convention the provisioner honors', () => {
        const result = FleetManager.setRepo({id: 'alice', cloneUrl: 'https://github.com/x/y.git', repoSlug: 'x/y'});

        expect(calls).toEqual([['updateAgent', 'alice', {metadata: {repo: {cloneUrl: 'https://github.com/x/y.git', repoSlug: 'x/y'}}}]]);
        expect(result.metadata.repo).toEqual({cloneUrl: 'https://github.com/x/y.git', repoSlug: 'x/y'});
    });

    test('omits an unset coordinate — no null/undefined leaks into metadata.repo', () => {
        FleetManager.setRepo({id: 'alice', cloneUrl: 'https://github.com/x/y.git'});

        expect(calls).toEqual([['updateAgent', 'alice', {metadata: {repo: {cloneUrl: 'https://github.com/x/y.git'}}}]]);
    });

    test('with no coordinates sets an empty metadata.repo (a safe no-op, not a wipe of other metadata)', () => {
        FleetManager.setRepo({id: 'alice'});

        expect(calls).toEqual([['updateAgent', 'alice', {metadata: {repo: {}}}]]);
    });

    test('forwards the registry null (unknown agent) verbatim — no partial definition invented', () => {
        registryStub.updateAgent = (id, patch) => { calls.push(['updateAgent', id, patch]); return null; };

        expect(FleetManager.setRepo({id: 'ghost', cloneUrl: 'https://github.com/x/y.git'})).toBeNull();
    });

    test('setAvatar sets metadata.avatarUrl from the single payload (sibling fleet-authority verb)', () => {
        const result = FleetManager.setAvatar({id: 'alice', avatarUrl: 'https://cdn/x.png'});

        expect(calls).toEqual([['updateAgent', 'alice', {metadata: {avatarUrl: 'https://cdn/x.png'}}]]);
        expect(result.metadata.avatarUrl).toBe('https://cdn/x.png');
    });

    test('setAvatar with no avatarUrl sends an empty metadata patch (safe no-op, not a wipe)', () => {
        FleetManager.setAvatar({id: 'alice'});

        expect(calls).toEqual([['updateAgent', 'alice', {metadata: {}}]]);
    });
});

test.describe('Neo.ai.services.fleet.FleetManager — fleetRuntimeStatus (roster × lifecycle status)', () => {
    test.afterEach(() => {
        FleetManager.lifecycleService = null;
    });

    test('composes the roster with per-agent lifecycle status — every registered agent gets a row', () => {
        const registryStub = {listAgents: () => [{id: 'alice'}, {id: 'bob'}]};

        FleetManager.lifecycleService = {
            getRegistry: () => registryStub,
            status     : id => id === 'alice'
                ? {id, state: 'running', running: true,  pid: 4242, startedAt: '2026-07-04T00:00:00Z', exitCode: null}
                : {id, state: 'stopped', running: false, pid: null, startedAt: null,                    exitCode: null}
        };

        expect(FleetManager.fleetRuntimeStatus()).toEqual([
            {agentId: 'alice', state: 'running', running: true, confidence: 'observed', source: 'fleet:runtimeStatus'},
            {
                agentId   : 'bob',
                state     : 'unmanaged',
                running   : false,
                confidence: 'none',
                reason    : 'no fleet process record: this agent runs outside fleet supervision',
                source    : 'fleet:runtimeStatus'
            }
        ]);
    });

    test('an agent the fleet never launched reports unmanaged, NOT stopped — never-launched is not stopped (#17305)', () => {
        // The incident: nine external-harness seats rendered `benched / offline` because `status()`
        // answers `stopped` for an agent it holds no record of — a sound lifecycle default, an
        // invented verdict once republished as fleet truth. The row must still EXIST (the roster
        // guarantee is about row existence), it just may not assert a session state.
        const registryStub = {listAgents: () => [{id: 'grace'}]};

        FleetManager.lifecycleService = {
            getRegistry: () => registryStub,
            status     : id => ({id, state: 'stopped', running: false, pid: null, startedAt: null, exitCode: null})
        };

        const [row] = FleetManager.fleetRuntimeStatus();

        expect(row.state).toBe('unmanaged');
        expect(row.state).not.toBe('stopped');
        // Absence of signal, never a verdict: no confidence is claimed, and the cause travels with
        // the fact because downstream normalization is forbidden from inventing one.
        expect(row.confidence).toBe('none');
        expect(row.reason).toBe('no fleet process record: this agent runs outside fleet supervision');
    });

    test('a tracked-but-stopped agent reads observed (a process record backs it) — state never invented', () => {
        const registryStub = {listAgents: () => [{id: 'alice'}]};

        FleetManager.lifecycleService = {
            getRegistry: () => registryStub,
            status     : id => ({id, state: 'stopped', running: false, pid: null, startedAt: '2026-07-04T00:00:00Z', exitCode: 1})
        };

        expect(FleetManager.fleetRuntimeStatus()).toEqual([
            {agentId: 'alice', state: 'stopped', running: false, confidence: 'observed', source: 'fleet:runtimeStatus'}
        ]);
    });

    test('an installed-capability refusal surfaces as observed unavailable with a safe reason', () => {
        const registryStub = {listAgents: () => [{id: 'desktop'}]};

        FleetManager.lifecycleService = {
            getRegistry: () => registryStub,
            status     : id => ({
                id,
                state        : 'unavailable',
                running      : false,
                pid          : null,
                startedAt    : null,
                exitCode     : null,
                failureReason: 'updater-disable-predicate-missing'
            })
        };

        expect(FleetManager.fleetRuntimeStatus()).toEqual([{
            agentId      : 'desktop',
            state        : 'unavailable',
            running      : false,
            confidence   : 'observed',
            source       : 'fleet:runtimeStatus',
            failureReason: 'updater-disable-predicate-missing'
        }]);
    });
});

test.describe('Neo.ai.services.fleet.FleetManager — Codex Desktop cleanup failure gates', () => {
    let calls, registryStub;

    test.beforeEach(() => {
        calls = [];
        registryStub = {
            removeAgent: id => { calls.push(['removeAgent', id]); return {success: true, id}; }
        };

        FleetManager.lifecycleService = {
            getRegistry: () => registryStub,
            stop       : async id => ({success: false, id, state: 'failed', cleanupUnresolved: true})
        };
        FleetManager.managedRoot        = '/managed/root';
        FleetManager.provisionAndStartFn = async options => {
            calls.push(['start', options.agentId]);
            return {id: options.agentId, state: 'running'};
        };
    });

    test.afterEach(() => {
        FleetManager.lifecycleService   = null;
        FleetManager.managedRoot        = null;
        FleetManager.provisionAndStartFn = null;
    });

    test('restart refuses to spawn over ambiguous residual helpers', async () => {
        await expect(FleetManager.restartAgent('desktop')).rejects.toThrow(/cleanup failed.*refusing to spawn/);

        expect(calls).toEqual([]);
    });

    test('remove refuses to deregister the owner of ambiguous residual helpers', async () => {
        await expect(FleetManager.removeAgent('desktop')).rejects.toThrow(/cleanup failed.*refusing to deregister/);

        expect(calls).toEqual([]);
    });

    test('ordinary failed harnesses retain the legacy restart and removal recovery paths', async () => {
        FleetManager.lifecycleService.stop = async id => ({success: false, id, state: 'failed', cleanupUnresolved: false});

        await expect(FleetManager.restartAgent('cli')).resolves.toMatchObject({id: 'cli', state: 'running'});
        await expect(FleetManager.removeAgent('cli')).resolves.toEqual({success: true, id: 'cli'});

        expect(calls).toEqual([['start', 'cli'], ['removeAgent', 'cli']]);
    });
});

test.describe('Neo.ai.services.fleet.FleetManager — fleetWakeStatus (roster × wake observation)', () => {
    test.afterEach(() => {
        FleetManager.lifecycleService = null;
        FleetManager.wakeStateOptions = null;
    });

    test('composes the roster with the injected wake truth sources — every registered agent gets a taxonomy row', async () => {
        FleetManager.lifecycleService = {getRegistry: () => ({listAgents: () => [{id: 'alice'}, {id: 'bob'}]})};
        FleetManager.wakeStateOptions = {
            pidFilePath             : '/x/wake-daemon.pid',
            readFile                : () => '4242',
            probeProcess            : () => {},
            readProcessCommand      : () => 'node /repo/ai/daemons/wake/daemon.mjs',
            resolveSubscriptionState: agent => agent.id === 'alice' ? 'active' : 'none'
        };

        const {capability, states} = await FleetManager.fleetWakeStatus();

        expect(capability).toMatchObject({state: 'wired', confidence: 'observed'});
        expect(states).toEqual([
            {agentId: 'alice', wake: 'on',  confidence: 'observed', source: 'fleet:wakeState'},
            {agentId: 'bob',   wake: 'off', confidence: 'observed', source: 'fleet:wakeState'}
        ]);
    });

    test('with no injected options every row is honestly unknown under a degraded/none capability — never invented', async () => {
        FleetManager.lifecycleService = {getRegistry: () => ({listAgents: () => [{id: 'alice'}]})};

        const {capability, states} = await FleetManager.fleetWakeStatus();

        expect(capability).toMatchObject({state: 'degraded', confidence: 'none'});
        expect(states).toEqual([{
            agentId   : 'alice',
            wake      : 'unknown',
            confidence: 'none',
            source    : 'fleet:wakeState',
            reason    : 'subscription read path unavailable'
        }]);
    });
});

test.describe('Neo.ai.services.fleet.FleetManager — fleetThrottleStatus (roster × throttle observation)', () => {
    test.afterEach(() => {
        FleetManager.lifecycleService     = null;
        FleetManager.throttleStateOptions = null;
    });

    test('composes the roster with an injected throttle truth source — the watchdog flip-target', async () => {
        FleetManager.lifecycleService     = {getRegistry: () => ({listAgents: () => [{id: 'alice'}, {id: 'bob'}]})};
        FleetManager.throttleStateOptions = {
            resolveThrottleState: agent => agent.id === 'alice' ? 'rate-limited' : 'none'
        };

        const {capability, states} = await FleetManager.fleetThrottleStatus();

        expect(capability).toMatchObject({state: 'wired', confidence: 'observed'});
        expect(states).toEqual([
            {agentId: 'alice', throttle: 'rate-limited', confidence: 'observed', source: 'fleet:throttleState'},
            {agentId: 'bob',   throttle: 'none',         confidence: 'observed', source: 'fleet:throttleState'}
        ]);
    });

    test('with no injected options every row is honestly unknown under degraded/none — the documented platform truth', async () => {
        FleetManager.lifecycleService = {getRegistry: () => ({listAgents: () => [{id: 'alice'}]})};

        const {capability, states} = await FleetManager.fleetThrottleStatus();

        expect(capability).toMatchObject({state: 'degraded', confidence: 'none'});
        expect(states).toEqual([{
            agentId   : 'alice',
            throttle  : 'unknown',
            confidence: 'none',
            source    : 'fleet:throttleState',
            reason    : 'no throttle truth source exists yet: watchdog-signals producer not landed'
        }]);
    });
});
