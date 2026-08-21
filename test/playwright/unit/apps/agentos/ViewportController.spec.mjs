import {setup} from '../../../setup.mjs';

setup({
    appConfig: {
        name: 'AgentOSViewportControllerRouteTest'
    }
});

import {test, expect}     from '@playwright/test';
import Neo                from '../../../../../src/Neo.mjs';
import * as core          from '../../../../../src/core/_export.mjs';
import AgentDefinitions   from '../../../../../apps/agentos/store/AgentDefinitions.mjs';
import FleetTenants       from '../../../../../apps/agentos/store/FleetTenants.mjs';
import Viewport           from '../../../../../apps/agentos/view/Viewport.mjs';
import ViewportController from '../../../../../apps/agentos/view/ViewportController.mjs';

test.describe('AgentOS.view.ViewportController — route → keeper-view tab', () => {
    function createController() {
        const tabButtons = [
            {route: '/home',     index: 0},
            {route: '/fleet',    index: 1},
            {route: '/accounts', index: 2},
            {route: '/chat',     index: 3}
        ];

        const shell = {
            activeIndex: null,
            getTabBar  : () => ({items: tabButtons})
        };

        const controller = Object.create(ViewportController.prototype);

        controller.getReference = reference => reference === 'shell' ? shell : null;

        return {controller, shell}
    }

    test('declares routes for each left-rail keeper-view', () => {
        expect(ViewportController.config.routes).toEqual({
            '/accounts': 'onAccountsRoute',
            '/chat'    : 'onChatRoute',
            '/fleet'   : 'onFleetRoute',
            '/home'    : 'onHomeRoute'
        })
    });

    test('activates the Fleet keeper-view from the fleet route without a hardcoded array lookup', () => {
        const {controller, shell} = createController();

        controller.onFleetRoute();

        expect(shell.activeIndex).toBe(1)
    });

    test('activates every shell route by matching the tab header route', () => {
        const {controller, shell} = createController();

        controller.onHomeRoute();
        expect(shell.activeIndex).toBe(0);

        controller.onAccountsRoute();
        expect(shell.activeIndex).toBe(2);

        controller.onChatRoute();
        expect(shell.activeIndex).toBe(3)
    });

    test('leaves the active shell view unchanged when the route has no tab match', () => {
        const {controller, shell} = createController();

        shell.activeIndex = 1;

        controller.activateRoute('/unknown');

        expect(shell.activeIndex).toBe(1)
    });

    test('keeps the authored shell header routes aligned with the controller routes', () => {
        const shellConfig = Viewport.config.items.find(item => item.reference === 'shell'),
              routes      = shellConfig.items.map(item => item.header.route);

        expect(routes).toEqual(['/home', '/fleet', '/accounts', '/chat']);
        expect(routes.sort()).toEqual(Object.keys(ViewportController.config.routes).sort())
    })
});

test.describe('AgentOS.view.Viewport — accepted-definition composition boundary', () => {
    test('hosts the exact shared definition and public-tenant Stores at the Viewport provider root', () => {
        const stores = Viewport.config.stateProvider.stores;

        expect(stores.agentDefinitions).toEqual({module: AgentDefinitions});
        expect(stores.fleetTenants).toEqual({module: FleetTenants})
    });

    test('authors the Accounts intent listener and FleetCockpit reference at the shared owner', () => {
        const
            shellConfig  = Viewport.config.items.find(item => item.reference === 'shell'),
            fleetConfig  = shellConfig.items.find(item => item.header.route === '/fleet'),
            accountsHost = shellConfig.items.find(item => item.header.route === '/accounts'),
            accounts     = accountsHost.items.find(item => item.reference === 'accounts');

        expect(fleetConfig.reference).toBe('fleet-cockpit');
        expect(accounts.listeners).toEqual({agentDefinitionAccepted: 'up.onAgentDefinitionAccepted'})
    });

    test('refreshes the separate Fleet roster only for a valid accepted definition', async () => {
        const
            calls   = [],
            cockpit = {loadRoster: async () => calls.push('loadRoster')},
            stub    = {getReference: reference => reference === 'fleet-cockpit' ? cockpit : null};

        await expect(Viewport.prototype.onAgentDefinitionAccepted.call(stub, {agent: {id: 'resident-42'}}))
            .resolves.toBe(true);
        expect(calls).toEqual(['loadRoster']);

        await expect(Viewport.prototype.onAgentDefinitionAccepted.call(stub, {agent: {}}))
            .resolves.toBe(false);
        expect(calls).toEqual(['loadRoster'])
    });

    test('#17368: an UNREADABLE store warns instead of looking like a fresh install', async () => {
        // The worse half of the defect. The caller collapsed a storage-read failure into `value = null`,
        // which is also what an unset key looks like — so the roster is intact on disk, maximally
        // recoverable, and the operator is told nothing while the UI seeds one instance and appears
        // completely normal.
        const warnings     = [],
              originalLS   = Neo.main?.addon?.LocalStorage,
              originalWarn = console.warn;

        // `resolveFleetUrl()` reads `Neo.config.url.search` when it seeds the boot profile, which the
        // unit harness does not set. Harness scaffolding, downstream of the warning under test.
        Neo.config.url       = Neo.config.url || {search: ''};
        Neo.main             = Neo.main       || {};
        Neo.main.addon       = Neo.main.addon || {};
        Neo.main.addon.LocalStorage = {readLocalStorageItem: async () => {throw new Error('storage denied')}};
        console.warn         = (...args) => warnings.push(args.join(' '));

        const stub = {
            windowId : 1,
            component: {stateProvider: {getStore: () => ({add() {}, get: () => null})}},
            persistInstanceRoster() {},
            syncBoundInstance() {}
        };

        try {
            await ViewportController.prototype.initInstanceRoster.call(stub);
        } finally {
            console.warn                = originalWarn;
            Neo.main.addon.LocalStorage = originalLS
        }

        expect(warnings.some(line => /storage unreadable/.test(line))).toBe(true);
        // The message must tell the operator their instances are missing, not merely that a read
        // failed — the actionable fact is what they are no longer seeing.
        expect(warnings.some(line => /configured instances/.test(line))).toBe(true)
    });

    test('#17368 CONTROL: a readable, absent key warns NOTHING — first boot must stay quiet', async () => {
        // Without this pair the arm above is satisfied by a build that warns on every startup.
        const warnings     = [],
              originalLS   = Neo.main?.addon?.LocalStorage,
              originalWarn = console.warn;

        // `resolveFleetUrl()` reads `Neo.config.url.search` when it seeds the boot profile, which the
        // unit harness does not set. Harness scaffolding, downstream of the warning under test.
        Neo.config.url       = Neo.config.url || {search: ''};
        Neo.main             = Neo.main       || {};
        Neo.main.addon       = Neo.main.addon || {};
        Neo.main.addon.LocalStorage = {readLocalStorageItem: async () => ({value: null})};
        console.warn         = (...args) => warnings.push(args.join(' '));

        const stub = {
            windowId : 1,
            component: {stateProvider: {getStore: () => ({add() {}, get: () => null})}},
            persistInstanceRoster() {},
            syncBoundInstance() {}
        };

        try {
            await ViewportController.prototype.initInstanceRoster.call(stub);
        } finally {
            console.warn                = originalWarn;
            Neo.main.addon.LocalStorage = originalLS
        }

        expect(warnings.filter(line => /instance roster/.test(line))).toEqual([])
    });

    test('fails closed when the Fleet cockpit is absent', async () => {
        const stub = {getReference: () => null};

        await expect(Viewport.prototype.onAgentDefinitionAccepted.call(stub, {agent: {id: 'resident-42'}}))
            .resolves.toBe(false)
    })
});
