import {setup} from '../../setup.mjs';

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name             : 'FleetManagerTest',
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect}          from '@playwright/test';

import Neo                     from '../../../../src/Neo.mjs';
import * as core               from '../../../../src/core/_export.mjs';
import FleetManager            from '../../../../ai/services/fleet/FleetManager.mjs';
import {inspectFleetRepos}     from '../../../../ai/services/fleet/inspectFleetRepos.mjs';
import {startAgentProvisioned} from '../../../../ai/services/fleet/startAgentProvisioned.mjs';
import path                    from 'path';

const ENV_KEY = 'NEO_FLEET_MANAGED_ROOT';
let savedEnv;

/** Reset the singleton's injectable plain fields between serial cases. */
function reset() {
    FleetManager.managedRoot         = null;
    FleetManager.lifecycleService    = null;
    FleetManager.provisionAndStartFn = null;
    FleetManager.repoStatusFn        = null;
}

// Singleton-stateful service → serial, with env + injected-field reset per case.
test.describe.configure({mode: 'serial'});

test.describe('Neo.ai.services.fleet.FleetManager', () => {
    test.beforeEach(() => { savedEnv = process.env[ENV_KEY]; delete process.env[ENV_KEY]; reset(); });
    test.afterEach(()  => {
        if (savedEnv === undefined) delete process.env[ENV_KEY]; else process.env[ENV_KEY] = savedEnv;
        reset();
    });

    test('getManagedRoot: the managedRoot field wins over env + default', () => {
        FleetManager.managedRoot = '/explicit/root';
        process.env[ENV_KEY]     = '/env/root';
        expect(FleetManager.getManagedRoot()).toBe('/explicit/root');
    });

    test('getManagedRoot: env wins when no managedRoot field is set', () => {
        process.env[ENV_KEY] = '/env/root';
        expect(FleetManager.getManagedRoot()).toBe('/env/root');
    });

    test('getManagedRoot: a __dirname-relative default when neither the managedRoot field nor env is set (no hidden fallback)', () => {
        const root = FleetManager.getManagedRoot();
        expect(path.isAbsolute(root)).toBe(true);
        expect(root.endsWith(path.join('.neo-ai-data', 'fleet', 'repos'))).toBe(true);
    });

    test('startAgent provisions+starts via the composer with the resolved root + lifecycle service', async () => {
        const lifecycle = {getRegistry: () => ({}), isRunning: () => false, status: () => ({}), start: () => ({})},
              calls     = [];

        FleetManager.managedRoot         = '/managed/root';
        FleetManager.lifecycleService    = lifecycle;
        FleetManager.provisionAndStartFn = async args => { calls.push(args); return {state: 'running'}; };

        const status = await FleetManager.startAgent('agent-a');

        expect(calls).toHaveLength(1);
        expect(calls[0]).toMatchObject({lifecycleService: lifecycle, managedRoot: '/managed/root', agentId: 'agent-a'});
        expect(status.state).toBe('running');
    });

    test('fleetRepoStatus inspects via the aggregator with the resolved root + the lifecycle registry', () => {
        const registry  = {marker: 'reg'},
              lifecycle = {getRegistry: () => registry},
              calls     = [];

        FleetManager.managedRoot      = '/managed/root';
        FleetManager.lifecycleService = lifecycle;
        FleetManager.repoStatusFn     = args => { calls.push(args); return [{agentId: 'a'}]; };

        const result = FleetManager.fleetRepoStatus();

        expect(calls).toHaveLength(1);
        expect(calls[0]).toMatchObject({registry, managedRoot: '/managed/root'});
        expect(result).toEqual([{agentId: 'a'}]);
    });

    test('stopAgent delegates to the lifecycle service stop with the agent id', async () => {
        const calls     = [],
              lifecycle = {stop: id => { calls.push(id); return Promise.resolve({success: true, id, state: 'stopped'}); }};

        FleetManager.lifecycleService = lifecycle;

        const result = await FleetManager.stopAgent('agent-a');

        expect(calls).toEqual(['agent-a']);
        expect(result).toMatchObject({success: true, id: 'agent-a', state: 'stopped'});
    });

    test('restartAgent stops then re-starts via the PROVISIONED path (preserving the repo cwd)', async () => {
        const order     = [],
              lifecycle = {stop: id => { order.push(`stop:${id}`); return Promise.resolve({success: true, id, state: 'stopped'}); }};

        FleetManager.managedRoot         = '/managed/root';
        FleetManager.lifecycleService    = lifecycle;
        FleetManager.provisionAndStartFn = async args => { order.push(`provisionStart:${args.agentId}`); return {state: 'running'}; };

        const status = await FleetManager.restartAgent('agent-a');

        // stop runs BEFORE the provisioned start, and the start goes through the provision-then-start
        // composer (NOT lifecycleService.restart, which the stub deliberately omits) → the restarted
        // agent re-runs in its provisioned checkout, not the Fleet Manager's dir.
        expect(order).toEqual(['stop:agent-a', 'provisionStart:agent-a']);
        expect(status.state).toBe('running');
    });

    test('removeAgent stops the process THEN deregisters via the registry', async () => {
        const order     = [],
              registry  = {removeAgent: id => { order.push(`deregister:${id}`); return {success: true, id}; }},
              lifecycle = {
                  stop       : id => { order.push(`stop:${id}`); return Promise.resolve({success: true, id, state: 'stopped'}); },
                  getRegistry: () => registry
              };

        FleetManager.lifecycleService = lifecycle;

        const result = await FleetManager.removeAgent('agent-a');

        // stop precedes deregister — a running agent is never deregistered while live.
        expect(order).toEqual(['stop:agent-a', 'deregister:agent-a']);
        expect(result).toEqual({success: true, id: 'agent-a'});
    });

    test('removeAgent on a non-running agent: stop is a safe no-op, deregister still proceeds', async () => {
        const order     = [],
              registry  = {removeAgent: id => { order.push(`deregister:${id}`); return {success: false, id}; }},
              // a non-running agent: stop resolves {success:false} without an exit — removal must still deregister.
              lifecycle = {
                  stop       : id => { order.push(`stop:${id}`); return Promise.resolve({success: false, id, state: 'stopped'}); },
                  getRegistry: () => registry
              };

        FleetManager.lifecycleService = lifecycle;

        const result = await FleetManager.removeAgent('absent-agent');

        // stop's {success:false} (not running) does NOT short-circuit removal; deregister still runs.
        expect(order).toEqual(['stop:absent-agent', 'deregister:absent-agent']);
        expect(result).toEqual({success: false, id: 'absent-agent'});
    });

    test('seams default to the real composers (a no-injection construction wires them)', () => {
        expect(FleetManager.getProvisionAndStartFn()).toBe(startAgentProvisioned);
        expect(FleetManager.getRepoStatusFn()).toBe(inspectFleetRepos);
    });
});
