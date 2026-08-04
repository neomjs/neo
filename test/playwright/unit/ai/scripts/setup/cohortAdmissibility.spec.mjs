import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../src/Neo.mjs';
import '../../../../../../src/core/_export.mjs';
import ConfigBase     from '../../../../../../ai/configBase.mjs';
import {
    classifyRequirement,
    collectLeafPaths,
    collectRequirednessCensus,
    diffCohortLeafSets,
    evaluateCohortAdmissibility,
    formatAdmissibilityVerdict,
    isLeafDescriptor,
    providesValue
} from '../../../../../../ai/scripts/setup/cohortAdmissibility.mjs';

/**
 * The predicate behind "may target T take cohort C?".
 *
 * The failure this exists to prevent is specific: four daemons fail CLOSED when a required input is
 * absent, so activating a newer cohort on a lagging deployment can produce a plane whose daemons
 * refuse to boot — and before this, nothing could say so in advance.
 *
 * Every case below is written so that a plausible weakening of the module turns it red. The one that
 * matters most is the unknown-axis case: the runtime's own matcher answers "not required" for an
 * unstated axis, and copying it here would silently certify exactly the targets we know least about.
 */

/** A leaf descriptor, shaped as `leaf()` produces one. */
function leafOf({env = null, type = 'string', requiredFor = null} = {}) {
    return {default: '', env, type, ...(requiredFor ? {requiredFor} : {})}
}

test.describe('cohortAdmissibility — may target T take cohort C? (#16453)', () => {
    /**
     * The census is WALKED, never listed. A hand-maintained list of "inputs the new version needs" is
     * exactly what staled in the written upgrade guide; if this test can pass against a hardcoded
     * array, the module has the same defect in a new place.
     */
    test('the census is derived from the cohort tree, not a hand-maintained list', () => {
        const live = collectRequirednessCensus(ConfigBase.config.data);

        // The live tree genuinely carries requirement-bearing leaves — otherwise every admissibility
        // assertion below would be vacuously true.
        expect(live.length).toBeGreaterThan(0);
        expect(live.map(entry => entry.leafPath)).toContain('orchestrator.authorityProfile');

        // A leaf that exists in NO real config is still discovered, so the census cannot be a fixed
        // list of known paths.
        const invented = collectRequirednessCensus({
            madeUp: {
                nested: leafOf({
                    env        : 'NEO_NOT_A_REAL_VAR',
                    requiredFor: [{entrypoints: ['x'], reason: 'invented'}]
                })
            }
        });

        expect(invented).toHaveLength(1);
        expect(invented[0].leafPath).toBe('madeUp.nested');
        expect(invented[0].env).toBe('NEO_NOT_A_REAL_VAR');
    });

    test('a leaf with no requiredFor is omitted — it cannot fail a readiness check', () => {
        const census = collectRequirednessCensus({
            plain   : leafOf({env: 'NEO_PLAIN'}),
            required: leafOf({env: 'NEO_REQ', requiredFor: [{entrypoints: ['e'], reason: 'r'}]})
        });

        expect(census.map(entry => entry.leafPath)).toEqual(['required']);
    });

    test('requiredFor is read from the metadata bag as well as the descriptor', () => {
        // Reading only one of the two placements silently under-reports, which reads as admissible.
        const census = collectRequirednessCensus({
            viaMetadata: {default: '', env: 'NEO_META', type: 'string', metadata: {requiredFor: [{entrypoints: ['e'], reason: 'r'}]}}
        });

        expect(census).toHaveLength(1);
        expect(census[0].requirements[0].reason).toBe('r');
    });

    /**
     * THE LOAD-BEARING CASE, and it deliberately INVERTS `ConfigProvider.matchesContext`.
     *
     * That matcher is `!list || list.includes(actual)`. With `actual === undefined` and a constraining
     * list it returns FALSE — the runtime treats the leaf as not-required and boots, which is correct
     * for a live process that knows its own entrypoint and mode.
     *
     * Here it would be catastrophic: a target whose mode we cannot state is a target whose
     * requirements we cannot evaluate, and answering "admissible" certifies the case we know least
     * about. Unknown must be inadmissible.
     */
    test('an unstated axis is INDETERMINATE and therefore NOT admissible', () => {
        const cohortData = {
            auth: {
                token: leafOf({
                    env        : 'NEO_TOKEN',
                    requiredFor: [{modes: ['seat-token'], reason: 'needs a token'}]
                })
            }
        };

        const verdict = evaluateCohortAdmissibility({
            cohortData,
            target: {entrypoint: 'memory-core', providedEnv: {}} // mode deliberately absent
        });

        expect(verdict.admissible).toBe(false);
        expect(verdict.blocking).toHaveLength(0);
        expect(verdict.indeterminate).toHaveLength(1);
        expect(verdict.indeterminate[0].unknownAxes).toEqual(['modes']);

        // And it must not be a bare boolean — the operator needs the axis named.
        expect(formatAdmissibilityVerdict(verdict).join('\n')).toContain('modes');
    });

    test('a requirement whose axis EXCLUDES the target does not block it', () => {
        const cohortData = {
            auth: {
                gitlab: leafOf({env: 'NEO_GITLAB', requiredFor: [{modes: ['gitlab-pat'], reason: 'pat'}]})
            }
        };

        const verdict = evaluateCohortAdmissibility({
            cohortData,
            target: {mode: 'none', providedEnv: {}}
        });

        // Stated mode, genuinely different -> excluded, not indeterminate. Conflating the two would
        // make every deployment inadmissible for every optional auth mode.
        expect(verdict.admissible).toBe(true);
        expect(verdict.indeterminate).toHaveLength(0);
    });

    /**
     * The AC that names the four fail-closed daemons: a cohort introducing a required leaf must be
     * inadmissible to a target lacking it, and the refusal must carry the reason.
     */
    test('a cohort requiring a leaf is INADMISSIBLE to a target lacking it, with leaf + env + reason', () => {
        const verdict = evaluateCohortAdmissibility({
            cohortData: ConfigBase.config.data,
            target    : {entrypoint: 'orchestrator-daemon', mode: 'none', consumerClaims: ['readiness'], providedEnv: {}}
        });

        expect(verdict.admissible).toBe(false);

        const blocked = verdict.blocking.find(row => row.leafPath === 'orchestrator.authorityProfile');

        expect(blocked).toBeTruthy();
        expect(blocked.env).toBe('NEO_AI_ORCHESTRATOR_AUTHORITY_PROFILE');
        // A bare boolean is unactionable — the reason is what an operator acts on.
        expect(blocked.reason).toContain('declared, never inherited');

        const rendered = formatAdmissibilityVerdict(verdict).join('\n');

        expect(rendered).toContain('NOT ADMISSIBLE');
        expect(rendered).toContain('NEO_AI_ORCHESTRATOR_AUTHORITY_PROFILE');
    });

    test('declaring the input makes the same target admissible', () => {
        const verdict = evaluateCohortAdmissibility({
            cohortData: ConfigBase.config.data,
            target    : {
                entrypoint    : 'orchestrator-daemon',
                mode          : 'none',
                consumerClaims: ['readiness'],
                providedEnv   : {NEO_AI_ORCHESTRATOR_AUTHORITY_PROFILE: 'container-plane'}
            }
        });

        expect(verdict.admissible).toBe(true);
        expect(formatAdmissibilityVerdict(verdict)[0]).toContain('ADMISSIBLE');
    });

    /**
     * An exported but empty value is ABSENT. `NEO_X=` in a compose file reads as "set" to anything
     * checking presence, and as empty to the readiness check that actually gates the boot — so a
     * presence-only predicate certifies a plane straight into the failure it exists to prevent.
     */
    test('an empty or whitespace value is absent, matching the runtime readiness check', () => {
        expect(providesValue({NEO_X: 'v'}, 'NEO_X')).toBe(true);
        expect(providesValue({NEO_X: ''}, 'NEO_X')).toBe(false);
        expect(providesValue({NEO_X: '   '}, 'NEO_X')).toBe(false);
        expect(providesValue({}, 'NEO_X')).toBe(false);
        expect(providesValue({NEO_X: 'v'}, null)).toBe(false);

        const cohortData = {a: {b: leafOf({env: 'NEO_X', requiredFor: [{modes: ['m'], reason: 'r'}]})}};
        const verdict    = evaluateCohortAdmissibility({cohortData, target: {mode: 'm', providedEnv: {NEO_X: '  '}}});

        expect(verdict.admissible).toBe(false);
        expect(verdict.blocking[0].env).toBe('NEO_X');
    });

    test('consumerClaims match as a SET — a multi-claim target is not silently excluded', () => {
        const requirement = {consumerClaims: ['readiness']};

        expect(classifyRequirement(requirement, {consumerClaims: ['liveness', 'readiness']}).verdict).toBe('applies');
        expect(classifyRequirement(requirement, {consumerClaims: ['liveness']}).verdict).toBe('excluded');
        expect(classifyRequirement(requirement, {}).verdict).toBe('indeterminate');
    });

    test('a wildcard axis constrains nothing, so an unstated actual is harmless there', () => {
        // `'*'`, null and undefined are all the wildcard, exactly as ConfigProvider.normalizeList
        // defines it. Treating `'*'` as a literal would make every `entrypoints: '*'` leaf
        // permanently indeterminate.
        expect(classifyRequirement({entrypoints: '*', modes: ['m']}, {mode: 'm'}).verdict).toBe('applies');
        expect(classifyRequirement({entrypoints: null}, {}).verdict).toBe('applies');
        expect(classifyRequirement({}, {}).verdict).toBe('applies');
    });

    /**
     * The other half of a migration. An operator carrying an input the new cohort no longer declares
     * has a setting that silently does nothing — and it is worse than useless, because it LOOKS
     * load-bearing in their compose file and the next person preserves it as intentional.
     */
    test('a retired key the target still sets is reported — advisory, never gating', () => {
        const fromData = {a: {kept: leafOf({env: 'NEO_KEPT'}), gone: leafOf({env: 'NEO_GONE'})}},
              toData   = {a: {kept: leafOf({env: 'NEO_KEPT'}), added: leafOf({env: 'NEO_ADDED'})}};

        const diff = diffCohortLeafSets({fromData, toData});

        expect(diff.retired.map(row => row.leafPath)).toEqual(['a.gone']);
        expect(diff.introduced.map(row => row.leafPath)).toEqual(['a.added']);

        const verdict = evaluateCohortAdmissibility({
            cohortData       : toData,
            currentCohortData: fromData,
            target           : {providedEnv: {NEO_GONE: 'still-set'}}
        });

        // Inert, not blocking — refusing a migration over a setting that cannot fail a readiness
        // check would block the move for no safety gain.
        expect(verdict.admissible).toBe(true);
        expect(verdict.retired.map(row => row.env)).toEqual(['NEO_GONE']);

        // …and it is still SAID, on an admissible verdict, or the operator migrates carrying it.
        expect(formatAdmissibilityVerdict(verdict).join('\n')).toContain('NEO_GONE');
    });

    test('a retired key the target does NOT set is not reported — it is noise, not a finding', () => {
        const fromData = {a: {gone: leafOf({env: 'NEO_GONE'})}},
              toData   = {a: {kept: leafOf({env: 'NEO_KEPT'})}};

        const verdict = evaluateCohortAdmissibility({
            cohortData       : toData,
            currentCohortData: fromData,
            target           : {providedEnv: {}}
        });

        expect(verdict.retired).toEqual([]);
    });

    test('without a current cohort, retirement is not guessed', () => {
        // Absence of a comparison point is not evidence that nothing retired.
        const verdict = evaluateCohortAdmissibility({
            cohortData: {a: {x: leafOf({env: 'NEO_X'})}},
            target    : {providedEnv: {NEO_ANYTHING: '1'}}
        });

        expect(verdict.retired).toEqual([]);
    });

    test('isLeafDescriptor separates leaves from namespace nodes', () => {
        expect(isLeafDescriptor({default: '', env: 'X'})).toBe(true);
        expect(isLeafDescriptor({default: 1, type: 'number'})).toBe(true);
        expect(isLeafDescriptor({nested: {default: ''}})).toBe(false);
        expect(isLeafDescriptor(null)).toBe(false);
        expect(isLeafDescriptor([1, 2])).toBe(false);
    });
});
