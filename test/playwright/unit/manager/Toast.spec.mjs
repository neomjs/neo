import { setup } from '../../setup.mjs';

setup();

import { test, expect } from '@playwright/test';

import Neo from '../../../../src/Neo.mjs';
import * as core from '../../../../src/core/_export.mjs';
import ToastManager from '../../../../src/manager/Toast.mjs';

test('returns null for invalid position', () => {
    const result = ToastManager.createToast({
        position: 'xx',
        msg: 'hi',
        appName: 'A'
    });

    expect(result).toBeNull();
});

test('returns null when msg is missing', () => {
    const result = ToastManager.createToast({
        appName: 'A'
    });

    expect(result).toBeNull();
});

test('returns null when appName is missing', () => {
    const result = ToastManager.createToast({
        msg: 'hi'
    });

    expect(result).toBeNull();
});

test('Neo.toast calls the Toast manager', () => {
    expect(typeof Neo.toast).toBe('function');

    const result = Neo.toast({
        position: 'xx',
        msg: 'hi',
        appName: 'A'
    });

    expect(result).toBeNull();
});

test('has the expected default configuration', () => {
    expect(ToastManager.maxToasts).toBe(3);

    const positions = ['tl', 'tc', 'tr', 'bl', 'bc', 'br'];

    expect(Object.keys(ToastManager.running).sort())
        .toEqual([...positions].sort());

    for (const position of positions) {
        expect(ToastManager.running[position]).toEqual([]);
    }
});

test('tracks running toasts per appName, admits per windowId realm, and stacks realms concurrently via updateItemsInPosition', async () => {
    const
        rectCalls = [],
        makeToast = ({id, appName, windowId, position = 'tr', height = 50}) => ({
            id,
            appName,
            windowId,
            position,
            running: false,
            style  : {},
            height,
            initVnode() {},
            update() {},
            async getDomRect(ids, winId) {
                rectCalls.push({ids, windowId: winId});
                return ids.map(itemId => ({height: ToastManager.get(itemId)?.height || 50}));
            }
        });

    const
        w1a = makeToast({id: 'toast-w1-a', appName: 'MultiWinApp', windowId: 1, height: 40}),
        w1b = makeToast({id: 'toast-w1-b', appName: 'MultiWinApp', windowId: 1, height: 60}),
        w1c = makeToast({id: 'toast-w1-c', appName: 'MultiWinApp', windowId: 1, height: 50}),
        w2a = makeToast({id: 'toast-w2-a', appName: 'MultiWinApp', windowId: 2, height: 80}),
        w2b = makeToast({id: 'toast-w2-b', appName: 'MultiWinApp', windowId: 2, height: 70});

    try {
        ToastManager.register(w1a);
        ToastManager.register(w1b);
        ToastManager.register(w1c);
        ToastManager.register(w2a);
        ToastManager.register(w2b);

        expect(ToastManager.running.MultiWinApp.tr).toEqual([
            'toast-w2-b', 'toast-w2-a', 'toast-w1-c', 'toast-w1-b', 'toast-w1-a'
        ]);
        expect(w1a.running).toBe(true);
        expect(w1b.running).toBe(true);
        expect(w1c.running).toBe(true);
        expect(w2a.running).toBe(true);
        expect(w2b.running).toBe(true);

        rectCalls.length = 0;
        await ToastManager.updateItemsInPosition('toast-w2-b');

        expect(rectCalls).toEqual([
            {ids: ['toast-w2-b', 'toast-w2-a'], windowId: 2},
            {ids: ['toast-w1-c', 'toast-w1-b', 'toast-w1-a'], windowId: 1}
        ]);

        // Window 2 stacks independently from top: 16px (margin=16, w2b height=70 -> w2a at 16+70+16 = 102px)
        expect(w2b.style.top).toBe('16px');
        expect(w2a.style.top).toBe('102px');

        // Window 1 stacks independently from top: 16px (w1c=50 -> w1b at 82px, w1b=60 -> w1a at 158px)
        expect(w1c.style.top).toBe('16px');
        expect(w1b.style.top).toBe('82px');
        expect(w1a.style.top).toBe('158px');
    } finally {
        for (const t of [w1a, w1b, w1c, w2a, w2b]) {
            ToastManager.removeToast(t.id);
            ToastManager.unregister(t);
        }
        delete ToastManager.running.MultiWinApp;
    }
});