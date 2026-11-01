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