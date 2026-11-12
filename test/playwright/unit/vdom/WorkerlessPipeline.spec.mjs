/**
 * @file test/playwright/unit/vdom/WorkerlessPipeline.spec.mjs
 * @summary Pins the three ways the two-thread VDOM pipeline differs when `useVdomWorker` is false: the
 * update `meta` never reaches main, `Helper.create({autoMount: true})` mounts nothing, and
 * `afterExecuteVdomUpdate` runs before the paint its JSDoc promises.
 *
 * All three are `Neo.config.useVdomWorker: false` cases, so the suite runs with that config and replaces
 * `Neo.applyDeltas` — the App worker's only way to reach main — with a recorder.
 */

import {setup} from '../../setup.mjs';

const appName = 'WorkerlessPipelineTest';

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
import TreeBuilder    from '../../../../src/util/vdom/TreeBuilder.mjs';
import VdomHelper     from '../../../../src/vdom/Helper.mjs';

import '../../../../src/manager/Instance.mjs';

/**
 * @summary A component that publishes update context, the way `grid.View` publishes its scroll state.
 */
class MetaComponent extends Component {
    static config = {
        className: 'Test.vdom.MetaComponent',
        text     : 'initial'
    }

    getVdomUpdateMeta() {
        return {scrollEpoch: 7, scrollTop: 42}
    }
}

MetaComponent = Neo.setupClass(MetaComponent);

test.describe('the two-thread VDOM pipeline without a VDom worker', () => {
    let applyDeltas, calls, instances;

    test.beforeEach(() => {
        applyDeltas = Neo.applyDeltas;
        calls       = [];
        instances   = [];

        Neo.applyDeltas = async (windowId, deltas, meta) => {
            calls.push({windowId, deltas: [deltas].flat(), meta})
        }
    });

    test.afterEach(() => {
        instances.forEach(component => component?.destroy());
        Neo.applyDeltas = applyDeltas
    });

    test('an update sends its meta beside the deltas, keyed by component id', async () => {
        const component = Neo.create(MetaComponent, {appName, windowId: 1});

        instances.push(component);

        await component.initVnode(false);
        component.mounted = true;

        await component.set({text: 'after'});

        const update = calls.find(call => call.deltas.some(delta => delta.action !== 'insertNode'));

        expect(update, 'the update reached main').toBeTruthy();
        expect(update.meta, 'the reply meta is forwarded, not dropped').toBeTruthy();
        expect(update.meta[component.id], 'meta is keyed by the component it describes').toEqual({scrollEpoch: 7, scrollTop: 42})
    });

    test('afterExecuteVdomUpdate runs after the deltas were applied', async () => {
        const order = [];

        const Recording = class extends MetaComponent {
            afterExecuteVdomUpdate() { order.push('hook') }
        };

        const component = Neo.create(Recording, {appName, windowId: 1});

        instances.push(component);

        Neo.applyDeltas = async (windowId, deltas, meta) => {
            if ([deltas].flat().some(delta => delta.action !== 'insertNode')) order.push('applied');
            calls.push({windowId, deltas: [deltas].flat(), meta})
        };

        await component.initVnode(false);
        component.mounted = true;

        await component.set({text: 'after'});

        expect(order, 'the paint promise settles before the hook that promises it').toEqual(['applied', 'hook'])
    });

    test('createVdom performs the insert that an autoMount create cannot do locally', async () => {
        const component = Neo.create(Component, {appName, windowId: 1});

        instances.push(component);

        const data = await component.createVdom({
            appName,
            autoMount  : true,
            parentId   : 'document.body',
            parentIndex: 0,
            vdom       : TreeBuilder.getVdomTree(component.vdom, -1),
            windowId   : 1
        });

        const insert = calls.map(call => call.deltas).flat().find(delta => delta.action === 'insertNode');

        expect(data.vnode, 'the reply still carries the vnode').toBeTruthy();
        expect(insert, 'an insertNode delta reached main').toBeTruthy();
        expect(insert.id, 'the insert names the created node').toBe(component.id);
        expect(insert.parentId).toBe('document.body')
    });
});
