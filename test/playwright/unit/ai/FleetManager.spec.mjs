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

/** Reset the singleton's injectable config between serial cases. */
function reset() {
    FleetManager.managedRoot         = null;
    FleetManager.lifecycleService    = null;
    FleetManager.provisionAndStartFn = null;
    FleetManager.repoStatusFn        = null;
}

// Singleton-stateful service → serial, with env + injected-config reset per case.
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

    test('getManagedRoot: a __dirname-relative default when neither config nor env is set (no hidden fallback)', () => {
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

    test('seams default to the real composers (a no-injection construction wires them)', () => {
        expect(FleetManager.getProvisionAndStartFn()).toBe(startAgentProvisioned);
        expect(FleetManager.getRepoStatusFn()).toBe(inspectFleetRepos);
    });
});
