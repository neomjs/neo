import {setup} from '../../setup.mjs';

setup({appConfig: {appName: 'TestApp'}});

import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import {test, expect} from '@playwright/test';
import Circle         from '../../../../src/component/Circle.mjs';

test.describe('Circle async lifecycle', () => {
    let originalXhr;

    test.beforeEach(() => {
        originalXhr = Neo.Xhr;
        // Mock Neo.main.DomEvents
        Neo.main = Neo.main || {};
        Neo.main.DomEvents = {
            registerPreventDefaultTargets: () => {}
        };
    });

    test.afterEach(() => {
        if (originalXhr) {
            Neo.Xhr = originalXhr;
        }
        delete Neo.main;
    });

    test('loadData() should reject when destroyed during XHR', async () => {
        let xhrResolve;

        Neo.Xhr = {
            promiseJson: () => new Promise(resolve => { xhrResolve = resolve })
        };

        const instance = Neo.create(Circle, {
            appName: 'TestApp',
            url: 'test.json'
        });

        const loadPromise = instance.loadData();

        instance.destroy();

        try {
            await loadPromise;
        } catch (e) {
            expect(e).toBe(Neo.isDestroyed);
        }

        xhrResolve({ json: { data: [] } });
    });

    test('a late native drag cancellation answer leaves the next item drag active', async () => {
        const requests = [],
              signals  = [],
              cancels  = [],
              ends     = [],
              circle   = Neo.create(Circle, {appName: 'TestApp', draggable: false, url: null, windowId: 1});

        let answer;

        Neo.main.addon = {DragDrop: {
            cancelDrag(data) {
                requests.push(data);
                return new Promise(resolve => { answer = resolve })
            }
        }};

        circle.getItemEl = () => ({id: 'drag-item'});
        circle.dragZone  = {
            dragStart(data, signal) { signals.push(signal) },
            dragEnd(data) { ends.push(data) },
            onDragCancel(data) { cancels.push(data); circle.resetDragStart() }
        };

        try {
            circle.onDragStart({currentTarget: 'drag-item', gestureId: 11});
            circle.onGestureRotate({gestureId: 20, phase: 'start'});
            expect(requests).toEqual([{gestureId: 11, windowId: 1}]);
            expect(signals[0].aborted).toBe(true);

            circle.onGestureRotate({gestureId: 20, phase: 'end', rotation: 0});
            circle.onDragStart({currentTarget: 'drag-item', gestureId: 12});
            answer(false);
            await Promise.resolve();

            expect(cancels).toEqual([]);
            expect(signals[1].aborted).toBe(false);
            circle.onDragEnd({});
            expect(signals[1].aborted).toBe(true);
            expect(ends).toEqual([{}])
        } finally {
            circle.destroy()
        }
    });
});
