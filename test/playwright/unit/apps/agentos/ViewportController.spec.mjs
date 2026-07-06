import {setup} from '../../../setup.mjs';

setup({
    appConfig: {
        name: 'AgentOSViewportControllerRouteTest'
    }
});

import {test, expect}     from '@playwright/test';
import Neo                from '../../../../../src/Neo.mjs';
import * as core          from '../../../../../src/core/_export.mjs';
import Viewport           from '../../../../../apps/agentos/view/Viewport.mjs';
import ViewportController from '../../../../../apps/agentos/view/ViewportController.mjs';

test.describe('AgentOS.view.ViewportController — route → keeper-view tab', () => {
    function createController() {
        const tabButtons = [
            {route: '/home',     index: 0},
            {route: '/fleet',    index: 1},
            {route: '/control',  index: 2},
            {route: '/accounts', index: 3},
            {route: '/chat',     index: 4}
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
            '/control' : 'onControlRoute',
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

        controller.onControlRoute();
        expect(shell.activeIndex).toBe(2);

        controller.onAccountsRoute();
        expect(shell.activeIndex).toBe(3);

        controller.onChatRoute();
        expect(shell.activeIndex).toBe(4)
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

        expect(routes).toEqual(['/home', '/fleet', '/control', '/accounts', '/chat']);
        expect(routes.sort()).toEqual(Object.keys(ViewportController.config.routes).sort())
    })
});
