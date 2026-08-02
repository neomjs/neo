import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../../src/core/_export.mjs';
import {buildMiniSummaryStarvationDiagnosis,
        DEFAULT_MIN_SUSTAINED_PASSES}                             from '../../../../../../../ai/daemons/orchestrator/services/miniSummaryStarvationDiagnosis.mjs';

// Pure detect-producer (no I/O). A window of backfill passes that process rows and complete none, with
// failures landing on a generation branch, is generation-timeout starvation → a `contention`
// recovery-diagnosis. Anything short of sustained, or any completing work → null.

const starved = (failedInner, failedOuter) => ({
          processed     : failedInner + failedOuter, updated: 0, deferred: failedInner + failedOuter,
          missingContent: 0, exhausted: 0, runBudgetHit: false, failedInner, failedOuter
      }),
      healthy  = () => ({
          processed  : 2, updated: 2, deferred: 0, missingContent: 0, exhausted: 0, runBudgetHit: false,
          failedInner: 0, failedOuter: 0
      });

test.describe('buildMiniSummaryStarvationDiagnosis — generation-timeout starvation detect-producer', () => {
    test('a sustained starved window -> a contention recovery-diagnosis, never crash', () => {
        const diag = buildMiniSummaryStarvationDiagnosis({
            passes    : [starved(3, 0), starved(4, 0), starved(3, 0)],
            observedAt: 1000,
            serviceId : 'memory-core'
        });

        expect(diag).not.toBeNull();
        // A model-dependent canary classifies as contention/degraded FIRST, never "restart now" — the
        // service answers A2A and persists memory throughout, so a restart fixes nothing.
        expect(diag.recoveryClass).toBe('contention');
        expect(diag.targetIdentity).toEqual({kind: 'compose-service', id: 'memory-core'});
        expect(diag.details.reasonCode).toBe('minisummary-generation-timeout-starvation');
        expect(diag.details.sustainedPasses).toBe(3);
    });

    test('one starved pass is advisory, not a diagnosis (a spike is not saturation)', () => {
        expect(buildMiniSummaryStarvationDiagnosis({
            passes: [starved(5, 0)], observedAt: 1000, serviceId: 'memory-core'
        })).toBeNull();
    });

    test('a window that completes any work is not starvation, however long', () => {
        expect(buildMiniSummaryStarvationDiagnosis({
            passes    : [starved(3, 0), healthy(), starved(3, 0), starved(3, 0)],
            observedAt: 1000, serviceId: 'memory-core'
        })).toBeNull();
    });

    test('processed rows with no generation failures are not starvation (missing content is not a timeout)', () => {
        const skipped = {
            processed  : 4, updated: 0, deferred: 0, missingContent: 4, exhausted: 0, runBudgetHit: false,
            failedInner: 0, failedOuter: 0
        };

        expect(buildMiniSummaryStarvationDiagnosis({
            passes: [skipped, skipped, skipped], observedAt: 1000, serviceId: 'memory-core'
        })).toBeNull();
    });

    test('dominantBranch names which timeout boundary is binding — the controller cannot widen past the outer one', () => {
        const innerDominant = buildMiniSummaryStarvationDiagnosis({
            passes: [starved(5, 0), starved(4, 1), starved(5, 0)], observedAt: 1000, serviceId: 'memory-core'
        });
        expect(innerDominant.details.dominantBranch).toBe('inner');
        expect(innerDominant.details.failedInnerTotal).toBe(14);
        expect(innerDominant.details.failedOuterTotal).toBe(1);

        // Outer-dominant is the case that matters: widening the inner leaf alone cannot help, because the
        // outer bound is the one the failures are hitting.
        const outerDominant = buildMiniSummaryStarvationDiagnosis({
            passes: [starved(0, 4), starved(1, 3), starved(0, 5)], observedAt: 1000, serviceId: 'memory-core'
        });
        expect(outerDominant.details.dominantBranch).toBe('outer');

        // A tie resolves to `outer` deliberately: an ambiguous window must not read as
        // "widen the inner leaf", which is the move that silently flips every item to the other branch.
        const tied = buildMiniSummaryStarvationDiagnosis({
            passes: [starved(2, 2), starved(2, 2), starved(2, 2)], observedAt: 1000, serviceId: 'memory-core'
        });
        expect(tied.details.dominantBranch).toBe('outer');
    });

    test('evidence carries the per-pass branch split, so a flip is visible to the consumer', () => {
        const diag = buildMiniSummaryStarvationDiagnosis({
            passes    : [starved(4, 0), starved(2, 2), starved(0, 4)],
            observedAt: 1000,
            serviceId : 'memory-core'
        });

        expect(diag.evidenceFacts).toHaveLength(3);
        expect(diag.evidenceFacts.map(fact => fact.failedInner)).toEqual([4, 2, 0]);
        expect(diag.evidenceFacts.map(fact => fact.failedOuter)).toEqual([0, 2, 4]);
        expect(diag.evidenceFacts[0].type).toBe('minisummary-generation-starvation');
    });

    test('the sustain threshold is configurable and defaults to the advisory-guard value', () => {
        expect(DEFAULT_MIN_SUSTAINED_PASSES).toBe(3);

        expect(buildMiniSummaryStarvationDiagnosis({
            passes            : [starved(1, 0), starved(1, 0)], observedAt: 1000, serviceId: 'memory-core',
            minSustainedPasses: 2
        })).not.toBeNull();
    });

    test('missing serviceId or a non-finite observedAt throw rather than emitting a shapeless diagnosis', () => {
        expect(() => buildMiniSummaryStarvationDiagnosis({
            passes: [starved(1, 0)], observedAt: 1000
        })).toThrow(TypeError);

        expect(() => buildMiniSummaryStarvationDiagnosis({
            passes: [starved(1, 0)], observedAt: Number.NaN, serviceId: 'memory-core'
        })).toThrow(TypeError);
    });
});
