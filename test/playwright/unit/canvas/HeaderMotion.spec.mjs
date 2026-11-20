import {setup} from '../../setup.mjs';

setup({appConfig: {name: 'HeaderMotionTest'}});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import HeaderCanvas   from '../../../../src/app/header/Canvas.mjs';
import header         from '../../../../src/canvas/Header.mjs';

test.describe('Header motion preference', () => {
    test('an input repaints a still header while the animation clock stays stopped', () => {
        let   frames  = 0;
        const context = new Proxy({
            canvas  : {},
            clearRect() {frames++}
        }, {get: (target, name) => target[name] ?? (() => ({addColorStop() {}}))});

        header.clearGraph();
        header.context = context;
        try {
            header.updateNavRects({width: 400, height: 58, rects: [{id: 'home', x: 25, y: 5, width: 72, height: 48}]});
            const first = frames, time = header.time;
            expect(first).toBeGreaterThan(0);
            header.updateActiveId({id: 'home'});
            header.updateHoverId({id: 'home'});
            header.setTheme('dark');
            header.updateSize({width: 390, height: 58});
            expect(frames).toBe(first + 4);
            expect(header.activeId).toBe('home');
            expect(header.time).toBe(time);
            expect(header.animationId).toBeNull();

            header.updateConfig({usePulse: false, still: false});
            expect(header.time).toBeGreaterThan(time);
            expect(header.animationId).not.toBeNull();
            header.updateConfig({still: true});
            expect(header.usePulse).toBe(false);
            expect(header.animationId).toBeNull();
            header.onMouseClick({x: 24, y: 12});
            expect(header.shockwaves).toHaveLength(0);
            header.pause();
            const paused = frames;
            header.updateActiveId({id: null});
            expect(frames).toBe(paused);
            header.resume();
            expect(frames).toBe(paused + 1);
            expect(header.animationId).toBeNull()
        } finally {
            header.clearGraph();
            header.setTheme('light');
            header.usePulse = true
        }
    });

    test('only the current mounted graph receives the latest motion token from its own window', async () => {
        const main = Neo.main, calls = [], reads = [], styles = [],
              host = {id: 'header', windowId: 'one', rendererGraph: {}, isCanvasReady: true, motionRead: 0,
                  renderer: {updateConfig: value => calls.push(value)}};
        Neo.main = {...main, DomAccess: {getComputedStyle: query => {
            reads.push(query);
            return new Promise(resolve => styles.push(resolve))
        }}};
        const read = () => HeaderCanvas.prototype.syncMotion.call(host);
        try {
            const stale = read(), current = read();
            styles[1]({'--motion-base': '0ms'});
            await current;
            styles[0]({'--motion-base': '200ms'});
            await stale;
            expect(reads[0]).toEqual({id: 'header', style: '--motion-base', windowId: 'one'});
            expect(calls).toEqual([{still: true, windowId: 'one'}]);

            const allowed = read();
            styles[2]({'--motion-base': '200ms'});
            await allowed;
            const retired = read();
            host.rendererGraph = {};
            styles[3]({'--motion-base': '0ms'});
            await retired;
            expect(calls).toEqual([{still: true, windowId: 'one'}, {still: false, windowId: 'one'}])
        } finally {
            Neo.main = main
        }
    })
});
