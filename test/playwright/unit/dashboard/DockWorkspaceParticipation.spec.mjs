import {setup} from '../../setup.mjs';

setup({
    appConfig: {
        name: 'NeoDashboardDockWorkspaceParticipationTest'
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import DockWorkspace  from '../../../../src/dashboard/dock/Workspace.mjs';
import Participation  from '../../../../src/dashboard/dock/window/Participation.mjs';

/**
 * @summary Tests for the participation the dock Workspace façade composes for a published
 * cross-window sort group (docking design record §2.3): composed once the window and the sort group
 * exist, kept across unchanged bindings, re-composed on a window change or on a host's explicit
 * recompose, adopted when supplied, declined when told to, never present without a sort group, and
 * independent of the tear-out flag. The coordinator is a stub, so each arm reads the registry calls
 * the target made rather than a real cross-window gesture.
 */

/** A one-tab document, enough for the façade to construct and project. */
function document() {
    return {
        schema: 'neo.dock.zone.v1',
        root  : 'root',
        items : {alpha: {reference: 'alpha', title: 'Alpha'}},
        nodes : {
            root       : {type: 'edge-zone', zones: {center: {nodeId: 'main-tabs'}}},
            'main-tabs': {type: 'tabs', items: ['alpha'], activeItemId: 'alpha'}
        }
    }
}

const createCoordinatorStub = calls => ({
    register  : zone => calls.push(['register', zone]),
    unregister: zone => calls.push(['unregister', zone])
});

/**
 * A tear-out workspace that publishes a cross-window sort group and its set identity — the two
 * facts the façade reads from the projection options to decide composition.
 */
class PublishingHost extends DockWorkspace {
    static config = {
        className: 'Neo.test.dashboard.dock.ParticipationPublishingHost',
        ntype    : 'test-dock-participation-publishing-host',
        /** @member {String|null} testSortGroup='dock-demo' */
        testSortGroup: 'dock-demo',
        /** @member {Object} testParticipationSeams={} */
        testParticipationSeams: {}
    }

    getDockProjectionOptions() {
        return {...super.getDockProjectionOptions(), crossWindowSortGroup: this.testSortGroup, workspaceId: 'B'}
    }

    getDockParticipationConfig() {
        return {...this.testParticipationSeams}
    }
}

Neo.setupClass(PublishingHost);

const createHost = (calls, config={}) => Neo.create(PublishingHost, {
    autoMount                 : false,
    dockModel                 : document(),
    enableDockTearOutLifecycle: true,
    windowId                  : Neo.config.windowId,
    testParticipationSeams    : {dragCoordinator: createCoordinatorStub(calls), getDocument: () => document()},
    ...config
});

test.describe('Neo.dashboard.dock.Workspace — the default participation under the tear-out lifecycle', () => {
    test('a tear-out workspace with a published sort group composes one participation whose target registered once', async () => {
        const calls = [],
              host  = createHost(calls, {dockParticipation: {module: Participation}});

        try {
            const participation = await host.participationPromise;

            expect(participation).toBe(host.participation);
            expect(participation).toBeInstanceOf(Participation);
            expect(participation.workspace).toBe(host);
            expect(participation.windowId).toBe(Neo.config.windowId);
            expect(participation.workspaceId, 'the identity the host publishes to its drag sources').toBe('B');
            expect(participation.sortGroup).toBe('dock-demo');
            expect(calls.map(([action]) => action)).toEqual(['register']);
            expect(calls[0][1]).toBe(participation.target)
        } finally {
            host.destroy()
        }
    });

    test('the engine default is the lazily imported engine class, carrying the host\'s seams', async () => {
        const calls = [],
              host  = createHost(calls);

        try {
            expect(host.dockParticipation, 'the declaration stays the opt-in default').toBe(true);

            const participation = await host.participationPromise;

            expect(participation).toBeInstanceOf(Participation);
            expect(participation.target.dragCoordinator, 'a host seam reached the composed instance').toBe(host.testParticipationSeams.dragCoordinator);
            expect(calls.map(([action]) => action)).toEqual(['register'])
        } finally {
            host.destroy()
        }
    });

    test('unchanged bindings keep the registered instance across syncs; a window change composes a fresh one', async () => {
        const calls = [],
              host  = createHost(calls, {dockParticipation: {module: Participation}});

        try {
            const first = await host.participationPromise;

            await host.syncDockParticipation();
            await host.syncDockParticipation();
            expect(host.participation, 'an ordinary sync is a no-op').toBe(first);
            expect(calls).toHaveLength(1);

            Neo.manager.Window.register({id: 'participation-rebound', innerRect: {x: 0, y: 0, width: 800, height: 600}, outerRect: {x: 0, y: 0, width: 800, height: 600}});
            host.windowId = 'participation-rebound';

            const second = await host.participationPromise;

            expect(first.isDestroyed).toBe(true);
            expect(second).not.toBe(first);
            expect(second.windowId).toBe('participation-rebound');
            expect(calls.map(([action]) => action)).toEqual(['register', 'unregister', 'register']);
            expect(calls[1][1]).toBe(first.target ?? calls[0][1]);
            expect(calls[2][1]).toBe(second.target)
        } finally {
            host.destroy();
            Neo.manager.Window.unregister('participation-rebound')
        }
    });

    test('a host that changed its seams asks for a recompose; a later binding (the set) re-composes on its own', async () => {
        const calls = [],
              host  = createHost(calls, {dockParticipation: {module: Participation}});

        try {
            const first = await host.participationPromise;

            const recomposed = await host.syncDockParticipation({recompose: true});

            expect(first.isDestroyed).toBe(true);
            expect(recomposed).toBe(host.participation);
            expect(recomposed).not.toBe(first);

            host.workspaceSet = {};

            const bound = await host.syncDockParticipation();

            expect(recomposed.isDestroyed).toBe(true);
            expect(bound.workspaceSet, 'the set the host supplied after construction is bound').toBe(host.workspaceSet);
            expect(calls.map(([action]) => action)).toEqual(['register', 'unregister', 'register', 'unregister', 'register'])
        } finally {
            host.destroy()
        }
    });

    test('destroying the workspace unregisters and releases the participation it owns', async () => {
        const calls = [],
              host  = createHost(calls, {dockParticipation: {module: Participation}});

        const participation = await host.participationPromise;

        host.destroy();

        expect(participation.isDestroyed).toBe(true);
        expect(calls.map(([action]) => action)).toEqual(['register', 'unregister']);
        expect(host.participation ?? null).toBeNull()
    });

    test('a supplied instance is adopted once, never duplicated, and stays its creator\'s to destroy', async () => {
        const calls    = [],
              supplied = Neo.create(Participation, {
                  dragCoordinator: createCoordinatorStub(calls),
                  getDocument    : () => document(),
                  sortGroup      : 'dock-demo',
                  windowId       : Neo.config.windowId,
                  workspaceId    : 'B'
              });

        const host = createHost([], {dockParticipation: supplied});

        try {
            expect(await host.participationPromise).toBe(supplied);
            await host.syncDockParticipation();
            expect(host.participation).toBe(supplied);
            expect(calls.map(([action]) => action), 'the façade registered nothing of its own').toEqual(['register']);

            host.destroy();

            expect(supplied.isDestroyed, 'an adopted instance survives its adopter').not.toBe(true);
            expect(calls.map(([action]) => action)).toEqual(['register'])
        } finally {
            supplied.destroy()
        }
    });

    test('the opt-in is the published sort group, not the tear-out flag: a vessel workspace with the lifecycle off still composes', async () => {
        const calls = [],
              host  = createHost(calls, {dockParticipation: {module: Participation}, enableDockTearOutLifecycle: false});

        try {
            const participation = await host.participationPromise;

            expect(participation).toBeInstanceOf(Participation);
            expect(participation.sortGroup).toBe('dock-demo');
            expect(calls.map(([action]) => action)).toEqual(['register'])
        } finally {
            host.destroy()
        }
    });

    test('declined, or without a published sort group: nothing is composed', async () => {
        const arms = [
            ['declined with null',  {dockParticipation: null}],
            ['declined with false', {dockParticipation: false}],
            ['no sort group',       {dockParticipation: {module: Participation}, testSortGroup: null}]
        ];

        for (const [label, config] of arms) {
            const calls = [],
                  host  = createHost(calls, config);

            try {
                expect(await host.participationPromise, label).toBeNull();
                expect(host.participation, label).toBeNull();
                expect(calls, label).toEqual([])
            } finally {
                host.destroy()
            }
        }
    });

    test('a bare tear-out workspace — the Fleet Manager cockpit\'s shape — composes nothing', async () => {
        const host = Neo.create(DockWorkspace, {
            autoMount                 : false,
            dockModel                 : document(),
            enableDockTearOutLifecycle: true,
            windowId                  : Neo.config.windowId
        });

        try {
            expect(host.dockParticipation).toBe(true);
            expect(await host.participationPromise).toBeNull();
            expect(host.participation).toBeNull()
        } finally {
            host.destroy()
        }
    })
});
