import {test, expect} from '@playwright/test';

import {
    DECLARED_INTENT_PROVENANCE,
    FRONTIER_EMPTY_CAUSE,
    PICKUP_BRIDGE_PARENT_ALPHA,
    classifyFrontierEmptyCause,
    inheritParentStructuralWeight,
    rankByDeclaredIntent,
    renderDeclaredIntentFallback,
    shouldActivateFallback
} from '../../../../../../ai/services/graph/goldenPathPickupBridge.mjs';

test.describe('goldenPathPickupBridge', () => {
    test('fallback activates ONLY on an empty frontier or a zero route — never alongside a healthy route', () => {
        expect(shouldActivateFallback({frontierEmpty: true,  routedCount: 5})).toBe(true);
        expect(shouldActivateFallback({frontierEmpty: false, routedCount: 0})).toBe(true);
        // The AC's hard invariant, both directions: a non-empty frontier with a real route must NOT fall back.
        expect(shouldActivateFallback({frontierEmpty: false, routedCount: 5})).toBe(false);
    });

    test('parent-inheritance lifts a cold-start item from 0 to α×parent (makes tree leaves visible to the normal formula)', () => {
        expect(PICKUP_BRIDGE_PARENT_ALPHA).toBe(0.5);
        expect(inheritParentStructuralWeight({structuralWeight: 0, parentStructuralWeight: 4})).toBe(2);
    });

    test('parent-inheritance leaves an already-scored item UNTOUCHED', () => {
        expect(inheritParentStructuralWeight({structuralWeight: 3.5, parentStructuralWeight: 10})).toBe(3.5);
    });

    test('fail-open: inheritance can only lift, never lower', () => {
        // Own 0, no/weak parent → never goes negative or below own.
        expect(inheritParentStructuralWeight({structuralWeight: 0, parentStructuralWeight: 0})).toBe(0);
        // A scored item with a huge parent is still not raised (only cold-start inherits) — and never lowered.
        expect(inheritParentStructuralWeight({structuralWeight: 1.2, parentStructuralWeight: 0})).toBe(1.2);
    });

    test('declared-intent ranking: drops blocked, ranks open-epic membership × activity, recency tiebreak, tags provenance', () => {
        const ranked = rankByDeclaredIntent([
            {id: 'a', inOpenEpic: true,  epicActivity: 3, blocked: false, filedAt: '2026-07-04T01:00:00Z'},
            {id: 'b', inOpenEpic: true,  epicActivity: 3, blocked: false, filedAt: '2026-07-04T02:00:00Z'}, // same score, newer → first
            {id: 'c', inOpenEpic: true,  epicActivity: 0, blocked: false, filedAt: '2026-07-04T03:00:00Z'}, // lower activity
            {id: 'd', inOpenEpic: false, epicActivity: 9, blocked: false, filedAt: '2026-07-04T04:00:00Z'}, // not in an open epic → score 0
            {id: 'x', inOpenEpic: true,  epicActivity: 99, blocked: true,  filedAt: '2026-07-04T05:00:00Z'} // blocked → dropped
        ]);

        expect(ranked.map(r => r.id)).toEqual(['b', 'a', 'c', 'd']); // blocked 'x' absent; b before a on recency; d last (score 0)
        expect(ranked.every(r => r.provenance === DECLARED_INTENT_PROVENANCE)).toBe(true);
        expect(ranked.find(r => r.id === 'x')).toBeUndefined();
    });

    test('empty / non-array input yields an empty ranking (no throw)', () => {
        expect(rankByDeclaredIntent([])).toEqual([]);
        expect(rankByDeclaredIntent(undefined)).toEqual([]);
    });

    test('fallback render leads with the provenance line, lists items, respects the limit', () => {
        const ranked = rankByDeclaredIntent([
            {id: '101', inOpenEpic: true,  epicActivity: 2, filedAt: '2026-07-04T02:00:00Z'},
            {id: '102', inOpenEpic: false, epicActivity: 0, filedAt: '2026-07-04T01:00:00Z'}
        ]);
        const md = renderDeclaredIntentFallback(ranked, 5);

        expect(md).toContain(DECLARED_INTENT_PROVENANCE);          // never masquerades as the semantic ranking
        expect(md).toContain('#101');
        expect(md).toContain('open-epic leaf (activity 2)');
        expect(md).toContain('#102');
        // limit is honored
        expect(renderDeclaredIntentFallback(ranked, 1)).not.toContain('#102');
    });

    test('fallback render is empty when there is nothing to surface (caller renders the empty section)', () => {
        expect(renderDeclaredIntentFallback([])).toBe('');
        expect(renderDeclaredIntentFallback(undefined)).toBe('');
    });

    test('classifyFrontierEmptyCause attributes the MEASURED cause, never a fixed mechanism', () => {
        // Genuine cold-start: no digested history to anchor.
        expect(classifyFrontierEmptyCause({digested: 0, undigested: 0, recentCycleCount: 0, frontierAnchorEmpty: true}).code)
            .toBe(FRONTIER_EMPTY_CAUSE.COLD_START);
        // REM stalled: an undigested backlog with no recent cycle to drain it.
        expect(classifyFrontierEmptyCause({digested: 1460, undigested: 40, recentCycleCount: 0, frontierAnchorEmpty: true}).code)
            .toBe(FRONTIER_EMPTY_CAUSE.REM_STALLED);
        // The daemon-off regression (2026-07-06): digestion healthy, cycles running, anchor STILL empty.
        // This is exactly where the old code lied "REM-starved"; it must now read FRONTIER_UNANCHORED.
        expect(classifyFrontierEmptyCause({digested: 1460, undigested: 7, recentCycleCount: 5, frontierAnchorEmpty: true}).code)
            .toBe(FRONTIER_EMPTY_CAUSE.FRONTIER_UNANCHORED);
        // Signals cannot distinguish a cause → assert nothing.
        expect(classifyFrontierEmptyCause().code).toBe(FRONTIER_EMPTY_CAUSE.UNATTRIBUTED);
    });

    test('fallback render attributes the MEASURED cause and NEVER hardcodes "REM-starved"', () => {
        const ranked = rankByDeclaredIntent([{id: '101', inOpenEpic: true, epicActivity: 2, filedAt: '2026-07-04T02:00:00Z'}]);

        const unanchored = classifyFrontierEmptyCause({digested: 1460, undigested: 7, recentCycleCount: 5, frontierAnchorEmpty: true});
        const md         = renderDeclaredIntentFallback(ranked, 5, unanchored);
        expect(md).toContain(unanchored.phrase);   // the measured cause is rendered verbatim
        expect(md).not.toContain('REM-starved');    // the old hardcoded lie is gone

        // No cause supplied → honest UNATTRIBUTED default, still never the fixed mechanism.
        const noCause = renderDeclaredIntentFallback(ranked, 5);
        expect(noCause).toContain('unattributed');
        expect(noCause).not.toContain('REM-starved');
    });
});
