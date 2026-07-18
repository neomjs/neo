import {setup} from '../../../../../setup.mjs';

setup({
    neoConfig: {unitTestMode: true},
    appConfig: {name: 'FleetCatchUpCockpitTest', isMounted: () => true, vnodeInitialising: false}
});

import {expect, test} from '@playwright/test';
import Neo            from '../../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../../src/core/_export.mjs';
import FleetCockpit   from '../../../../../../../apps/agentos/view/fleet/FleetCockpit.mjs';

const clearBridge = () => { delete globalThis.AgentOS?.fleet };

test.describe('FleetCockpit — catch-up owner routing', () => {
    test.afterEach(() => clearBridge());

    test('load routes to the authenticated verb and writes both owner and live pane', async () => {
        const snapshot = {capability: {state: 'wired'}, partition: '@neo-opus-ada', window: {}, sources: {}},
              pane     = {},
              calls    = [],
              cockpit  = {
                  catchUpReadGeneration: 0,
                  catchUpSnapshot      : null,
                  isDestroyed          : false,
                  getReference         : ref => ref === 'catch-up' ? pane : null
              };

        (globalThis.AgentOS ??= {}).fleet = {registryBridge: {fleetHistory: async params => { calls.push(params); return snapshot; }}};

        await expect(FleetCockpit.prototype.loadCatchUp.call(cockpit, {partition: '@neo-opus-ada'})).resolves.toBe(snapshot);
        expect(calls).toEqual([{partition: '@neo-opus-ada'}]);
        expect(cockpit.catchUpSnapshot).toBe(snapshot);
        expect(pane.snapshot).toBe(snapshot)
    });

    test('unwired/throw read and unwired/throw mark remain explicit, never empty or advanced', async () => {
        const pane = {},
              make = () => ({
                  catchUpReadGeneration: 0,
                  catchUpSnapshot      : null,
                  catchUpMarkOutcome   : null,
                  isDestroyed          : false,
                  getReference         : ref => ref === 'catch-up' ? pane : null
              });

        clearBridge();
        await expect(FleetCockpit.prototype.loadCatchUp.call(make(), {partition: 'unified'}))
            .resolves.toMatchObject({capability: {state: 'unavailable'}, sources: null});
        await expect(FleetCockpit.prototype.markCatchUp.call(make(), {windowEnd: '2026-07-18T12:00:00.000Z'}))
            .resolves.toEqual({status: 'not-wired', reason: 'fleet catch-up mark verb not wired'});

        (globalThis.AgentOS ??= {}).fleet = {registryBridge: {
            fleetHistory     : async () => { throw new Error('secret read detail') },
            markFleetCaughtUp: async () => { throw new Error('secret write detail') }
        }};
        await expect(FleetCockpit.prototype.loadCatchUp.call(make()))
            .resolves.toMatchObject({capability: {state: 'unavailable', reason: 'fleet history read failed'}, sources: null});
        await expect(FleetCockpit.prototype.markCatchUp.call(make(), {windowEnd: '2026-07-18T12:00:00.000Z'}))
            .resolves.toEqual({status: 'error', reason: 'fleet catch-up mark failed'})
    });

    test('an older read loses the generation race', async () => {
        let resolveOld;
        const pane    = {},
              cockpit = {
                  catchUpReadGeneration: 0,
                  catchUpSnapshot      : null,
                  isDestroyed          : false,
                  getReference         : ref => ref === 'catch-up' ? pane : null
              },
              old = new Promise(resolve => { resolveOld = resolve });

        let reads = 0;
        (globalThis.AgentOS ??= {}).fleet = {registryBridge: {fleetHistory: () => ++reads === 1 ? old : Promise.resolve({id: 'new'})}};

        const first  = FleetCockpit.prototype.loadCatchUp.call(cockpit),
              second = FleetCockpit.prototype.loadCatchUp.call(cockpit);

        await second;
        resolveOld({id: 'old'});
        await first;

        expect(cockpit.catchUpSnapshot).toEqual({id: 'new'});
        expect(pane.snapshot).toEqual({id: 'new'})
    });

    test('partition choices come from roster mailbox identities; live adjacency focuses the real stream', () => {
        const focused = [],
              rows    = [
                  {agentId: 'ada', githubUsername: 'neo-opus-ada', displayName: 'Ada'},
                  {agentId: 'guest', githubUsername: null, displayName: 'Guest'}
              ],
              stream = {id: 'stream-1', focus: (...args) => focused.push(args)},
              cockpit = {getReference: ref => ref === 'fleet-grid' ? {store: {items: rows}} : ref === 'activity-stream' ? stream : null};

        expect(FleetCockpit.prototype.buildCatchUpPartitionOptions.call(cockpit)).toEqual([
            {id: 'catch-up-ada', label: 'Ada', partition: '@neo-opus-ada'}
        ]);
        expect(FleetCockpit.prototype.openCatchUpLiveSurface.call(cockpit, {target: 'activity-stream'}))
            .toEqual({opened: true, target: 'activity-stream'});
        expect(focused).toEqual([['stream-1', false, true]])
    })
});
