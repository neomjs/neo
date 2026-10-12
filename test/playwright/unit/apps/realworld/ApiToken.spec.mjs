import {setup} from '../../../setup.mjs';

setup({appConfig: {name: 'RealWorldApiTokenTest'}});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../src/Neo.mjs';
import * as core      from '../../../../../src/core/_export.mjs';
import '../../../../../src/manager/Instance.mjs';

/**
 * @summary Pins that both RealWorld apps' API singletons share one stored-token read and all become ready on it.
 *
 * The singletons used to coordinate through a static `on('ready')` / `fire('ready')` on their Base class, which no
 * class provides: `static observable` applies `Neo.core.Observable` to instances only. Every singleton after the
 * first threw on construction, so the apps could not boot, and the middleware's SSR of `/apps/realworld2` failed.
 */
test.describe('RealWorld API singletons: one token read, every singleton ready', () => {
    let reads;

    test.beforeAll(() => {
        reads = [];

        Neo.ns('Neo.main.addon', true).LocalStorage = {
            readLocalStorageItem: async ({key}) => {
                reads.push(key);
                return {value: 'stored-token'}
            }
        }
    });

    for (const {app, appName} of [{app: 'realworld2', appName: 'RealWorld2'}, {app: 'realworld', appName: 'RealWorld'}]) {
        test(`${app}: every API singleton becomes ready on the one stored token, and none throws`, async () => {
            // The first app waits for its own rendered app before reading the token
            Neo.appsByName = {...Neo.appsByName, [appName]: [{name: appName, vnodeInitialized: true, on() {}}]};

            const before  = reads.length,
                  modules = await Promise.all(['Article', 'Favorite', 'Profile', 'Tag', 'User']
                      .map(name => import(`../../../../../apps/${app}/api/${name}.mjs`))),
                  apis    = modules.map(module => module.default);

            // `isReady` alone proves nothing: core.Base raises it once initAsync resolves. The token header is the outcome.
            await expect.poll(() => apis.map(api => api.defaultHeaders?.Authorization),
                {message: 'every singleton carries the stored token'}).toEqual(apis.map(() => 'Token stored-token'));
            expect(reads.length - before, 'one token read serves every singleton').toBe(1)
        })
    }
});
