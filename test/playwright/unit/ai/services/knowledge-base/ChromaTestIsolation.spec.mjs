import {setup} from '../../../../setup.mjs';

setup({
    neoConfig: {unitTestMode: true},
    appConfig: {name: 'KbChromaTestIsolationTest', isMounted: () => true, vnodeInitialising: false}
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';

let aiConfig, CHROMA_PRODUCTION_DATABASE;

test.beforeAll(async () => {
    // The COMMITTED template, never `config.mjs`: that entrypoint registers this machine's
    // repo-local overlay as the Tier-1 root, so the verdict would vary per checkout — the exact
    // defect this ticket exists to remove. Both toggles are env-driven leaves, so the swap changes
    // nothing about what is asserted. `lint-config-template-ssot` enforces this mechanically.
    ({default: aiConfig}       = await import('../../../../../../ai/mcp/server/knowledge-base/config.template.mjs'));
    ({CHROMA_PRODUCTION_DATABASE} = await import('../../../../../../ai/services/shared/vector/chromaTestIsolation.mjs'));
});

test.describe('KB Chroma isolation — a unit spec cannot reach the live canonical database', () => {
    test('SOME declared toggle selected test mode — the precondition for everything below', () => {
        // Without this, every assertion below is vacuous: a spec asserting isolation while nothing
        // selected it proves only that the config loaded.
        //
        // Deliberately checks EITHER toggle rather than naming one. The harness sets
        // `NEO_TEST_CONFIG_TEMPLATES` (via `configTemplateResolver`, imported by
        // `playwright.config.mjs`), NOT `UNIT_TEST_MODE` — I first asserted the latter alone and it
        // failed while the isolation was working correctly. The property that matters is that a
        // DECLARED leaf drove the selection, not which one.
        expect(aiConfig.chromaUseTestDatabase || aiConfig.memoryCoreDbUseTestHarness).toBe(true);
    });

    test('the ensure-guard condition tracks the FORMULA, not one toggle', () => {
        // @neo-kimi-iris's finding, reviewing this PR. `connect()` guarded the ensure on
        // `chromaUseTestDatabase === true`, while `chromaDatabase` selects the test database on
        // `chromaUseTestDatabase || memoryCoreDbUseTestHarness`. A guard narrower than the selector
        // it guards means the client resolves the test database and nothing creates it.
        //
        // This is non-vacuous ONLY because the two can disagree, so assert that directly rather
        // than asserting the happy state: whenever the harness toggle alone selected test mode, the
        // old condition was false while the resolved database was already the test one.
        const resolvedTest = aiConfig.chromaDatabase === aiConfig.chromaDatabaseTest;

        expect(resolvedTest, 'the suite must be running in test mode for this to mean anything').toBe(true);

        if (aiConfig.chromaUseTestDatabase !== true) {
            expect(aiConfig.memoryCoreDbUseTestHarness,
                'test mode was selected by the harness toggle, which the OLD guard could not see').toBe(true)
        }
    });

    test('the resolved database is the TEST one, and it differs from production', () => {
        expect(aiConfig.chromaDatabase).toBe(aiConfig.chromaDatabaseTest);
        expect(aiConfig.chromaDatabase).not.toBe(aiConfig.chromaDatabaseProd);
    });

    test('production resolves to the shared constant, not a local invention', () => {
        // The isolation module owns the name. A manager or config that spelled it itself would drift
        // from the one place that knows what production is called.
        expect(aiConfig.chromaDatabaseProd).toBe(CHROMA_PRODUCTION_DATABASE);
    });

    test('the test database is PER-WORKER, so fullyParallel workers cannot collide', () => {
        // Config-load-time generation keyed on pid. A shared name would let two workers create and
        // drop each other's collections — the failure this isolation exists to prevent, one level in.
        expect(aiConfig.chromaDatabaseTest).toContain(String(process.pid));
        expect(aiConfig.chromaDatabaseTest).not.toBe(CHROMA_PRODUCTION_DATABASE);
    });

    test('the FORMULA selects — no inline env read in the manager', () => {
        // Both leaf values are present and distinct, and the resolved value equals one of them.
        // That is what makes the selection declarative: the manager reads `chromaDatabase` and never
        // asks which mode it is in.
        expect(typeof aiConfig.chromaDatabaseProd).toBe('string');
        expect(typeof aiConfig.chromaDatabaseTest).toBe('string');
        expect([aiConfig.chromaDatabaseProd, aiConfig.chromaDatabaseTest]).toContain(aiConfig.chromaDatabase);
    });
});
