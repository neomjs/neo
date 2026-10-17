import {setup} from '../../setup.mjs';

setup({appConfig: {name: 'SharedCanvasAdmissionTest'}});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import SharedCanvas   from '../../../../src/app/SharedCanvas.mjs';

/** @summary Exposes lifecycle flights without replacing SharedCanvas admission or graph initialization. */
class AdmissionHost extends SharedCanvas {
    static config = {
        className        : 'Test.SharedCanvasAdmission.Host', monitorSize: false, offscreen: false,
        rendererClassName: 'Test.SharedCanvasAdmission.Renderer', rendererImportPath: 'apps/probe/canvas/Renderer.mjs'
    }

    registrationFlight = null
    mountedFlight = null
    sizes = 0

    /** @summary Retains the production offscreen hook's returned promise for deterministic assertions. */
    afterSetOffscreenRegistered(value, oldValue) {
        return this.registrationFlight = super.afterSetOffscreenRegistered(value, oldValue)
    }

    /** @summary Retains the production mount flight to observe shell mounting independently of Canvas transfer. */
    afterSetMounted(value, oldValue) {
        return this.mountedFlight = super.afterSetMounted(value, oldValue)
    }

    /** @summary Counts sizing at its side-effect boundary; the mounted browser proof retains real DOM sizing. */
    async updateSize() { this.sizes++; }
}

Neo.setupClass(AdmissionHost);

/** @summary Models a host whose transferred canvas is an inner vnode rather than its component root. */
class InnerCanvasHost extends AdmissionHost {
    static config = {className:'Test.SharedCanvasAdmission.InnerHost'}
    getCanvasId() { return `${this.id}-inner`; }
}

Neo.setupClass(InnerCanvasHost);

/** @summary Creates one controllable loader result so a close can occur before its acknowledgement. */
function deferred() {
    let resolve;
    const promise = new Promise(done => {resolve = done;});
    return {promise, resolve};
}

test.describe('SharedCanvas renderer admission', () => {
    let hosts, events, calls, original, renderer;

    test.beforeEach(() => {
        hosts = []; events = []; calls = [];
        original = {
            Canvas  : Neo.worker.Canvas, start: Neo.worker.Manager.startWorker,
            ready   : Neo.currentWorker.whenCanvasReady, error: console.error,
            renderer: Neo.ns('Test.SharedCanvasAdmission', true).Renderer
        };
        delete Neo.ns('Test.SharedCanvasAdmission').Renderer;
        renderer = {
            initGraph(data) {calls.push(['initGraph', data]);},
            clearGraph(data) {calls.push(['clearGraph', data]);},
            setTheme(data) {calls.push(['setTheme', data]);},
            pause() {}, resume() {}
        };
        Neo.worker.Manager.startWorker = async () => {};
        Neo.currentWorker.whenCanvasReady = async () => {};
        Neo.worker.Canvas = {
            loadModule: async () => ({success: true}),
            unregisterCanvas(data) {calls.push(['unregisterCanvas', data]);}
        };
        console.error = (...args) => calls.push(['error', ...args]);
    });

    test.afterEach(() => {
        hosts.forEach(host => {if (!host.isDestroyed) host.destroy();});
        Neo.worker.Canvas = original.Canvas;
        Neo.worker.Manager.startWorker = original.start;
        Neo.currentWorker.whenCanvasReady = original.ready;
        console.error = original.error;
        const namespace = Neo.ns('Test.SharedCanvasAdmission');
        original.renderer === undefined ? delete namespace.Renderer : namespace.Renderer = original.renderer;
    });

    /** @summary Uses real Neo construction and its one initAsync invocation, with instance-owned bounded waits. */
    function create(config = {}) {
        const host = Neo.create(AdmissionHost, {windowId:'admission-window', ...config});
        host.on('canvasLoadFailed', data => events.push(data));
        const timeout = host.timeout;
        host.timeout = delay => timeout.call(host, 0);
        hosts.push(host);
        return host;
    }

    for (const hasStub of [false, true]) {
        test(`negative module result with ${hasStub ? 'an existing' : 'no'} stub settles without graph admission`, async () => {
            if (hasStub) Neo.ns('Test.SharedCanvasAdmission').Renderer = renderer;
            Neo.worker.Canvas.loadModule = async () => ({success:false, path:'apps/probe/canvas/Renderer', error:'refused'});
            const host = create();
            await host.ready();
            host.offscreenRegistered = true;
            await host.registrationFlight;
            expect(host.isCanvasReady).toBe(false);
            expect(events).toHaveLength(1);
            expect(events[0]).toMatchObject({source:host.id,windowId:'admission-window',reason:'module-load-failed'});
            expect(calls.filter(([name]) => ['initGraph','setTheme'].includes(name))).toEqual([]);
            expect(host.sizes).toBe(0);
            host.destroy();
            expect(calls.filter(([name]) => name === 'clearGraph')).toEqual([]);
        });
    }

    test('successful import waits for its delayed stub and owns one graph', async () => {
        const host   = create(), timeout = host.timeout;
        let   waited = 0;
        host.timeout = delay => {waited++; Neo.ns('Test.SharedCanvasAdmission').Renderer = renderer; return timeout(delay);};
        await host.ready();
        expect(waited).toBe(1);
        host.offscreenRegistered = true;
        await host.registrationFlight;
        expect(host.isCanvasReady).toBe(true);
        expect(calls.filter(([name]) => name === 'initGraph')).toHaveLength(1);
        expect(host.sizes).toBe(1);
        expect(events).toEqual([]);
        host.destroy();
        expect(calls.filter(([name]) => name === 'clearGraph')).toHaveLength(1);
    });

    test('a preloaded renderer retains the no-import-path graph path', async () => {
        Neo.ns('Test.SharedCanvasAdmission').Renderer = renderer;
        Neo.worker.Canvas.loadModule = async () => {throw new Error('preloaded path must not import');};
        const host = create({rendererImportPath:null});
        await host.ready();
        host.offscreenRegistered = true;
        await host.registrationFlight;
        expect(host.isCanvasReady).toBe(true);
        expect(calls.filter(([name]) => name === 'initGraph')).toHaveLength(1);
    });

    test('destroy unregisters the actual transferred inner canvas id', async () => {
        Neo.ns('Test.SharedCanvasAdmission').Renderer = renderer;
        const host = Neo.create(InnerCanvasHost, {windowId:'admission-window',rendererImportPath:null});
        hosts.push(host);
        await host.ready();
        host.offscreenRegistered = true;
        await host.registrationFlight;
        const nodeId = host.getCanvasId();
        host.destroy();
        expect(calls.filter(([name])=>name==='unregisterCanvas')).toEqual([['unregisterCanvas',{nodeId,windowId:'admission-window'}]]);
    });

    for (const success of [false, true]) {
        test(`destroy during import fences the late ${success ? 'success' : 'failure'}`, async () => {
            Neo.ns('Test.SharedCanvasAdmission').Renderer = renderer;
            const load = deferred(), started = deferred();
            Neo.worker.Canvas.loadModule = () => {started.resolve(); return load.promise;};
            const host = create();
            await started.promise;
            host.destroy();
            load.resolve({success, error:success ? undefined : 'refused'});
            await new Promise(resolve => setTimeout(resolve, 10));
            expect(events).toEqual([]);
            expect(calls.filter(([name]) => ['initGraph','clearGraph','setTheme'].includes(name))).toEqual([]);
            expect(host.isDestroyed).toBe(true);
        });
    }

    test('worker-start rejection settles the host and emits a failure', async () => {
        Neo.worker.Manager.startWorker = async () => {throw new Error('worker unavailable');};
        const host = create();
        await host.ready();
        expect(host.isCanvasReady).toBe(false);
        expect(events).toHaveLength(1);
        expect(events[0].reason).toBe('worker-unavailable');
    });

    test('a rejected loader acknowledgement is reported without stranding readiness', async () => {
        Neo.worker.Canvas.loadModule = async () => {throw new Error('loader channel failed');};
        const host = create();
        await host.ready();
        expect(events).toHaveLength(1);
        expect(events[0]).toMatchObject({reason:'module-load-failed',message:'loader channel failed'});
        expect(host.isCanvasReady).toBe(false);
    });

    test('a refused renderer still mounts its component shell without transferring Canvas ownership', async () => {
        const previous  = Neo.main.DomAccess;
        let   transfers = 0, mounted = 0;
        Neo.main.DomAccess = {transferCanvasToWorker() {transfers++;}};
        Neo.worker.Canvas.loadModule = async () => ({success:false,error:'refused'});
        const host = create({offscreen:true});
        host.on('mounted', () => {mounted++;});
        try {
            await host.ready();
            host.mounted = true;
            await host.mountedFlight;
            expect(mounted).toBe(1);
            expect(host.hasBeenMounted).toBe(true);
            expect(transfers).toBe(0);
            expect(host.offscreenRegistered).toBe(false);
        } finally {
            Neo.main.DomAccess = previous;
        }
    });

    test('a load acknowledgement from the previous window cannot admit the moved host', async () => {
        Neo.ns('Test.SharedCanvasAdmission').Renderer = renderer;
        const load = deferred(), started = deferred();
        Neo.worker.Canvas.loadModule = () => {started.resolve(); return load.promise;};
        const host = create();
        await started.promise;
        host.windowId = 'another-admission-window';
        load.resolve({success:true});
        await host.ready();
        expect(events).toEqual([]);
        expect(host.rendererAdmitted).toBe(false);
        expect(calls.filter(([name]) => ['initGraph','clearGraph'].includes(name))).toEqual([]);
    });

    test('close during graph initialization releases its original owner once and prevents late readiness', async () => {
        Neo.ns('Test.SharedCanvasAdmission').Renderer = renderer;
        const graph = deferred(), started = deferred();
        renderer.initGraph = data => {calls.push(['initGraph',data]); started.resolve(); return graph.promise;};
        const host = create({rendererImportPath:null});
        await host.ready();
        host.offscreenRegistered = true;
        const registration = host.registrationFlight;
        await started.promise;
        host.destroy();
        graph.resolve();
        await registration;
        expect(host.isCanvasReady).toBe(false);
        expect(calls.filter(([name]) => name === 'clearGraph')).toEqual([['clearGraph',{windowId:'admission-window'}]]);
    });

    test('a missing stub at the existing bound is failure rather than Canvas readiness', async () => {
        const host = create();
        await host.ready();
        expect(events).toHaveLength(1);
        expect(events[0].reason).toBe('renderer-unavailable');
        expect(host.isCanvasReady).toBe(false);
    });

    test('a throwing failure listener does not strand live host readiness', async () => {
        Neo.worker.Canvas.loadModule = async () => ({success:false,error:'refused'});
        const host = create();
        host.on('canvasLoadFailed', () => {throw new Error('listener failure');});
        await host.ready();
        expect(host.isCanvasReady).toBe(false);
        expect(events).toHaveLength(1);
    });
});
