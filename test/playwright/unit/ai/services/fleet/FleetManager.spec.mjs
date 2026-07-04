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
            {agentId: 'alice', state: 'running', running: true,  confidence: 'observed', source: 'fleet:runtimeStatus'},
            {agentId: 'bob',   state: 'stopped', running: false, confidence: 'inferred', source: 'fleet:runtimeStatus'}
        ]);
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
});
