import {setup} from '../../../../setup.mjs';

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name             : 'CreationFlowStateTest',
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';

test.describe('creationFlowState — the five keeper-flow states as a pure machine (#14711)', () => {
    let S, E, next, applyPreviewOutcome, applyRouteOutcome;

    test.beforeAll(async () => {
        const mod = await import('../../../../../../apps/agentos/view/create/util/creationFlowState.mjs');
        S = mod.CREATION_STATES;
        E = mod.CREATION_EVENTS;
        next = mod.nextCreationState;
        applyPreviewOutcome = mod.applyPreviewOutcome;
        applyRouteOutcome = mod.applyRouteOutcome;
    });

    test('the SSOT wedge flow runs end to end through legal transitions', () => {
        // empty → composing → generating → previewed/composing → generating → materialized
        expect(next(S.EMPTY, E.COMPOSE)).toEqual({state: S.COMPOSING, reason: null, changed: true});
        expect(next(S.COMPOSING, E.SUBMIT).state).toBe(S.GENERATING);
        expect(next(S.GENERATING, E.PREVIEWED).state).toBe(S.COMPOSING);
        expect(next(S.COMPOSING, E.SUBMIT).state).toBe(S.GENERATING);
        expect(next(S.GENERATING, E.ACCEPTED).state).toBe(S.MATERIALIZED);
        expect(next(S.MATERIALIZED, E.DISPOSE).state).toBe(S.EMPTY);

        // the error arm and its recovery: generating → error → (retry) composing
        expect(next(S.GENERATING, E.REFUSED).state).toBe(S.ERROR);
        expect(next(S.ERROR, E.RETRY).state).toBe(S.COMPOSING);

        // reset is legal from every non-empty state (never a dead-end)
        for (const from of [S.COMPOSING, S.GENERATING, S.MATERIALIZED, S.ERROR]) {
            expect(next(from, E.RESET).state).toBe(S.EMPTY);
        }
    });

    test('refused carries the pipeline reason to the ERROR render; legal transitions carry none', () => {
        const refused = next(S.GENERATING, E.REFUSED, {reason: 'blueprint blocked at the safety gate'});
        expect(refused).toEqual({state: S.ERROR, reason: 'blueprint blocked at the safety gate', changed: true});

        // refused with no reason still lands in ERROR with a default (the render always shows a reason)
        expect(next(S.GENERATING, E.REFUSED).reason).toBe('generation refused');

        // a legal non-refused transition carries no reason
        expect(next(S.EMPTY, E.COMPOSE).reason).toBeNull();
    });

    test('illegal transitions leave state unchanged with a reason, never throw', () => {
        // cannot submit from empty, cannot accept from composing, cannot dispose from empty
        const illegal = [
            [S.EMPTY, E.SUBMIT],
            [S.COMPOSING, E.ACCEPTED],
            [S.COMPOSING, E.PREVIEWED],
            [S.EMPTY, E.DISPOSE],
            [S.MATERIALIZED, E.SUBMIT],
            [S.ERROR, E.ACCEPTED]
        ];

        for (const [state, event] of illegal) {
            const result = next(state, event);
            expect(result.state).toBe(state);
            expect(result.changed).toBe(false);
            expect(result.reason).toContain('not legal');
        }

        // unknown event → unchanged + reason; unknown state → reset to empty
        expect(next(S.COMPOSING, 'teleport')).toMatchObject({state: S.COMPOSING, changed: false});
        expect(next('nirvana', E.COMPOSE)).toMatchObject({state: S.EMPTY, changed: true});
    });

    test('applyRouteOutcome maps a real-shaped route result to the terminal fork', () => {
        // accepted → materialized (accept path truth)
        expect(applyRouteOutcome(S.GENERATING, {accepted: true, reason: null}).state).toBe(S.MATERIALIZED);

        // refused → error, reason carried from the pipeline
        const refused = applyRouteOutcome(S.GENERATING, {accepted: false, reason: 'unregistered blueprint schema "iframe@1"'});
        expect(refused.state).toBe(S.ERROR);
        expect(refused.reason).toContain('iframe@1');

        // only resolves from generating — a stray outcome elsewhere is a no-op with a reason
        expect(applyRouteOutcome(S.COMPOSING, {accepted: true}).changed).toBe(false);
        expect(applyRouteOutcome(S.MATERIALIZED, {accepted: false, reason: 'x'}).state).toBe(S.MATERIALIZED);
    });

    test('applyPreviewOutcome maps route acceptance to the human-confirmation card', () => {
        expect(applyPreviewOutcome(S.GENERATING, {accepted: true, reason: null}).state).toBe(S.COMPOSING);

        const refused = applyPreviewOutcome(S.GENERATING, {accepted: false, reason: 'blocked'});
        expect(refused.state).toBe(S.ERROR);
        expect(refused.reason).toBe('blocked');

        expect(applyPreviewOutcome(S.EMPTY, {accepted: true}).changed).toBe(false);
    });
});
