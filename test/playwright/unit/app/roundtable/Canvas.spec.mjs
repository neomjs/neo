/**
 * @file test/playwright/unit/app/roundtable/Canvas.spec.mjs
 * @summary Pins what `Neo.app.roundtable.Canvas` hands its renderer: every input once the canvas is ready and each
 * alone when it changes, the statement measured relative to the canvas, a record loaded from a file, and stillness
 * as the motion vocabulary answers it.
 */

import {setup} from '../../../setup.mjs';

setup({appConfig: {name: 'RoundTableCanvasHostTest'}});

import {test, expect}   from '@playwright/test';
import Neo              from '../../../../../src/Neo.mjs';
import * as core        from '../../../../../src/core/_export.mjs';
import RoundTableCanvas from '../../../../../src/app/roundtable/Canvas.mjs';

/**
 * A host without its worker and DOM seams: no renderer module to load, no canvas to transfer, no size to observe.
 * @class Neo.test.app.roundtable.Host
 * @extends Neo.app.roundtable.Canvas
 */
class Host extends RoundTableCanvas {
    static config = {
        className         : 'Neo.test.app.roundtable.Host',
        monitorSize       : false,
        offscreen         : false,
        rendererClassName : 'Neo.test.app.roundtable.Renderer',
        rendererImportPath: null
    }
}

Neo.setupClass(Host);

const
    calls    = [],
    note     = name => data => {calls.push([name, data])},
    renderer = {
        clearGraph() {}, pause() {}, resume() {}, setTheme() {},
        getStats : data => ({asked: data}),
        setLook  : note('setLook'),
        setMotion: note('setMotion'),
        setQuiet : note('setQuiet'),
        setRecord: note('setRecord')
    },
    look     = {palettes: {dark: {ink: '#fff'}}},
    record   = {items: [], seats: []},
    address  = host => ({canvasId: host.getCanvasId(), windowId: 'roundtable-window'});

test.describe('Neo.app.roundtable.Canvas — what the host hands its renderer', () => {
    let host, originalFetch, originalMain;

    test.beforeEach(() => {
        Neo.ns('Neo.test.app.roundtable', true).Renderer = renderer;
        calls.length  = 0;
        originalFetch = globalThis.fetch;
        originalMain  = Neo.main;

        Neo.apps['roundtable-window'] = {on() {}, un() {}};
        host = Neo.create(Host, {look, windowId: 'roundtable-window'})
    });

    test.afterEach(() => {
        host.isDestroyed || host.destroy();
        delete Neo.apps['roundtable-window'];
        globalThis.fetch = originalFetch;
        Neo.main         = originalMain
    });

    test('a canvas that becomes ready receives the look, the motion and the record; later each crosses alone', () => {
        host.record = record;
        expect(calls, 'nothing crosses before the canvas is ready').toEqual([]);

        host.isCanvasReady = true;

        expect(calls).toEqual([
            ['setLook',   {...look, ...address(host)}],
            ['setMotion', {still: true, ...address(host)}],
            ['setRecord', {record, ...address(host)}]
        ]);

        calls.length = 0;
        host.still   = false;
        host.record  = null;

        expect(calls).toEqual([['setMotion', {still: false, ...address(host)}], ['setRecord', {record: null, ...address(host)}]])
    });

    test('the statement is measured once per burst and handed over relative to the canvas', async () => {
        let reads = 0;

        host.isCanvasReady = true;
        host.canvasRect    = {x: 10, y: 58};
        host.blockIds      = ['logo', 'sentence', 'gone'];
        host.bandIds       = ['headline'];
        host.getDomRect    = async ids => {
            reads++;
            expect(ids).toEqual(['logo', 'sentence', 'gone', 'headline']);
            return [{height: 100, width: 388, x: 536, y: 245}, {height: 96, width: 700, x: 380, y: 505}, null, {height: 80, width: 1238, x: 111, y: 385}]
        };
        calls.length = 0;

        host.measureStatement();
        await host.measureStatement();

        expect(reads).toBe(1);
        expect(calls).toEqual([['setQuiet', {
            bands : [{height: 80, width: 1238, x: 101, y: 327}],
            blocks: [{height: 100, width: 388, x: 526, y: 187}, {height: 96, width: 700, x: 370, y: 447}],
            ...address(host)
        }]])
    });

    test('a table without a statement names an empty one, and a read that fails names nothing', async () => {
        host.isCanvasReady = true;
        host.canvasRect    = {x: 0, y: 0};
        calls.length       = 0;

        await host.measureStatement();
        expect(calls).toEqual([['setQuiet', {bands: [], blocks: [], ...address(host)}]]);

        calls.length    = 0;
        host.blockIds   = ['logo'];
        host.getDomRect = async () => {throw new Error('no window')};

        await host.measureStatement();
        expect(calls).toEqual([])
    });

    test('the host follows each of the statement\'s components once, and measures again when one changes its size', () => {
        const listeners = [], original = Neo.getComponent, component = id => ({addDomListeners: config => listeners.push([id, config])});

        Neo.getComponent = id => id === 'gone' ? null : component(id);

        try {
            host.blockIds = ['logo', 'gone'];
            host.bandIds  = ['headline'];

            host.watchStatement();
            host.watchStatement();
        } finally {
            Neo.getComponent = original
        }

        expect(listeners.map(([id]) => id)).toEqual(['logo', 'headline']);
        expect(listeners[0][1]).toEqual({resize: host.measureStatement, scope: host})
    });

    test('a host that goes takes its listener back from the statement\'s components that remain', () => {
        const added = [], removed = [], original = Neo.getComponent, component = id => ({
            addDomListeners   : config => added.push([id, config]),
            removeDomListeners: config => removed.push([id, config])
        });

        Neo.getComponent = component;

        try {
            host.blockIds = ['logo'];
            host.bandIds  = ['headline'];
            host.watchStatement();

            // the logo went before the host does
            Neo.getComponent = id => id === 'logo' ? null : component(id);
            host.destroy()
        } finally {
            Neo.getComponent = original
        }

        expect(added.map(([id]) => id)).toEqual(['logo', 'headline']);
        expect(removed.map(([id]) => id)).toEqual(['headline']);
        expect(removed[0][1], 'the listener it added, not a copy').toBe(added[1][1])
    });

    test('a record url loads its file; a file that is missing or unreadable leaves the table without a record', async () => {
        const settled = () => new Promise(resolve => setTimeout(resolve, 5));

        globalThis.fetch = async url => ({json: async () => ({...record, from: url}), ok: true});
        host.recordUrl   = 'week.json';
        await settled();
        expect(host.record).toEqual({...record, from: 'week.json'});

        globalThis.fetch = async () => ({json: async () => ({}), ok: false});
        host.recordUrl   = 'missing.json';
        await settled();
        expect(host.record).toBeNull();

        host.record      = record;
        globalThis.fetch = async () => {throw new Error('offline')};
        host.recordUrl   = 'offline.json';
        await settled();
        expect(host.record).toBeNull()
    });

    test('the scene moves only where the motion vocabulary allows it', async () => {
        const answer = value => {
            Neo.main = {DomAccess: {getComputedStyle: async () => value instanceof Error ? Promise.reject(value) : {'--neo-duration-base': value}}}
        };

        host._mounted = true;

        answer(' 200ms');
        await host.readMotion();
        expect(host.still).toBe(false);

        answer('0ms');
        await host.readMotion();
        expect(host.still, 'reduced motion collapses the base to 0ms').toBe(true);

        host.still = false;
        answer(new Error('no window'));
        await host.readMotion();
        expect(host.still, 'a read that fails keeps the scene still').toBe(true)
    });

    test('the stats come from the renderer once the canvas is ready', async () => {
        expect(await host.readStats()).toBeNull();

        host.isCanvasReady = true;

        expect(await host.readStats()).toEqual({asked: address(host)})
    })
});
