import {setup} from '../../setup.mjs';

const appName = 'TwoThreadPipelineTest';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: true,
        useDomApiRenderer      : true,
        useVdomWorker          : false
    },
    appConfig: {
        name: appName
    }
});

import {test, expect}     from '@playwright/test';
import {execFile}         from 'node:child_process';
import path               from 'node:path';
import {fileURLToPath}    from 'node:url';
import {promisify}        from 'node:util';
import Neo                from '../../../../src/Neo.mjs';
import * as core          from '../../../../src/core/_export.mjs';
import Component          from '../../../../src/component/Base.mjs';
import Helix              from '../../../../src/component/Helix.mjs';
import VdomHelper         from '../../../../src/vdom/Helper.mjs';
import DomApiVnodeCreator from '../../../../src/vdom/util/DomApiVnodeCreator.mjs';
import {validateBatch}    from '../../../../src/vdom/util/DeltaGrammar.mjs';

const
    repoRoot      = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..'),
    execFileAsync = promisify(execFile),
    baseApply     = Neo.applyDeltas;

class MetaProbeComponent extends Component {
    static config = {
        className: 'Test.Unit.Vdom.TwoThreadPipeline.MetaProbeComponent',
        _vdom    : {tag: 'div', text: 'initial'}
    }

    events = []
    metaPayload = null

    afterExecuteVdomUpdate() {
        this.events.push('afterExecuteVdomUpdate')
    }

    getVdomUpdateMeta() {
        return this.metaPayload
    }
}
MetaProbeComponent = Neo.setupClass(MetaProbeComponent);

/**
 * @summary Verifies two-thread (`useVdomWorker: false`) parity for `meta`, `afterExecuteVdomUpdate`, and `createVnodeTree`.
 */
test.describe('Two-thread VDOM pipeline parity (#20780)', () => {
    let calls;

    test.beforeEach(() => {
        calls = [];
        Neo.config.useVdomWorker = false;
        Neo.applyDeltas = async (windowId, deltas, meta) => {
            calls.push({windowId, deltas, meta})
        }
    });

    test.afterEach(() => {
        Neo.applyDeltas = baseApply
    });

    test('an update carrying meta reaches DeltaUpdates#update through App#applyDeltas alongside its deltas', async () => {
        const script = `
            import Neo from './src/Neo.mjs';
            import * as core from './src/core/_export.mjs';
            import {setup} from './test/playwright/setup.mjs';

            setup({
                mockMain : false,
                neoConfig: {
                    allowVdomUpdatesInTests: true,
                    unitTestMode           : true,
                    useDomApiRenderer      : true,
                    useVdomWorker          : false
                },
                appConfig: {name: 'MetaWireProbe'}
            });

            globalThis.document = {
                addEventListener   : () => {},
                body               : {},
                createElement      : () => ({addEventListener: () => {}}),
                getElementById     : () => null,
                querySelector      : () => null,
                removeEventListener: () => {}
            };

            delete Neo.worker.App;
            delete Neo.main.DomAccess;
            delete Neo.main.DeltaUpdates;
            Neo.worker.Manager.on ??= () => {};
            Neo.main.render ??= {DomApiRenderer: {}, StringBasedRenderer: {}};
            Neo.overwrites = {Neo: {worker: {App: {singleton: false}}}};

            const {default: App}          = await import('./src/worker/App.mjs'),
                  {default: DeltaUpdates} = await import('./src/main/DeltaUpdates.mjs'),
                  {default: Component}    = await import('./src/component/Base.mjs');
            await import('./src/vdom/Helper.mjs');
            await import('./src/vdom/util/DomApiVnodeCreator.mjs');

            const received = [], messages = [];
            DeltaUpdates.updateNode = () => {};
            DeltaUpdates.insertNode = () => {};
            DeltaUpdates.on('update', data => received.push({
                deltas: data.deltas.length,
                meta  : data.meta
            }));

            Neo.applyDeltas = App.prototype.applyDeltas.bind({
                promiseMessage(windowId, msg) {
                    messages.push({windowId, ...msg});
                    DeltaUpdates.update({id: 'req-1', ...msg});
                    return Promise.resolve()
                }
            });

            class WireComp extends Component {
                static config = {
                    className: 'Test.Unit.Vdom.TwoThreadPipeline.WireComp',
                    _vdom    : {tag: 'div', text: 'before'}
                }
                metaPayload = null
                getVdomUpdateMeta() { return this.metaPayload }
            }
            WireComp = Neo.setupClass(WireComp);

            const comp = Neo.create(WireComp, {appName: 'MetaWireProbe', id: 'wire-comp', windowId: 7});
            await comp.initVnode(true);
            messages.length = 0;
            received.length = 0;

            comp.metaPayload = {scrollTop: 240};
            comp.vdom.text   = 'after';
            await comp.promiseUpdate();

            comp.metaPayload = {scrollTop: 480, zeroDelta: true};
            await comp.promiseUpdate();

            comp.metaPayload = null;
            await comp.promiseUpdate();

            const plainMessage = [];
            await App.prototype.applyDeltas.call({
                promiseMessage(windowId, msg) {
                    plainMessage.push(msg);
                    return Promise.resolve()
                }
            }, 7, {id: 'wire-comp', textContent: 'plain'});

            comp.destroy();
            console.log(JSON.stringify({messages, received, plainHasMeta: Object.hasOwn(plainMessage[0], 'meta')}));
        `;

        const {stdout} = await execFileAsync(process.execPath, ['--input-type=module', '-e', script], {
            cwd     : repoRoot,
            encoding: 'utf8',
            timeout : 15000
        });
        const report = JSON.parse(stdout.trim().split('\n').at(-1));

        expect(report.plainHasMeta).toBe(false);
        expect(report.messages).toHaveLength(2);
        expect(report.messages[0].meta).toEqual({'wire-comp': {scrollTop: 240}});
        expect(report.messages[1]).toEqual({
            windowId: 7,
            action  : 'updateVdom',
            deltas  : [],
            meta    : {'wire-comp': {scrollTop: 480, zeroDelta: true}}
        });
        expect(report.received).toEqual([
            {deltas: 1, meta: {'wire-comp': {scrollTop: 240}}},
            {deltas: 0, meta: {'wire-comp': {scrollTop: 480, zeroDelta: true}}}
        ])
    });

    test('afterExecuteVdomUpdate runs only after Neo.applyDeltas has resolved', async () => {
        const comp = Neo.create(MetaProbeComponent, {
            appName,
            id      : 'hook-order-probe',
            windowId: 1
        });
        await comp.initVnode(true);
        calls.length       = 0;
        comp.events.length = 0;

        let releasePaint;
        const paintGate = new Promise(resolve => {releasePaint = resolve});

        Neo.applyDeltas = async (windowId, deltas, meta) => {
            comp.events.push('applyDeltas:called');
            calls.push({windowId, deltas, meta});
            await paintGate;
            comp.events.push('applyDeltas:settled')
        };

        comp.metaPayload = {epoch: 3};
        comp.vdom.text   = 'painted';

        const flight = comp.promiseUpdate();

        await expect.poll(() => comp.events.includes('applyDeltas:called')).toBe(true);
        expect(comp.events).toEqual(['applyDeltas:called']);

        releasePaint();
        await flight;

        expect(comp.events).toEqual([
            'applyDeltas:called',
            'applyDeltas:settled',
            'afterExecuteVdomUpdate'
        ]);
        expect(calls[0].meta).toEqual({'hook-order-probe': {epoch: 3}});

        comp.destroy()
    });

    test('createVnodeTree with autoMount emits one valid insertNode delta and Helix#expandItem uses it', async () => {
        const comp = Neo.create(Component, {
            appName,
            id      : 'automount-host',
            windowId: 3
        });

        const mounted = await comp.createVnodeTree({
            appName,
            autoMount  : true,
            parentId   : 'document.body',
            parentIndex: 2,
            vdom       : {tag: 'div', id: 'manual-automount-node', text: 'hello'},
            windowId   : 3
        });

        expect(calls).toHaveLength(1);
        expect(calls[0]).toEqual({
            windowId: 3,
            meta    : undefined,
            deltas  : [{
                action   : 'insertNode',
                id       : 'manual-automount-node',
                index    : 2,
                outerHTML: mounted.outerHTML,
                parentId : 'document.body',
                vnode    : mounted.vnode
            }]
        });
        expect(validateBatch(calls[0].deltas, {useDomApiRenderer: true}).valid).toBe(true);

        calls.length = 0;
        const appended = await comp.createVnodeTree({
            autoMount: true,
            parentId : 'document.body',
            vdom     : {tag: 'span', id: 'append-automount-node', text: 'tail'}
        });

        expect(calls).toHaveLength(1);
        expect(calls[0].deltas[0].index).toBe(Number.MAX_SAFE_INTEGER);
        expect(validateBatch(calls[0].deltas, {useDomApiRenderer: true}).valid).toBe(true);
        expect(appended.deltas).toEqual(calls[0].deltas);

        calls.length = 0;
        const record = {
            id            : 'rec-1',
            expanded      : false,
            firstname     : 'Ada',
            lastname      : 'Lovelace',
            transformStyle: 'matrix3d(1,0,0,0)'
        };
        const helixContext = {
            appName,
            clonedItems      : [],
            createVnodeTree  : Helix.prototype.createVnodeTree,
            destroyClones    : () => {},
            getCloneTransform: () => 'matrix3d(1,0,0,0)',
            getItemVnodeId   : id => `helix-test__${id}`,
            getItemsRoot     : () => ({
                id: 'helix-group',
                cn: [{
                    id   : 'helix-test__rec-1',
                    cls  : ['neo-helix-item'],
                    style: {},
                    cn   : [{id: 'helix-test__rec-1__img', tag: 'img'}]
                }]
            }),
            getRecordId  : r => r.id,
            showCloneInfo: false,
            store        : {
                get     : () => record,
                getCount: () => 5,
                indexOf : () => 0
            },
            timeout : () => ({then: () => {}}),
            windowId: 3
        };

        Helix.prototype.expandItem.call(helixContext, 'rec-1');
        await expect.poll(() => helixContext.clonedItems.length).toBe(1);

        expect(calls).toHaveLength(1);
        expect(calls[0]).toMatchObject({
            windowId: 3,
            deltas  : [{
                action  : 'insertNode',
                id      : 'helix-test__rec-1__clone',
                index   : 5,
                parentId: 'helix-group'
            }]
        });

        comp.destroy()
    });

    test('destroying the initiator while Neo.applyDeltas is pending skips afterExecuteVdomUpdate and rejects cleanly', async () => {
        const events = [],
              comp   = Neo.create(MetaProbeComponent, {
                  appName,
                  id      : 'destroy-during-paint',
                  windowId: 1
              });
        await comp.initVnode(true);
        comp.afterExecuteVdomUpdate = () => events.push('afterExecuteVdomUpdate');

        let releasePaint;
        const paintGate = new Promise(resolve => {releasePaint = resolve});

        Neo.applyDeltas = async () => {
            events.push('applyDeltas:called');
            await paintGate
        };

        comp.vdom.text = 'canceled';
        const flight = comp.promiseUpdate().then(
            () => ({outcome: 'resolved'}),
            err => ({outcome: 'rejected', err})
        );

        await expect.poll(() => events.includes('applyDeltas:called')).toBe(true);
        comp.destroy();
        releasePaint();

        const settled = await flight;
        expect(settled).toEqual({outcome: 'rejected', err: Neo.isDestroyed});
        expect(events).toEqual(['applyDeltas:called'])
    })
});
