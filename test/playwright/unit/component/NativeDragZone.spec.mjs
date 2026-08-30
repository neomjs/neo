import {setup} from '../../setup.mjs';

setup({appConfig: {appName: 'TestApp'}});

import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import {test, expect} from '@playwright/test';
import Component      from '../../../../src/component/Base.mjs';

test.describe('Neo.component.Base#nativeDragZone lifecycle', () => {
    let calls, instance;

    const zone = () => ({delegate: '.entity', types: {'text/plain': 'entity:{data-record-id}'}});

    test.beforeEach(() => {
        calls = [];

        Neo.main = Neo.main || {};
        Neo.main.DomEvents = {registerPreventDefaultTargets: () => {}};
        Neo.main.addon     = {
            NativeDragSource: {
                claimsEvent: () => false,
                register   : data => calls.push(['register',   data.windowId, data.ownerId, data.delegate]),
                unregister : data => calls.push(['unregister', data.windowId, data.ownerId])
            }
        }
    });

    test.afterEach(() => {
        instance?.destroy();
        instance = null;
        delete Neo.main.addon;
        delete Neo.main.DomEvents
    });

    test('the declaration reaches the addon on mount, not before', () => {
        instance = Neo.create(Component, {appName: 'TestApp', nativeDragZone: zone(), windowId: 1});

        expect(calls).toEqual([]);

        instance.mounted = true;

        expect(calls).toEqual([['register', 1, instance.id, '.entity']])
    });

    test('a pre-mount reset drops the pending send and never touches the remote', () => {
        instance = Neo.create(Component, {appName: 'TestApp', nativeDragZone: zone(), windowId: 1});

        instance.nativeDragZone = null;
        instance.mounted        = true;

        expect(calls).toEqual([])
    });

    test('a reactive replacement retires the held registration and issues the successor', () => {
        instance = Neo.create(Component, {appName: 'TestApp', nativeDragZone: zone(), windowId: 1});
        instance.mounted = true;

        instance.nativeDragZone = {delegate: '.other', types: {}};

        expect(calls).toEqual([
            ['register',   1, instance.id, '.entity'],
            ['unregister', 1, instance.id],
            ['register',   1, instance.id, '.other']
        ])
    });

    test('destroy retires the registration in the realm that holds it', () => {
        instance = Neo.create(Component, {appName: 'TestApp', nativeDragZone: zone(), windowId: 1});
        instance.mounted = true;

        const id = instance.id;

        instance.destroy();
        instance = null;

        expect(calls).toEqual([
            ['register',   1, id, '.entity'],
            ['unregister', 1, id]
        ])
    });

    test('a window transfer retires in the OLD realm and re-registers with the NEW mount', () => {
        instance = Neo.create(Component, {appName: 'TestApp', nativeDragZone: zone(), windowId: 1});
        instance.mounted = true;

        // the transfer: the component leaves window 1...
        instance.mounted  = false;
        instance.windowId = 2;

        // ...the unregister must address window 1, where the registration lives
        expect(calls).toEqual([
            ['register',   1, instance.id, '.entity'],
            ['unregister', 1, instance.id]
        ]);

        // ...and the re-registration waits for the mount in window 2
        instance.mounted = true;

        expect(calls[2]).toEqual(['register', 2, instance.id, '.entity'])
    });

    test('a never-registered declaration destroys without a remote call', () => {
        instance = Neo.create(Component, {appName: 'TestApp', nativeDragZone: zone(), windowId: 1});

        instance.destroy();
        instance = null;

        expect(calls).toEqual([])
    });
});
