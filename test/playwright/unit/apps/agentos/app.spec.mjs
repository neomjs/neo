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
});
