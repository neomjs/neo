import {setup} from '../../../setup.mjs';

setup({appConfig: {name: 'AgentOSShellRouteTest'}});

import {expect, test} from '@playwright/test';
import Neo            from '../../../../../src/Neo.mjs';
import * as core      from '../../../../../src/core/_export.mjs';

test.describe('AgentOS packaged Fleet window routing', () => {
    test('resolves from live membership on every call and uses the boot id only before registration', async () => {
        const {resolveFleetWindowId} = await import('../../../../../apps/agentos/app.mjs');
        const windows                = [
            {appName: 'AgentOS', id: 'popup'},
            {appName: 'AgentOS', id: 'primary'}
        ];

        expect(resolveFleetWindowId({apps: {popup: {}}, fallbackWindowId: 'popup', windows})).toBe('popup');

        windows.shift();
        expect(resolveFleetWindowId({apps: {popup: {}}, fallbackWindowId: 'popup', windows})).toBe('primary');

        windows.length = 0;
        expect(resolveFleetWindowId({apps: {popup: {}}, fallbackWindowId: 'popup', windows})).toBe('popup');
        expect(resolveFleetWindowId({apps: {}, fallbackWindowId: 'popup', windows})).toBeNull()
    })

    test('derives shell versus browser transport from the existing worker URL envelope', async () => {
        const {resolveFleetTransportMode} = await import('../../../../../apps/agentos/app.mjs');

        expect(resolveFleetTransportMode({href: 'app://neo-agentos/index.html', search: ''})).toBe('shell');
        expect(resolveFleetTransportMode({href: 'http://127.0.0.1:8080/apps/agentos/', search: '?fleetUrl=x'})).toBe('browser');
        expect(resolveFleetTransportMode({href: 'https://example.test/apps/agentos/', search: ''})).toBe('browser');
        expect(() => resolveFleetTransportMode({search: ''})).toThrow()
    })

    test('session custody: establish stamps the profile, retire clears the launcher slot, a throwing install rolls back', async () => {
        const {establishFleetSessionCustody} = await import('../../../../../apps/agentos/app.mjs');
        const
            bearer   = 'A'.repeat(43),
            fleetUrl = 'http://127.0.0.1:8083/fleet';

        // establish + retire: a live-bearer install clears the pre-boot slot and carries the identity fact
        const
            calls  = [],
            target = {AgentOS: {fleet: {bearerToken: bearer}}},
            bridge = establishFleetSessionCustody({
                bearerToken: bearer,
                fleetUrl,
                installImpl: opts => { calls.push(opts); return {installed: true} },
                target
            });

        expect(bridge).toEqual({installed: true});
        expect(calls).toEqual([{bearerToken: bearer, profileId: `fleet-profile:v1:${fleetUrl}`, target, url: fleetUrl}]);
        expect('bearerToken' in target.AgentOS.fleet, 'retire: custody established means the slot is no longer residence').toBe(false);

        // rollback: a throwing install leaves the slot untouched for the next producer or retry
        const rollbackTarget = {AgentOS: {fleet: {bearerToken: bearer}}};

        expect(() => establishFleetSessionCustody({
            bearerToken: bearer,
            fleetUrl,
            installImpl: () => { throw new Error('install refused') },
            target     : rollbackTarget
        })).toThrow('install refused');
        expect(rollbackTarget.AgentOS.fleet.bearerToken).toBe(bearer);

        // fail-closed boot: no bearer means nothing established, so nothing retires
        const idleTarget = {AgentOS: {fleet: {}}};

        establishFleetSessionCustody({fleetUrl, installImpl: () => ({}), target: idleTarget});
        expect(idleTarget.AgentOS.fleet).toEqual({})
    })
});
