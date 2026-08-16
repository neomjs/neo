import {setup} from '../../../../setup.mjs';

const appName = 'ViewerWakeFeedStoreTest';

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';
import ViewerWakeFeed from '../../../../../../apps/agentos/store/ViewerWakeFeed.mjs';

/**
 * The per-viewer wake feed — a telltale's detail, not an archive. These specs pin
 * the three properties the rendering relies on: newest-first BY CONSTRUCTION (`addSignal` inserts
 * at the head), the bound (the oldest falls off, never the newest), and re-receipt semantics (a
 * duplicate `eventId` moves to the head rather than double-counting — reconnects re-push).
 */
test.describe('AgentOS.store.ViewerWakeFeed — bounded newest-first wake telltale detail', () => {
    const signal = (n, extra = {}) => ({
        eventId       : `01H-EVENT-${n}`,
        subscriptionId: 'sub-9',
        kind          : 'wake/digest',
        logId         : n,
        emittedAt     : `2026-08-16T19:0${n % 10}:00.000Z`,
        receivedAt    : 1000 + n,
        ...extra
    });

    test('addSignal is newest-first by construction and keeps the envelope fields verbatim', () => {
        const store = Neo.create(ViewerWakeFeed, {});

        store.addSignal(signal(1));
        store.addSignal(signal(2));
        store.addSignal(signal(3));

        expect(store.getCount()).toBe(3);
        expect(store.items.map(record => record.eventId)).toEqual(['01H-EVENT-3', '01H-EVENT-2', '01H-EVENT-1']);

        const newest = store.getAt(0);

        expect(newest.kind).toBe('wake/digest');
        expect(newest.logId).toBe(3);
        expect(newest.emittedAt).toBe('2026-08-16T19:03:00.000Z');
        expect(newest.receivedAt).toBe(1003);
        expect(newest.subscriptionId).toBe('sub-9');

        store.destroy()
    });

    test('the bound evicts the OLDEST signal, never the newest', () => {
        const store = Neo.create(ViewerWakeFeed, {maxSignals: 3});

        [1, 2, 3, 4, 5].forEach(n => store.addSignal(signal(n)));

        expect(store.getCount()).toBe(3);
        expect(store.items.map(record => record.eventId)).toEqual(['01H-EVENT-5', '01H-EVENT-4', '01H-EVENT-3']);

        store.destroy()
    });

    test('a re-pushed eventId moves to the head instead of double-counting', () => {
        const store = Neo.create(ViewerWakeFeed, {});

        store.addSignal(signal(1));
        store.addSignal(signal(2));
        // the reconnect re-push: same envelope identity, later receipt
        store.addSignal(signal(1, {receivedAt: 9999}));

        expect(store.getCount()).toBe(2);
        expect(store.items.map(record => record.eventId)).toEqual(['01H-EVENT-1', '01H-EVENT-2']);
        expect(store.getAt(0).receivedAt).toBe(9999);

        store.destroy()
    });

    test('keyProperty is the envelope identity — records resolve by eventId', () => {
        const store = Neo.create(ViewerWakeFeed, {});

        store.addSignal(signal(7));
        expect(store.get('01H-EVENT-7')?.logId).toBe(7);
        expect(store.get('01H-EVENT-7')?.kind).toBe('wake/digest');

        store.destroy()
    })
});
