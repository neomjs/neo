import {setup} from '../../setup.mjs';

setup({
    appConfig: {
        name: 'ControllerBaseRouteTest'
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import Controller     from '../../../../src/controller/Base.mjs';
import HashHistory    from '../../../../src/util/HashHistory.mjs';

/**
 * @class Test.Unit.Controller.Base.RootRouteController
 * @extends Neo.controller.Base
 */
class RootRouteController extends Controller {
    static config = {
        className  : 'Test.Unit.Controller.Base.RootRouteController',
        defaultHash: '/',
        routes     : {
            '/'    : 'onHome',
            '/home': 'onHome'
        }
    }

    hits = []

    onHome(params, value) {
        this.hits.push(value.hashString)
    }
}

Neo.setupClass(RootRouteController);

/**
 * @class Test.Unit.Controller.Base.DefaultHashFallbackController
 * @extends Neo.controller.Base
 */
class DefaultHashFallbackController extends Controller {
    static config = {
        className  : 'Test.Unit.Controller.Base.DefaultHashFallbackController',
        defaultHash: '/home',
        routes     : {
            '/home': 'onHome'
        }
    }

    hits      = []
    unmatched = []

    onHome(params, value) {
        this.hits.push(value.hashString)
    }

    onNoRouteFound(value) {
        this.unmatched.push(value.hashString)
    }
}

Neo.setupClass(DefaultHashFallbackController);

test.describe('Neo.controller.Base root and defaultHash routing', () => {
    test.beforeEach(() => {
        HashHistory.stacks = {}
    });

    test('dispatches an explicit \'/\' route handler directly without redirecting', async () => {
        const setRouteCalls = [],
              origHash      = Neo.config.hash,
              origSetRoute  = Neo.Main.setRoute;

        Neo.config.hash   = {hash: {'/': ''}, hashString: '/', windowId: 1};
        Neo.Main.setRoute = data => setRouteCalls.push(data);

        const controller = Neo.create(RootRouteController, {windowId: 1});
        await controller.ready();

        try {
            await controller.onHashChange({hash: {'/': ''}, hashString: '/', windowId: 1}, null);

            expect(controller.hits).toEqual(['/']);
            expect(setRouteCalls).toEqual([])
        } finally {
            controller.destroy();
            origHash === undefined ? delete Neo.config.hash : Neo.config.hash = origHash;
            Neo.Main.setRoute = origSetRoute
        }
    });

    test('replaces an unmatched \'/\' root route with defaultHash when no \'/\' handler or defaultRoute exists', async () => {
        const setRouteCalls = [],
              origHash      = Neo.config.hash,
              origSetRoute  = Neo.Main.setRoute;

        Neo.config.hash   = {hash: {'/': ''}, hashString: '/', windowId: 2};
        Neo.Main.setRoute = data => setRouteCalls.push(data);

        const controller = Neo.create(DefaultHashFallbackController, {windowId: 2});
        await controller.ready();

        try {
            await controller.onHashChange({hash: {'/': ''}, hashString: '/', windowId: 2}, null);

            expect(setRouteCalls).toEqual([{replace: true, value: '/home', windowId: 2}]);
            expect(controller.unmatched).toEqual([]);

            await controller.onHashChange({hash: {'/missing': ''}, hashString: '/missing', windowId: 2}, null);
            expect(controller.unmatched).toEqual(['/missing'])
        } finally {
            controller.destroy();
            origHash === undefined ? delete Neo.config.hash : Neo.config.hash = origHash;
            Neo.Main.setRoute = origSetRoute
        }
    })
});
