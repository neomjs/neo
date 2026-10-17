import {setup} from '../../../../setup.mjs';

setup({
    appConfig: {
        name: 'WorkstationJourneyDriverTest'
    }
});

import {test, expect}      from '@playwright/test';
import Neo                 from '../../../../../../src/Neo.mjs';
import * as core           from '../../../../../../src/core/_export.mjs';
import NativeGestureDriver from '../../../../../../apps/workstation/tour/NativeGestureDriver.mjs';

/**
 * @summary The journey executor's two derivations, pinned on their own: a hop's entry probe is
 * released on every exit (a settled hop, a rejected leg, a destroyed driver), and the every-hop
 * continuity claim is derived from the per-hop ledger, so equal endpoints around a replaced
 * middle never pass. The gesture itself is the film witness's authority
 * (`e2e/workstation/WorkstationFilmTourNL.spec.mjs`).
 */
test.describe('apps/workstation/tour/NativeGestureDriver — the journey\'s probes and continuity', () => {
    /**
     * A tabs stand-in that counts its listeners per event.
     * @returns {Object}
     */
    function fakeTabs() {
        const listeners = new Map();

        return {
            count(name) {
                return listeners.get(name)?.size ?? 0
            },
            fire(name) {
                listeners.get(name)?.forEach(fn => fn())
            },
            on(name, fn) {
                listeners.set(name, (listeners.get(name) ?? new Set()).add(fn))
            },
            un(name, fn) {
                listeners.get(name)?.delete(fn)
            }
        }
    }

    test('a settled hop returns its result with the entry it saw, and holds no probe afterwards', async () => {
        const tabs = fakeTabs();

        const result = await NativeGestureDriver.withEntryProbe(tabs, async () => {
            expect(tabs.count('dockTearOutEntry'), 'one probe during the hop').toBe(1);
            tabs.fire('dockTearOutEntry');

            return {retired: true}
        });

        expect(result).toEqual({entrySeen: true, retired: true});
        expect(tabs.count('dockTearOutEntry'), 'no probe after the hop').toBe(0)
    });

    test('a hop that rejects — a cancelled leg, a destroyed driver mid-wait — lets its probe go', async () => {
        const tabs = fakeTabs();

        await expect(NativeGestureDriver.withEntryProbe(tabs, async () => {
            expect(tabs.count('dockTearOutEntry')).toBe(1);
            throw new Error('driver destroyed during the readiness wait')
        })).rejects.toThrow('driver destroyed during the readiness wait');

        expect(tabs.count('dockTearOutEntry'), 'no retained hop listener after a rejection').toBe(0)
    });

    test('a hop that never saw an entry says so, and still releases its probe', async () => {
        const tabs = fakeTabs();

        expect(await NativeGestureDriver.withEntryProbe(tabs, async () => ({claimed: false}))).toEqual({claimed: false, entrySeen: false});
        expect(tabs.count('dockTearOutEntry')).toBe(0)
    });

    test('continuity is the ledger, not the endpoints: a replacement in the middle fails the claim even when the drop reads the original', () => {
        const same = hop => ({destroyed: false, hop, paneId: 'pane-commits', same: true});

        // six hops and the drop, one live pane throughout
        expect(NativeGestureDriver.continuityPreserved([0, 1, 2, 3, 4, 5, 'drop'].map(same), 7)).toBe(true);

        // an intermediate replacement that returns to the original before the drop: equal endpoints, broken middle
        expect(NativeGestureDriver.continuityPreserved([
            same(0), same(1), {destroyed: false, hop: 2, paneId: 'pane-replacement', same: false}, same(3), same(4), same(5), same('drop')
        ], 7)).toBe(false);

        // a destroyed instance read at a hop
        expect(NativeGestureDriver.continuityPreserved([same(0), {...same(1), destroyed: true}, same(2), same(3), same(4), same(5), same('drop')], 7)).toBe(false);

        // a missing pane at a hop
        expect(NativeGestureDriver.continuityPreserved([same(0), {destroyed: false, hop: 1, paneId: null, same: false}, same(2), same(3), same(4), same(5), same('drop')], 7)).toBe(false);

        // a ledger shorter than the journey never passes, whatever its entries say
        expect(NativeGestureDriver.continuityPreserved([same(0), same('drop')], 7)).toBe(false)
    })
});
