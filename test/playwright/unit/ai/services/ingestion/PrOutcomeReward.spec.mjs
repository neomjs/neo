import {test, expect}                                                from '@playwright/test';
import {PR_OUTCOME_REWARDS, classifyPrOutcome, computeOutcomeReward} from '../../../../../../ai/services/ingestion/PrOutcomeReward.mjs';

test.describe('ai/services/ingestion/PrOutcomeReward', () => {
    test.describe('classifyPrOutcome', () => {
        test('merged clean → mergedClean', () => {
            expect(classifyPrOutcome({merged: true})).toBe('mergedClean');
        });

        test('merged with requested changes → mergedWithChanges', () => {
            expect(classifyPrOutcome({merged: true, hadRequestedChanges: true})).toBe('mergedWithChanges');
        });

        test('closed unmerged → closedUnmerged', () => {
            expect(classifyPrOutcome({merged: false})).toBe('closedUnmerged');
        });

        test('reverted dominates merge (regardless of requested-changes) → reverted', () => {
            expect(classifyPrOutcome({merged: true, reverted: true})).toBe('reverted');
            expect(classifyPrOutcome({merged: true, hadRequestedChanges: true, reverted: true})).toBe('reverted');
        });

        test('unmerged-and-not-reverted ignores requested-changes history', () => {
            expect(classifyPrOutcome({merged: false, hadRequestedChanges: true})).toBe('closedUnmerged');
        });

        test('empty / no-arg defaults to closedUnmerged (merged is falsy)', () => {
            expect(classifyPrOutcome()).toBe('closedUnmerged');
            expect(classifyPrOutcome({})).toBe('closedUnmerged');
        });
    });

    test.describe('computeOutcomeReward', () => {
        test('maps each outcome key to its scalar', () => {
            expect(computeOutcomeReward('mergedClean')).toBe(1.0);
            expect(computeOutcomeReward('mergedWithChanges')).toBe(0.7);
            expect(computeOutcomeReward('closedUnmerged')).toBe(0.0);
            expect(computeOutcomeReward('reverted')).toBe(-1.0);
        });

        test('accepts a raw state object (classify + reward in one call)', () => {
            expect(computeOutcomeReward({merged: true})).toBe(1.0);
            expect(computeOutcomeReward({merged: true, reverted: true})).toBe(-1.0);
            expect(computeOutcomeReward({merged: false})).toBe(0.0);
        });

        test('unrecognized outcome key → null', () => {
            expect(computeOutcomeReward('bogus')).toBe(null);
        });
    });

    test.describe('PR_OUTCOME_REWARDS', () => {
        test('is frozen — callers cannot mutate the shared signal definition', () => {
            expect(Object.isFrozen(PR_OUTCOME_REWARDS)).toBe(true);
        });

        test('reverted is the only negative (actively-harmful) signal', () => {
            const negatives = Object.entries(PR_OUTCOME_REWARDS).filter(([, v]) => v < 0).map(([k]) => k);
            expect(negatives).toEqual(['reverted']);
        });
    });
});
