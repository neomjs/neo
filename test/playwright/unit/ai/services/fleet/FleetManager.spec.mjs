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

test.describe('Neo.ai.services.fleet.FleetManager.setRepo — fleet-authority definition-update delegation', () => {
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

    test('records repoUrl + dataDir under metadata via the registry partial-update', () => {
        const result = FleetManager.setRepo('alice', {repoUrl: 'https://github.com/x/y', dataDir: '/data/y'});

        expect(calls).toEqual([['updateAgent', 'alice', {metadata: {repoUrl: 'https://github.com/x/y', dataDir: '/data/y'}}]]);
        expect(result.metadata).toEqual({repoUrl: 'https://github.com/x/y', dataDir: '/data/y'});
    });

    test('omits an unset facet — no null/undefined leaks into the merged metadata', () => {
        FleetManager.setRepo('alice', {repoUrl: 'https://github.com/x/y'});

        expect(calls).toEqual([['updateAgent', 'alice', {metadata: {repoUrl: 'https://github.com/x/y'}}]]);
    });

    test('with no facets passes an empty metadata patch (a safe no-op merge, not a wipe)', () => {
        FleetManager.setRepo('alice', {});

        expect(calls).toEqual([['updateAgent', 'alice', {metadata: {}}]]);
    });

    test('forwards the registry null (unknown agent) verbatim — no partial definition invented', () => {
        registryStub.updateAgent = (id, patch) => { calls.push(['updateAgent', id, patch]); return null; };

        expect(FleetManager.setRepo('ghost', {repoUrl: 'https://github.com/x/y'})).toBeNull();
    });
});
