import {setup} from '../../setup.mjs';

setup({
    appConfig: {
        name: 'NeoGridScrollManagerHoverSyncRoutingTest'
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import ScrollManager  from '../../../../src/grid/ScrollManager.mjs';

/**
 * A remote method call to a main-thread addon is routed on the payload's `windowId`; without one the
 * worker falls back to the first connected port. In one window that is the same window, and only a
 * deprecation warning shows. With the grid in a popup the first port is the opener, whose hover-sync
 * addon holds no registration for the grid — while the popup's addon, which does, is never told. The
 * scroll manager already resolves the addon for its own window and already routes its horizontal
 * scroll sync with the key; suspend and resume of hover sync must carry the same key.
 */
const APP = 'NeoGridScrollManagerHoverSyncRoutingTest';

test.describe('Neo.grid.ScrollManager routes hover-sync suspend and resume to its own window', () => {
    const
        calls    = [],
        resolved = [],
        addon    = {
            register()      {},
            resumeHover(payload)  { calls.push({method: 'resumeHover',  payload}) },
            suspendHover(payload) { calls.push({method: 'suspendHover', payload}) },
            unregister()    {}
        };

    let manager, originalGetAddon;

    test.beforeAll(() => {
        originalGetAddon = Neo.currentWorker.getAddon;

        // The single-thread unit run has no main thread: resolve every addon to one recorder and
        // note which window it was resolved for.
        Neo.currentWorker.getAddon = async (name, windowId) => {
            resolved.push({name, windowId});
            return addon
        }
    });

    test.afterAll(() => {
        Neo.currentWorker.getAddon = originalGetAddon
    });

    test.afterEach(() => {
        manager?.destroy?.();
        manager = null;
        calls.length = resolved.length = 0
    });

    test('a scroll on a manager bound to window w2 suspends and resumes hover sync with windowId w2 in the payload', async () => {
        const
            gridBody      = {addCls() {}, removeCls() {}},
            gridContainer = {
                body               : {isScrolling: false},
                bodyEnd            : null,
                bodyStart          : null,
                headerToolbar      : null,
                horizontalScrollbar: null,
                syncBodies()       {},
                view               : {id: 'hover-sync-routing-view'}
            };

        manager = Neo.create(ScrollManager, {appName: APP, gridBody, gridContainer, windowId: 'w2'});

        // One scroll of the view: the manager suspends hover sync as scrolling starts and resumes it
        // when the scroll settles — both through the addon it resolves for its own window.
        manager.onContainerScroll({scrollLeft: 0, scrollTop: 24, target: {id: 'hover-sync-routing-view'}});

        await expect.poll(() => calls.map(call => call.method), {message: 'suspend, then resume'})
            .toEqual(['suspendHover', 'resumeHover']);

        expect(resolved.filter(entry => entry.name === 'GridRowHoverSync').map(entry => entry.windowId),
            'the hover-sync addon is resolved for the manager\'s window, both times').toEqual(['w2', 'w2']);

        expect(calls[0].payload, 'suspend carries the routing key').toEqual({id: manager.id, windowId: 'w2'});
        expect(calls[1].payload, 'resume carries the routing key').toEqual({id: manager.id, windowId: 'w2'})
    });
});
