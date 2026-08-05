import {setup} from '../../../../setup.mjs';

const appName = 'RestoreDisposableTargetTest';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: false,
        unitTestMode           : true,
        useDomApiRenderer      : false
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
import {parseArgs}    from '../../../../../../ai/scripts/maintenance/restore.mjs';
import {
    assertDisposableRestoreTarget,
    DisposableRestoreTargetError,
    GUARDED_CANONICAL_COLLECTION_NAMES
} from '../../../../../../ai/mcp/server/shared/services/DestructiveOperationGuard.mjs';

/**
 * A restore can be aimed somewhere disposable, and CANNOT be aimed at production.
 *
 * ## Why every case here is paired
 *
 * This guard is the **inverse** of its sibling `assertCanonicalCollectionDeleteAllowed`, which
 * refuses uniformly. Here a non-canonical name must be *admitted* — the whole point is to make a
 * throwaway restore possible — so two degenerate implementations both pass a one-sided suite:
 *
 * - **Refuse everything** passes any test that only checks "a canonical target is rejected", while
 *   leaving the override useless and a restore defect still unreproducible off production.
 * - **Permit everything** passes any test that only checks "a disposable target is accepted", while
 *   leaving production reachable through a diagnostic flag.
 *
 * Neither half witnesses the guard alone, which is why the refusal is asserted in both directions
 * and why each block below carries its own positive control.
 */
test.describe('#16550 — the disposable restore target admits throwaway names and refuses canonical ones', () => {
    test('a disposable name is ACCEPTED and returned trimmed — the permit half', () => {
        expect(assertDisposableRestoreTarget({name: 'neo-knowledge-base-probe-16550'})).toBe('neo-knowledge-base-probe-16550');
        expect(assertDisposableRestoreTarget({name: '  spaced-probe  '})).toBe('spaced-probe');
    });

    test('EVERY canonical name is REFUSED — the refusal half, over the whole set rather than one sample', () => {
        // Iterating the set rather than hardcoding one name: a guard that special-cased
        // `neo-knowledge-base` (the KB canonical, and the only one this code path would normally
        // write) would pass a single-sample test while leaving the four Memory Core collections
        // reachable. A KB restore aimed at `neo-agent-memory` is the case that motivates the union.
        expect(GUARDED_CANONICAL_COLLECTION_NAMES.size).toBeGreaterThan(1);

        for (const canonical of GUARDED_CANONICAL_COLLECTION_NAMES) {
            let thrown = null;

            try {
                assertDisposableRestoreTarget({name: canonical});
            } catch (error) {
                thrown = error;
            }

            expect(thrown, `expected "${canonical}" to be refused`).toBeInstanceOf(DisposableRestoreTargetError);
            expect(thrown.code).toBe('DISPOSABLE_RESTORE_TARGET_REQUIRED');
            expect(thrown.collection).toBe(canonical);
        }
    });

    test('a canonical name is refused even with surrounding whitespace — the trim runs BEFORE the set check', () => {
        // Ordering matters and is not self-evident: trimming after the lookup would let
        // `--target-collection=' neo-knowledge-base '` slip past the set and be created as a
        // separate collection whose name Chroma would then hold with the spaces intact.
        expect(() => assertDisposableRestoreTarget({name: ' neo-knowledge-base '}))
            .toThrow(/DISPOSABLE_RESTORE_TARGET_REQUIRED/);
    });

    test('an absent or empty target REFUSES rather than falling back to canonical', () => {
        // The fallback is the failure mode, not a convenience: a silent default would send a run
        // the caller believes is diagnostic straight into the production corpus.
        for (const bad of [undefined, null, '', '   ', 42, {}]) {
            expect(() => assertDisposableRestoreTarget({name: bad}), `expected ${JSON.stringify(bad)} to refuse`)
                .toThrow(/non-empty `name` string/);
        }

        expect(() => assertDisposableRestoreTarget()).toThrow(/non-empty `name` string/);
    });

    test('the refusal message names the canonical set, so the operator learns WHICH names are blocked', () => {
        const message = new DisposableRestoreTargetError({name: 'neo-knowledge-base'}).message;

        expect(message).toContain('neo-knowledge-base');
        expect(message).toContain('neo-agent-memory');
        // No bypass token is offered. Its sibling guard advertises one; this one must not, and the
        // message is where that difference is visible to whoever hits it.
        expect(message).not.toContain('CONFIRM_PRODUCTION_DESTRUCTIVE_AI_SUBSTRATE');
    });
});

test.describe('#16550 — parseArgs makes a half-diagnostic run inexpressible', () => {
    const bundle = '/tmp/backup-16550';

    test('the documented diagnostic invocation parses', () => {
        const args = parseArgs([bundle, '--mode', 'merge', '--only-substrate=kb', '--target-collection=kb-probe-16550']);

        expect(args.targetCollection).toBe('kb-probe-16550');
        expect(args.onlySubstrate).toEqual(['kb']);
        expect(args.mode).toBe('merge');
    });

    test('both flag spellings are accepted', () => {
        const split = parseArgs([bundle, '--only-substrate=kb', '--target-collection', 'kb-probe-16550']);
        const eq    = parseArgs([bundle, '--only-substrate=kb', '--target-collection=kb-probe-16550']);

        expect(split.targetCollection).toBe('kb-probe-16550');
        expect(eq.targetCollection).toBe('kb-probe-16550');
    });

    test('WITHOUT --only-substrate=kb it refuses — the partial-redirect hazard', () => {
        // The flag redirects `kb` alone. Unrestricted, KB would go somewhere disposable while MC,
        // the graph, concepts and trajectories all landed in production, under a flag whose whole
        // purpose is to touch nothing live. That is worse than the missing capability, because the
        // operator has been told the run is diagnostic.
        expect(() => parseArgs([bundle, '--target-collection=kb-probe-16550']))
            .toThrow(/requires --only-substrate=kb/);
    });

    test('a WIDER substrate set still refuses — the restriction is exact, not merely inclusive', () => {
        // `['kb','mc']` includes kb and would satisfy a naive `.includes('kb')` check while MC
        // still wrote production. This is the control that distinguishes the two implementations.
        expect(() => parseArgs([bundle, '--only-substrate=kb,mc', '--target-collection=kb-probe-16550']))
            .toThrow(/requires --only-substrate=kb/);
        expect(() => parseArgs([bundle, '--only-substrate=mc', '--target-collection=kb-probe-16550']))
            .toThrow(/requires --only-substrate=kb/);
    });

    test('--mode replace is refused in BOTH argument orders', () => {
        // Order-independence is the property: a check reading only the final `mode` would miss
        // nothing here, but a check reading only `stated.mode` would miss the pinned-default path.
        // Asserting both spellings keeps either implementation honest.
        expect(() => parseArgs([bundle, '--only-substrate=kb', '--mode', 'replace', '--target-collection=x-16550']))
            .toThrow(/cannot be combined with --mode replace/);
        expect(() => parseArgs([bundle, '--only-substrate=kb', '--target-collection=x-16550', '--mode', 'replace']))
            .toThrow(/cannot be combined with --mode replace/);
    });

    test('a missing value is refused rather than swallowing the next flag', () => {
        // `--target-collection --force` would otherwise bind the literal string '--force' as a
        // collection name, create it, and report success on a run that restored into a collection
        // named after a flag.
        expect(() => parseArgs([bundle, '--only-substrate=kb', '--target-collection', '--force']))
            .toThrow(/requires a collection name/);
    });

    test('omitting the override leaves the canonical path untouched — the no-op control', () => {
        // The existing contract must be unchanged when the flag is absent, otherwise this ticket
        // has altered the ordinary restore path it was scoped not to touch.
        const args = parseArgs([bundle, '--mode', 'replace', '--force']);

        expect(args.targetCollection).toBe(null);
        expect(args.mode).toBe('replace');
        expect(args.force).toBe(true);
    });
});
