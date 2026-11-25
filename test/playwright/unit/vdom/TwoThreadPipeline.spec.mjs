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
            appName  : undefined,
            autoMount: true,
            parentId : 'document.body',
            vdom     : {tag: 'span', id: 'append-automount-node', text: 'tail'},
            windowId : undefined
        });

        expect(calls).toHaveLength(1);
        expect(calls[0].windowId).toBe(3);
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
    });

    test('initVnode(true) awaits Neo.applyDeltas before adopting vnodes, mounting children, or firing app mounted, and adopts nothing on rejection', async () => {
        const {default: Container} = await import('../../../../src/container/Base.mjs'),
              timeline             = [];

        class MountOrderChild extends Component {
            static config = {
                className: 'Test.Unit.Vdom.TwoThreadPipeline.MountOrderChild',
                _vdom    : {tag: 'span', text: 'child'}
            }
            afterSetMounted(value, oldValue) {
                super.afterSetMounted(value, oldValue);
                if (oldValue !== undefined) {
                    timeline.push(`child.mounted:${value}`)
                }
            }
        }
        MountOrderChild = Neo.setupClass(MountOrderChild);

        let releaseInsert, rejectInsert;
        Neo.applyDeltas = async (windowId, deltas) => {
            timeline.push(`applyDeltas:${deltas[0]?.action}`);
            await new Promise((resolve, reject) => {
                releaseInsert = resolve;
                rejectInsert  = reject
            });
            timeline.push('applyDeltas:settled')
        };

        const root = Neo.create(Container, {
                  appName,
                  id      : 'mount-order-root',
                  items   : [{module: MountOrderChild, id: 'mount-order-child'}],
                  parentId: 'document.body',
                  windowId: 1
              }),
              child = root.items[0],
              app   = root.app;

        const prevAppMounted = app.mounted,
              prevAppFire    = app.fire;
        app.mounted = false;
        app.fire    = event => {
            if (event === 'mounted') {
                timeline.push('app.mounted')
            }
            prevAppFire?.call(app, event)
        };

        try {
            const mountPromise = root.initVnode(true);
            await expect.poll(() => timeline.includes('applyDeltas:insertNode')).toBe(true);

            expect(root.vnode,  'root vnode not adopted before Main acknowledges insert').toBe(null);
            expect(child.vnode, 'child vnode not adopted before Main acknowledges insert').toBe(null);
            expect(root.mounted).toBe(false);
            expect(child.mounted).toBe(false);
            expect(app.mounted).toBe(false);
            expect(timeline).toEqual(['applyDeltas:insertNode']);

            releaseInsert();
            await mountPromise;

            expect(root.vnode?.id).toBe('mount-order-root');
            expect(child.vnode?.id).toBe('mount-order-child');
            expect(root.mounted).toBe(true);
            expect(child.mounted).toBe(true);
            expect(app.mounted).toBe(true);
            expect(timeline).toEqual([
                'applyDeltas:insertNode',
                'applyDeltas:settled',
                'child.mounted:true',
                'app.mounted'
            ]);

            // Rejected insert leaves vnodes and mounted flags unset
            const failedRoot = Neo.create(Container, {
                appName,
                id      : 'mount-order-failed-root',
                items   : [{module: MountOrderChild, id: 'mount-order-failed-child'}],
                parentId: 'document.body',
                windowId: 1
            });
            const failedChild = failedRoot.items[0];

            timeline.length = 0;
            const failedMount = failedRoot.initVnode(true);
            await expect.poll(() => timeline.includes('applyDeltas:insertNode')).toBe(true);
            rejectInsert(new Error('insert rejected'));

            await expect(failedMount).rejects.toThrow('insert rejected');
            expect(failedRoot.vnode).toBe(null);
            expect(failedChild.vnode).toBe(null);
            expect(failedRoot.mounted).toBe(false);
            expect(failedChild.mounted).toBe(false);

            failedRoot.destroy()
        } finally {
            app.fire    = prevAppFire;
            app.mounted = prevAppMounted;
            root.destroy()
        }
    });

    test('cold Helper with useDomApiRenderer:false waits for helper.ready(), and worker-mode import ignores mismatched later window flags', async () => {
        const coldAppScript = `
            import Neo from './src/Neo.mjs';
            import * as core from './src/core/_export.mjs';
            import {setup} from './test/playwright/setup.mjs';

            setup({
                mockMain : false,
                neoConfig: {
                    allowVdomUpdatesInTests: true,
                    unitTestMode           : true,
                    useDomApiRenderer      : false,
                    useVdomWorker          : false
                },
                appConfig: {name: 'ColdStringHelperApp'}
            });

            globalThis.fetch = async () => ({json: async () => ({})});
            delete Neo.worker.App;
            Neo.overwrites = {Neo: {worker: {App: {singleton: false}}}};

            const {default: App}       = await import('./src/worker/App.mjs'),
                  {default: Component} = await import('./src/component/Base.mjs');

            const worker = Neo.create(App, {
                createThemeMap: () => {},
                ports         : [{port: {postMessage: () => {}}, windowId: null}],
                sendMessage   : () => {}
            });
            Neo.currentWorker = worker;
            Neo.applyDeltas   = async () => {};

            const preRegisterStringUtil = Boolean(Neo.vdom?.util?.StringFromVnode);
            worker.onRegisterNeoConfig({
                data: {
                    environment      : 'development',
                    useDomApiRenderer: false,
                    useVdomWorker    : false,
                    windowId         : 1
                }
            });

            const syncReadyAfterRegister = Boolean(Neo.vdom?.Helper?.isReady);
            const comp = Neo.create(Component, {
                appName : 'ColdStringHelperApp',
                id      : 'cold-string-comp',
                parentId: 'document.body',
                text    : 'cold-string',
                windowId: 1
            });

            const data = await comp.initVnode(true);
            const out  = {
                hasOuterHtml         : typeof data?.outerHTML === 'string' && data.outerHTML.includes('cold-string'),
                helperReadyAfterMount: Boolean(Neo.vdom?.Helper?.isReady),
                mounted              : comp.mounted,
                preRegisterStringUtil,
                syncReadyAfterRegister
            };
            comp.destroy();
            worker.destroy();
            console.log(JSON.stringify(out));
        `;

        const coldDirectScript = `
            import Neo from './src/Neo.mjs';
            import * as core from './src/core/_export.mjs';
            import {setup} from './test/playwright/setup.mjs';

            setup({
                mockMain : false,
                neoConfig: {
                    allowVdomUpdatesInTests: true,
                    unitTestMode           : true,
                    useDomApiRenderer      : false,
                    useVdomWorker          : false
                },
                appConfig: {name: 'ColdDirectHelperApp'}
            });

            Neo.applyDeltas = async () => {};
            const {default: Component} = await import('./src/component/Base.mjs'),
                  {default: helper}    = await import('./src/vdom/Helper.mjs');

            const readyAtImport = helper.isReady,
                  utilAtImport  = Boolean(Neo.vdom?.util?.StringFromVnode);

            const comp = Neo.create(Component, {
                appName : 'ColdDirectHelperApp',
                id      : 'cold-direct-comp',
                parentId: 'document.body',
                text    : 'direct-string',
                windowId: 1
            });

            const data = await comp.initVnode(true);
            comp.destroy();
            console.log(JSON.stringify({
                hasOuterHtml : typeof data?.outerHTML === 'string' && data.outerHTML.includes('direct-string'),
                readyAfter   : helper.isReady,
                readyAtImport,
                utilAtImport
            }));
        `;

        const mixedWindowScript = `
            import Neo from './src/Neo.mjs';
            import * as core from './src/core/_export.mjs';
            import {setup} from './test/playwright/setup.mjs';

            setup({
                mockMain : false,
                neoConfig: {
                    unitTestMode     : true,
                    useSharedWorkers : true,
                    useVdomWorker    : true,
                    windowId         : 1
                },
                appConfig: {name: 'MixedWindowScopeApp'}
            });

            globalThis.fetch = async () => ({json: async () => ({})});
            delete Neo.worker.App;
            Neo.overwrites = {Neo: {worker: {App: {singleton: false}}}};

            const {default: App} = await import('./src/worker/App.mjs'),
                  remoteStub     = {create: () => {}, isRemoteStub: true};
            Neo.ns('Neo.vdom', true);
            Neo.vdom.Helper = remoteStub;

            const worker = Neo.create(App, {
                createThemeMap: () => {},
                isSharedWorker: true,
                ports         : [{port: {postMessage: () => {}}, windowId: 1}, {port: {postMessage: () => {}}, windowId: null}],
                sendMessage   : () => {}
            });

            worker.onRegisterNeoConfig({
                data: {
                    environment  : 'development',
                    useVdomWorker: false,
                    windowId     : 2
                }
            });

            await new Promise(resolve => setTimeout(resolve, 20));
            const out = {
                hasHelperPromise  : worker.vdomHelperPromise !== null,
                remotePreserved   : Neo.vdom.Helper === remoteStub,
                workerUseVdomFlag : Neo.config.useVdomWorker
            };
            worker.destroy();
            console.log(JSON.stringify(out));
        `;

        const [appRun, directRun, mixedRun] = await Promise.all(
            [coldAppScript, coldDirectScript, mixedWindowScript].map(script =>
                execFileAsync(process.execPath, ['--input-type=module', '-e', script], {
                    cwd     : repoRoot,
                    encoding: 'utf8',
                    timeout : 15000
                }).then(({stdout}) => JSON.parse(stdout.trim().split('\n').at(-1)))
            )
        );

        expect(appRun).toEqual({
            hasOuterHtml          : true,
            helperReadyAfterMount : true,
            mounted               : true,
            preRegisterStringUtil : false,
            syncReadyAfterRegister: false
        });
        expect(directRun).toEqual({
            hasOuterHtml : true,
            readyAfter   : true,
            readyAtImport: false,
            utilAtImport : false
        });
        expect(mixedRun).toEqual({
            hasHelperPromise : false,
            remotePreserved  : true,
            workerUseVdomFlag: true
        })
    });

    test('destroying an attempt during Helper readiness or before dispatch sends no late insertNode', async () => {
        const prevHelperPromise = Neo.currentWorker.vdomHelperPromise,
              prevCreate        = VdomHelper.create,
              actions           = [];

        Neo.applyDeltas = async (windowId, deltas) => {
            for (const delta of [deltas].flat()) {
                actions.push(delta.action)
            }
        };

        try {
            // Arm A: destroyed while awaiting vdomHelperPromise
            let releaseHelper;
            Neo.currentWorker.vdomHelperPromise = new Promise(resolve => {releaseHelper = resolve});

            const compA   = Neo.create(Component, {appName, id: 'destroy-during-helper-wait', parentId: 'document.body', windowId: 1}),
                  flightA = compA.initVnode(true);

            compA.destroy(true);
            releaseHelper();
            await flightA;

            expect(actions, 'removeNode is not followed by a late insertNode after Helper wait').toEqual(['removeNode']);
            expect(compA.vnode).toBe(null);
            expect(compA.mounted).toBe(false);

            // Arm B: destroyed while Helper.create is settling before Neo.applyDeltas
            actions.length = 0;
            Neo.currentWorker.vdomHelperPromise = null;

            let releaseCreate;
            VdomHelper.create = opts => new Promise(resolve => {
                releaseCreate = () => resolve(prevCreate.call(VdomHelper, opts))
            });

            const compB   = Neo.create(Component, {appName, id: 'destroy-before-dispatch', parentId: 'document.body', windowId: 1}),
                  flightB = compB.initVnode(true);

            await expect.poll(() => typeof releaseCreate === 'function').toBe(true);
            compB.destroy(true);
            releaseCreate();
            await flightB;

            expect(actions, 'removeNode is not followed by a late insertNode after Helper.create').toEqual(['removeNode']);
            expect(compB.vnode).toBe(null);
            expect(compB.mounted).toBe(false)
        } finally {
            Neo.currentWorker.vdomHelperPromise = prevHelperPromise;
            VdomHelper.create                   = prevCreate
        }
    });

    test('late acknowledgement after destroy and ID reuse leaves the replacement flight and callbacks intact', async () => {
        const {default: VDomUpdate} = await import('../../../../src/manager/VDomUpdate.mjs'),
              pendingInserts        = [];

        Neo.applyDeltas = async (windowId, deltas) => {
            const first = [deltas].flat()[0];
            if (first?.action === 'insertNode') {
                await new Promise(resolve => pendingInserts.push(resolve))
            }
        };

        const comp1   = Neo.create(Component, {appName, id: 'reused-mount-id', parentId: 'document.body', text: 'old', windowId: 1}),
              flight1 = comp1.initVnode(true);

        await expect.poll(() => pendingInserts.length).toBe(1);

        comp1.destroy();

        const waiter  = Neo.create(Component, {appName, id: 'reused-mount-waiter', windowId: 1}),
              comp2   = Neo.create(Component, {appName, id: 'reused-mount-id', parentId: 'document.body', text: 'new', windowId: 1}),
              flight2 = comp2.initVnode(true);

        await expect.poll(() => pendingInserts.length).toBe(2);

        let comp2PromiseSettled = false,
            postUpdatesFired    = 0;

        waiter.updateVdom = () => {postUpdatesFired++};
        const parkedUpdate = comp2.promiseUpdate().then(() => {comp2PromiseSettled = true});
        VDomUpdate.registerPostUpdate('reused-mount-id', waiter.id);

        // Release the stale acknowledgement from comp1 while comp2's insert is still held
        pendingInserts[0]();
        await flight1;

        expect(VDomUpdate.inFlightUpdateMap.has('reused-mount-id'), 'replacement keeps its in-flight entry').toBe(true);
        expect(comp2.isVdomUpdating, 'replacement stays updating until its own insert settles').toBe(true);
        expect(comp2.mounted).toBe(false);
        expect(comp2PromiseSettled, 'replacement promiseUpdate does not settle on old ack').toBe(false);
        expect(postUpdatesFired, 'replacement postUpdate queue does not drain on old ack').toBe(0);

        // Now release comp2's own insert acknowledgement
        pendingInserts[1]();
        await Promise.all([flight2, parkedUpdate]);

        expect(comp2.vnode?.id).toBe('reused-mount-id');
        expect(comp2.mounted).toBe(true);
        expect(comp2PromiseSettled).toBe(true);
        expect(postUpdatesFired).toBe(1);
        await expect.poll(() => VDomUpdate.inFlightUpdateMap.has('reused-mount-id')).toBe(false);

        waiter.destroy();
        comp2.destroy()
    });

    test('Main queue + DeltaUpdates.insertNode rejects initial mount when parent target is missing and adopts only after real insertion', async () => {
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
                    useVdomWorker          : false,
                    windowId               : 1
                },
                appConfig: {name: 'MainAckMountProbe'}
            });

            const timeline = [],
                  errors   = [],
                  elements = new Map();

            const makeNode = id => ({
                id,
                childNodes    : [],
                namespaceURI  : 'http://www.w3.org/1999/xhtml',
                addEventListener   : () => {},
                removeEventListener: () => {},
                classList          : {add: () => {}, remove: () => {}},
                style              : {},
                setAttribute       : () => {},
                removeAttribute    : () => {},
                appendChild(child) {
                    this.childNodes.push(child);
                    child.parentNode = this;
                    return child
                },
                insertBefore(child) {
                    this.childNodes.push(child);
                    child.parentNode = this;
                    timeline.push('dom:insert:' + child.id);
                    return child
                }
            });

            elements.set('reachable-parent', makeNode('reachable-parent'));

            globalThis.document = {
                readyState            : 'loading',
                hidden                : false,
                visibilityState       : 'visible',
                addEventListener      : () => {},
                removeEventListener   : () => {},
                evaluate              : () => ({singleNodeValue: null}),
                getElementById        : id => elements.get(id) ?? null,
                querySelector         : sel => elements.get(sel.match(/data-neo-id='([^']+)'/)?.[1]) ?? null,
                createDocumentFragment: () => makeNode('fragment'),
                createElement         : tag => makeNode(tag),
                createElementNS       : (ns, tag) => makeNode(tag),
                createComment         : () => ({}),
                createTextNode        : () => ({}),
                body                  : makeNode('document.body'),
                documentElement       : makeNode('documentElement')
            };
            globalThis.XPathResult             = {FIRST_ORDERED_NODE_TYPE: 9};
            globalThis.window                  = globalThis;
            globalThis.addEventListener        = () => {};
            globalThis.removeEventListener     = () => {};
            globalThis.location                = {};
            globalThis.screen                  = {orientation: {}};
            globalThis.matchMedia              = () => ({matches: false, addEventListener: () => {}, removeEventListener: () => {}});
            globalThis.Worker                  = class {};
            globalThis.SharedWorker            = class {};

            const scheduled = [];
            globalThis.requestAnimationFrame = cb => {scheduled.push(cb); return 1};
            globalThis.cancelAnimationFrame  = () => {};

            Neo.insideWorker = true;
            delete Neo.worker.App;
            delete Neo.worker.Manager;
            delete Neo.main.DomAccess;
            delete Neo.main.DeltaUpdates;
            Neo.overwrites = {Neo: {worker: {App: {singleton: false}}}};

            const {default: Main}          = await import('./src/Main.mjs'),
                  {default: DeltaUpdates}  = await import('./src/main/DeltaUpdates.mjs'),
                  {default: WorkerManager} = await import('./src/worker/Manager.mjs'),
                  {default: WorkerBase}    = await import('./src/worker/Base.mjs'),
                  {default: App}           = await import('./src/worker/App.mjs'),
                  {default: Container}     = await import('./src/container/Base.mjs'),
                  {default: Component}     = await import('./src/component/Base.mjs'),
                  {default: VDomUpdate}    = await import('./src/manager/VDomUpdate.mjs');
            await import('./src/vdom/Helper.mjs');
            await import('./src/vdom/util/DomApiVnodeCreator.mjs');

            Neo.main.render = {
                DomApiRenderer: {
                    getChildNamespace: () => 'http://www.w3.org/1999/xhtml',
                    createDomTree    : ({vnode}) => {
                        const node = makeNode(vnode.id);
                        elements.set(vnode.id, node);
                        return node
                    }
                }
            };

            const origError = console.error;
            console.error = (...args) => errors.push(String(args[0]));

            const appSide = Object.assign(Object.create(WorkerBase.prototype), {
                promises   : {},
                sendMessage: (dest, msg) => {
                    const wire = {...msg, destination: dest, id: 'm-' + Math.random().toString(36).slice(2), origin: 'app'};
                    queueMicrotask(() => {
                        WorkerManager.onWorkerMessage({data: wire});
                        while (scheduled.length) {
                            scheduled.shift()()
                        }
                    });
                    return wire
                }
            });
            WorkerManager.sendMessage = (dest, reply) => {
                queueMicrotask(() => appSide.onMessage({data: reply}))
            };
            Neo.applyDeltas = App.prototype.applyDeltas.bind(appSide);

            class AckChild extends Component {
                static config = {
                    className: 'Test.Unit.Vdom.TwoThreadPipeline.AckChild',
                    _vdom    : {tag: 'span', text: 'leaf'}
                }
                afterSetMounted(value, oldValue) {
                    super.afterSetMounted(value, oldValue);
                    oldValue !== undefined && timeline.push('child.mounted:' + value)
                }
            }
            AckChild = Neo.setupClass(AckChild);

            class AckRoot extends Container {
                static config = {
                    className: 'Test.Unit.Vdom.TwoThreadPipeline.AckRoot'
                }
                afterSetMounted(value, oldValue) {
                    super.afterSetMounted(value, oldValue);
                    oldValue !== undefined && timeline.push('root.mounted:' + value)
                }
            }
            AckRoot = Neo.setupClass(AckRoot);

            // 1. Missing parent target: Main logs Parent not found, skips write, and mount rejects with zero adoption
            const targetWindowId  = WorkerManager.windowId,
                  missingParent   = Neo.create(Container, {appName: 'MainAckMountProbe', id: 'missing-parent', windowId: targetWindowId}),
                  reachableParent = Neo.create(Container, {appName: 'MainAckMountProbe', id: 'reachable-parent', windowId: targetWindowId}),
                  missingRoot     = Neo.create(AckRoot, {
                      appName : 'MainAckMountProbe',
                      id      : 'missing-root',
                      items   : [{module: AckChild, id: 'missing-child'}],
                      parentId: missingParent.id,
                      windowId: targetWindowId
                  });
            missingParent._vnode   = {id: 'missing-parent', childNodes: []};
            reachableParent._vnode = {id: 'reachable-parent', childNodes: []};
            const app = missingRoot.app;
            app.mounted = false;
            const prevFire = app.fire;
            app.fire = event => {
                event === 'mounted' && timeline.push('app.mounted');
                prevFire?.call(app, event)
            };
            const missingChild = missingRoot.items[0];
            let missingError = null;
            try {
                await missingRoot.initVnode(true)
            } catch (err) {
                missingError = err?.message || String(err)
            }

            const missingState = {
                appMounted         : app.mounted,
                childMounted       : missingChild.mounted,
                childVnode         : missingChild.vnode,
                inFlight           : VDomUpdate.inFlightUpdateMap.has('missing-root'),
                isVdomUpdating     : missingRoot.isVdomUpdating,
                isVnodeInitializing: missingRoot.isVnodeInitializing,
                loggedParentMissing: errors.some(line => line.includes('insertNode: Parent not found')),
                missingError,
                rootMounted        : missingRoot.mounted,
                rootVnode          : missingRoot.vnode,
                timelineAfterMiss  : [...timeline]
            };

            // 2. Reachable parent control: DOM node inserts before child, root, and app mount hooks fire
            const okRoot = Neo.create(AckRoot, {
                appName : 'MainAckMountProbe',
                id      : 'ok-root',
                items   : [{module: AckChild, id: 'ok-child'}],
                parentId: 'reachable-parent',
                windowId: targetWindowId
            });
            const okChild = okRoot.items[0];
            await okRoot.initVnode(true);

            const okState = {
                appMounted  : app.mounted,
                childMounted: okChild.mounted,
                insertedIds : elements.get('reachable-parent').childNodes.map(n => n.id),
                rootMounted : okRoot.mounted,
                rootVnodeId : okRoot.vnode?.id,
                timeline
            };

            missingRoot.destroy();
            okRoot.destroy();
            missingParent.destroy();
            reachableParent.destroy();
            console.error = origError;
            console.log(JSON.stringify({missingState, okState}));
        `;

        const {stdout} = await execFileAsync(process.execPath, ['--input-type=module', '-e', script], {
            cwd     : repoRoot,
            encoding: 'utf8',
            timeout : 15000
        });
        const {missingState, okState} = JSON.parse(stdout.trim().split('\n').at(-1));

        expect(missingState.missingError).toMatch(/Initial mount insertNode skipped/);
        expect(missingState).toMatchObject({
            appMounted         : false,
            childMounted       : false,
            childVnode         : null,
            inFlight           : false,
            isVdomUpdating     : false,
            isVnodeInitializing: false,
            loggedParentMissing: true,
            rootMounted        : false,
            rootVnode          : null,
            timelineAfterMiss  : []
        });

        expect(okState).toEqual({
            appMounted  : true,
            childMounted: true,
            insertedIds : ['ok-root'],
            rootMounted : true,
            rootVnodeId : 'ok-root',
            timeline    : [
                'dom:insert:ok-root',
                'child.mounted:true',
                'root.mounted:true',
                'app.mounted'
            ]
        })
    });

    test('WorkerManager#createWorkers spawns no vdom worker under DefaultConfig and still honors useVdomWorker: true opt-back-in', async () => {
        const probeWorkers = async extraConfig => {
            const script = `
                const spawned = [];
                globalThis.Neo = {config: ${JSON.stringify(extraConfig)}};
                globalThis.DOMRect = class {};
                globalThis.window = globalThis;
                globalThis.addEventListener ??= () => {};
                globalThis.document = {
                    baseURI         : 'http://localhost/',
                    body            : {addEventListener: () => {}, classList: {add: () => {}, contains: () => false, remove: () => {}}},
                    documentElement : {classList: {add: () => {}}, style: {setProperty: () => {}}},
                    head            : {appendChild: () => {}},
                    addEventListener: () => {},
                    createElement   : () => ({style: {}})
                };
                globalThis.location = {hash: '', href: 'http://localhost/', search: ''};
                if (!globalThis.navigator) {
                    Object.defineProperty(globalThis, 'navigator', {configurable: true, value: {}});
                }
                globalThis.matchMedia = () => ({matches: false, addEventListener: () => {}});
                globalThis.Worker = class {
                    constructor(url, opts) {
                        spawned.push(opts.name);
                        this.postMessage = () => {}
                    }
                    addEventListener() {}
                };

                await import('./src/Neo.mjs');
                await import('./src/core/_export.mjs');
                const {default: WorkerManager} = await import('./src/worker/Manager.mjs');

                // In Node.js Neo.insideWorker defaults to true, skipping createWorkers() at construct;
                // invoke createWorkers() directly to observe which Worker instances the config starts.
                spawned.length = 0;
                WorkerManager.createWorkers();

                console.log(JSON.stringify({
                    hasVdomWorker: Boolean(WorkerManager.getWorker('vdom')),
                    spawned
                }));
            `;
            const {stdout} = await execFileAsync(process.execPath, ['--input-type=module', '-e', script], {
                cwd     : repoRoot,
                encoding: 'utf8',
                timeout : 15000
            });
            return JSON.parse(stdout.trim().split('\n').at(-1))
        };

        expect(await probeWorkers({})).toEqual({
            hasVdomWorker: false,
            spawned      : ['neomjs-appworker-worker', 'neomjs-dataworker-worker']
        });

        expect(await probeWorkers({useVdomWorker: true})).toEqual({
            hasVdomWorker: true,
            spawned      : ['neomjs-appworker-worker', 'neomjs-dataworker-worker', 'neomjs-vdomworker-worker']
        })
    })
});
