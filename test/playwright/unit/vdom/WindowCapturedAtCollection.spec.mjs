/**
 * @file test/playwright/unit/vdom/WindowCapturedAtCollection.spec.mjs
 * @summary On the two-thread line, deltas go to the window a payload was collected in. One
 * microtask turn separates collection from the send, so a component that moves windows inside it must not
 * redirect deltas computed against the old window's DOM. Only a SharedWorker app moves components between
 * windows; this spec lands the move in that turn, and each arm asserts the move happened before the send.
 */

import {setup} from '../../setup.mjs';

const appName = 'WindowCapturedAtCollectionTest';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: true,
        useVdomWorker          : false
    },
    appConfig: {
        name: appName
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import Component      from '../../../../src/component/Base.mjs';
import VdomHelper     from '../../../../src/vdom/Helper.mjs';

/**
 * @summary Moves itself to `moveTo` in the microtask turn after its update payload is collected.
 * `beforeExecuteVdomUpdate()` is the public hook that fires in the collecting task, right before the helper call.
 */
class Mover extends Component {
    static config = {
        className: 'Test.Unit.Vdom.WindowCapturedAtCollection.Mover',
        /**
         * The window to move to between collection and the send, or null to stay
         * @member {Number|null} moveTo=null
         */
        moveTo: null
    }

    beforeExecuteVdomUpdate() {
        const {moveTo} = this;
        moveTo && queueMicrotask(() => {this.windowId = moveTo})
    }
}
Mover = Neo.setupClass(Mover);

test.describe('Neo.mixin.VdomLifecycle: deltas go to the window captured at collection (ADR 0043 I3)', () => {
    let applyDeltas, mover, sends;

    test.beforeEach(() => {
        applyDeltas = Neo.applyDeltas;
        sends       = [];

        // Records the target window and where the component sits at the moment of the send
        Neo.applyDeltas = async (windowId, deltas) => {
            sends.push({deltas: [deltas].flat(), moverWindowAtSend: mover?.windowId, windowId})
        }
    });

    test.afterEach(() => {
        mover && !mover.isDestroyed && mover.destroy();
        mover           = null;
        Neo.applyDeltas = applyDeltas
    });

    test('an update moved mid-flight sends its deltas to the window it was collected in', async () => {
        mover = Neo.create(Mover, {appName, id: 'i3-update-mover', parentId: 'document.body', text: 'before', windowId: 1});

        await mover.initVnode(true);
        sends.length = 0;

        mover.moveTo = 2;
        mover.setSilent({text: 'after'});
        await mover.promiseUpdate();

        expect(sends, 'one delta send for the one update').toHaveLength(1);
        expect(sends[0].deltas.length, 'the text change produced deltas').toBeGreaterThan(0);
        expect(sends[0].moverWindowAtSend, 'control: the move landed before the send').toBe(2);
        expect(sends[0].windowId, 'the deltas follow the window they were diffed against').toBe(1)
    });

    test('a first render moved mid-flight sends its insertNode to the window it was collected in', async () => {
        mover = Neo.create(Mover, {appName, id: 'i3-create-mover', parentId: 'document.body', text: 'first', windowId: 1});

        // Queued before initVnode(true) runs, so it lands in the turn its awaited helper call yields
        queueMicrotask(() => {mover.windowId = 2});
        await mover.initVnode(true);

        expect(sends, 'one insertNode send for the mount').toHaveLength(1);
        expect(sends[0].deltas[0].action).toBe('insertNode');
        expect(sends[0].moverWindowAtSend, 'control: the move landed before the send').toBe(2);
        expect(sends[0].windowId, 'the insertNode follows the window it was collected in').toBe(1)
    })
});
