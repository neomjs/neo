import {setup} from '../../../setup.mjs';

setup({
    appConfig: {
        name: 'WorkstationViewportControllerTest'
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../src/Neo.mjs';
import * as core      from '../../../../../src/core/_export.mjs';
import '../../../../../src/manager/Instance.mjs';
import Container          from '../../../../../src/container/Base.mjs';
import Transaction        from '../../../../../src/manager/Transaction.mjs';
import Workspace          from '../../../../../apps/workstation/view/Workspace.mjs';
import ViewportController from '../../../../../apps/workstation/view/ViewportController.mjs';

/**
 * @summary The controller under test with its root creation recorded instead of run.
 *
 * `createRoot` hydrates storage and constructs the flagship Workspace; the decision table is the subject
 * here, so these arms observe WHETHER and WITH WHAT it is asked to run. The refusal branches never reach
 * it and render through the real method, and the refused-admission arm runs the real class.
 */
class RecordingController extends ViewportController {
    static config = {
        className: 'Test.Workstation.RecordingViewportController'
    }

    /** @member {Array[]} calls=[] */
    calls = []

    /**
     * @param {...*} args
     * @returns {Promise<void>}
     */
    createRoot(...args) {
        this.calls.push(args);
        return Promise.resolve()
    }
}

Neo.setupClass(RecordingController);

const REFUSAL = 'This saved window is waiting for its original workspace.',
      WAITING = 'This window is waiting for its original workspace.';

let sequence = 0;

/**
 * @summary Registers the URL a booting window carries, the way the main thread does before the app loads.
 * @param {String} [search='']
 * @returns {String} The window id.
 */
function registerWindow(search='') {
    const windowId = `viewport-controller-${++sequence}`;

    Neo.windowConfigs ??= {};
    Neo.windowConfigs[windowId] = {url: {search}};

    return windowId
}

/**
 * @summary The window's main view, constructed AFTER admission the way `Application#construct` orders it.
 * @param {String} windowId
 * @param {Function} [controller=RecordingController]
 * @returns {Neo.container.Base}
 */
function createView(windowId, controller=RecordingController) {
    return Neo.create(Container, {controller, windowId})
}

/**
 * @summary A live component registered as the Group's participant under one key.
 * @param {String} groupId
 * @param {String} workspaceKey
 * @returns {Neo.container.Base}
 */
function registerOwner(groupId, workspaceKey) {
    const owner = Neo.create(Container, {});

    Transaction.registerParticipant({groupId, workspaceKey, participant: {componentId: owner.id}});

    return owner
}

/**
 * @param {String} windowId
 * @param {Object[]} instances
 * @param {String[]} groupIds
 */
function retire(windowId, instances, groupIds) {
    instances.forEach(instance => instance.destroy());
    delete Neo.windowConfigs[windowId];
    Transaction.release(windowId);
    groupIds.forEach(groupId => Transaction.retireGroup(groupId))
}

test.describe('Workstation.view.ViewportController — one window, one decision, from the registry', () => {
    test('a restored window bound under its declared key with a live root renders nothing: the root adopts it', () => {
        const owner    = Transaction.bind({windowId: `viewport-controller-owner-${++sequence}`}),
              windowId = registerWindow('?workspace=details');

        Transaction.bind({...Transaction.reserve({groupId: owner.groupId, workspaceKey: 'details'}), windowId});

        const root = registerOwner(owner.groupId, 'details'),
              view = createView(windowId);

        try {
            expect(view.items.length, 'no refusal, no placeholder').toBe(0);
            expect(view.controller.calls, 'and no root of its own').toEqual([])
        } finally {
            retire(windowId, [view, root], [owner.groupId])
        }
    });

    test('a restored window bound under a different key than its URL declares refuses, fail-closed', () => {
        const owner    = Transaction.bind({windowId: `viewport-controller-owner-${++sequence}`}),
              windowId = registerWindow('?workspace=details');

        Transaction.bind({...Transaction.reserve({groupId: owner.groupId, workspaceKey: 'other'}), windowId});

        const root = registerOwner(owner.groupId, 'other'),
              view = createView(windowId);

        try {
            expect(view.items.map(item => item.html)).toEqual([REFUSAL]);
            expect(view.controller.calls).toEqual([])
        } finally {
            retire(windowId, [view, root], [owner.groupId])
        }
    });

    test('a restored window whose worker never saw its Group is minted a root slot, and refuses once that binding lands', () => {
        const windowId = registerWindow('?workspace=details'),
              view     = createView(windowId);

        let groupId;

        try {
            expect(view.items.length, 'nothing is decided while the carrier answer is pending').toBe(0);

            // The minted identity's carrier accepted: the manager binds the window as a new root, under `main`.
            ({groupId} = Transaction.bind({windowId}));

            expect(view.items.map(item => item.html), 'a root slot cannot host a saved window').toEqual([REFUSAL]);
            expect(view.controller.calls).toEqual([])
        } finally {
            retire(windowId, [view], groupId ? [groupId] : [])
        }
    });

    test('a default window whose Group already holds a live root renders nothing: the retained root moves in', () => {
        const windowId  = registerWindow(),
              {groupId} = Transaction.bind({windowId}),
              root      = registerOwner(groupId, Workspace.MAIN_WORKSPACE_ID),
              view      = createView(windowId);

        try {
            expect(view.items.length).toBe(0);
            expect(view.controller.calls).toEqual([])
        } finally {
            retire(windowId, [view, root], [groupId])
        }
    });

    test('a default window with a held root binding and no root creates one, carrying the selected layout', () => {
        const windowId = registerWindow('?layout=layout-a'),
              binding  = Transaction.bind({windowId}),
              view     = createView(windowId);

        try {
            // `findByWindow` describes the slot, not the window: group, key and generation.
            expect(view.controller.calls).toEqual([[
                {generation: 1, groupId: binding.groupId, workspaceKey: 'main'},
                'layout-a'
            ]]);
            expect(view.items.length).toBe(0)
        } finally {
            retire(windowId, [view], [binding.groupId])
        }
    });

    test('a minted root decides on the bind event, exactly once, and a re-admission of the same window decides nothing', () => {
        const windowId = registerWindow(),
              view     = createView(windowId);

        let binding;

        try {
            expect(view.controller.calls, 'no binding yet, no decision yet').toEqual([]);

            binding = Transaction.bind({windowId});

            expect(view.controller.calls.length, 'the accepted carrier decides the boot').toBe(1);
            expect(view.controller.calls[0][0]).toMatchObject({groupId: binding.groupId, workspaceKey: 'main'});

            // A blank-root restart releases and re-admits the same window; the manager publishes a second bind.
            Transaction.release(windowId);
            Transaction.bind({windowId, groupId: binding.groupId, workspaceKey: 'main', generationToken: binding.generationToken});

            expect(view.controller.calls.length, 'one window, one decision').toBe(1)
        } finally {
            retire(windowId, [view], binding ? [binding.groupId] : [])
        }
    });

    test('a refused admission renders the waiting notice instead of a root', () => {
        const windowId = registerWindow(),
              view     = createView(windowId, ViewportController);

        try {
            expect(view.items.length).toBe(0);

            Transaction.fire('admissionRefused', {windowId, outcome: 'refused', groupId: null, workspaceKey: 'main'});

            expect(view.items.map(item => item.html)).toEqual([WAITING])
        } finally {
            retire(windowId, [view], [])
        }
    });

    test('a pop-out window marks itself as a vessel host and decides nothing else', () => {
        const windowId  = registerWindow('?popout=alerts'),
              {groupId} = Transaction.bind({windowId}),
              view      = createView(windowId);

        try {
            expect(view.cls).toContain('workstation-popout-host');
            expect(view.items.length).toBe(0);
            expect(view.controller.calls).toEqual([])
        } finally {
            retire(windowId, [view], [groupId])
        }
    })
});
