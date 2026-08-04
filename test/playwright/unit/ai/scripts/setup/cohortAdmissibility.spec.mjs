import {test, expect} from '@playwright/test';
import {readFileSync} from 'fs';
import Neo            from '../../../../../../src/Neo.mjs';
import '../../../../../../src/core/_export.mjs';
import ConfigBase      from '../../../../../../ai/configBase.mjs';
import {
    assessCohortSource,
    classifyRequirement,
    collectForbiddenKeysInUse,
    collectLeafPaths,
    collectRequirednessCensus,
    diffCohortLeafSets,
    evaluateCohortAdmissibility,
    formatAdmissibilityVerdict,
    isLeafDescriptor,
    providesValue
} from '../../../../../../ai/scripts/setup/cohortAdmissibility.mjs';

const
    PARITY_PATH   = new URL('../../../../../../ai/scripts/lint/config-leaf-parity.json', import.meta.url),
    LIVE_PARITY   = JSON.parse(readFileSync(PARITY_PATH, 'utf8')),
    FORBIDDEN_ENV = LIVE_PARITY.$composeDefaultParity.forbiddenEnv;

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

    /**
     * The parity map supplies what a diff structurally cannot: the REASON. A derived retirement can
     * only say "no longer declared", which names the symptom; `forbiddenEnv` names what replaced it.
     */
    test('a forbidden key the target sets is reported WITH its recorded reason', () => {
        const rows = collectForbiddenKeysInUse({
            providedEnv : {NEO_KEPT: 'x', NEO_RETIRED_THING: '1'},
            forbiddenEnv: {NEO_RETIRED_THING: 'the orchestrator owns this now'}
        });

        expect(rows).toEqual([{env: 'NEO_RETIRED_THING', reason: 'the orchestrator owns this now'}]);
    });

    test('a forbidden key the target does not set is not reported, and no map means no claim', () => {
        expect(collectForbiddenKeysInUse({providedEnv: {}, forbiddenEnv: {NEO_X: 'r'}})).toEqual([]);
        // An empty value is absent here too, or `NEO_X=` would read as a finding the operator cannot act on.
        expect(collectForbiddenKeysInUse({providedEnv: {NEO_X: '  '}, forbiddenEnv: {NEO_X: 'r'}})).toEqual([]);
        expect(collectForbiddenKeysInUse({providedEnv: {NEO_X: '1'}})).toEqual([]);
    });

    /**
     * A key can be BOTH diff-retired and parity-forbidden. Two rows for one key reads as two separate
     * problems and costs the operator a reconciliation that yields nothing — and the merged row must
     * keep the parity reason rather than the generic diff wording, since the reason is the payload.
     */
    test('a key that is both diff-retired and parity-forbidden is reported ONCE, keeping the reason', () => {
        const fromData = {a: {gone: leafOf({env: 'NEO_GONE'})}},
              toData   = {a: {kept: leafOf({env: 'NEO_KEPT'})}};

        const verdict = evaluateCohortAdmissibility({
            cohortData       : toData,
            currentCohortData: fromData,
            forbiddenEnv     : {NEO_GONE: 'the orchestrator owns Dream'},
            target           : {providedEnv: {NEO_GONE: '1'}}
        });

        expect(verdict.retired).toHaveLength(1);
        expect(verdict.retired[0].reason).toBe('the orchestrator owns Dream');
        expect(verdict.forbidden).toEqual([]);

        const rendered = formatAdmissibilityVerdict(verdict).join('\n');

        expect(rendered.match(/NEO_GONE/g)).toHaveLength(1);
        expect(rendered).toContain('the orchestrator owns Dream');
    });

    /**
     * Against the REAL map, because the hand-built fixtures above would pass just as well if the
     * shipped file had a different shape. This is the path a plane hundreds of commits behind takes:
     * it cannot say which cohort it is on, so the diff is unavailable and this is the only surface
     * that can still tell it something actionable.
     */
    test('the live parity map names a real retired key, with no currentCohortData available', () => {
        expect(Object.keys(FORBIDDEN_ENV).length).toBeGreaterThan(0);

        const verdict = evaluateCohortAdmissibility({
            cohortData  : ConfigBase.config.data,
            forbiddenEnv: FORBIDDEN_ENV,
            target      : {
                entrypoint    : 'orchestrator-daemon',
                mode          : 'none',
                consumerClaims: ['readiness'],
                providedEnv   : {
                    NEO_AI_ORCHESTRATOR_AUTHORITY_PROFILE: 'container-plane',
                    NEO_AUTO_DREAM                       : 'true'
                }
            }
        });

        // Advisory: a forbidden key is inert, so it must not flip an otherwise-clean verdict.
        expect(verdict.admissible).toBe(true);
        expect(verdict.retired).toEqual([]);

        const row = verdict.forbidden.find(entry => entry.env === 'NEO_AUTO_DREAM');

        expect(row).toBeTruthy();
        // The reason is read from the shipped file, never restated here — restating it would let the
        // two drift apart and this test would keep passing against the stale copy.
        expect(row.reason).toBe(FORBIDDEN_ENV.NEO_AUTO_DREAM);
        expect(row.reason).toContain('orchestrator owns Dream');

        expect(formatAdmissibilityVerdict(verdict).join('\n')).toContain('FORBIDDEN NEO_AUTO_DREAM');
    });

    /**
     * THE CALLER CONTRACT, and the only failure direction this module cannot tolerate: a FALSE
     * INADMISSIBLE refuses a migration that would have succeeded — on exactly the lagging plane the
     * predicate exists to unblock.
     *
     * The reference profile writes `NEO_AI_ORCHESTRATOR_AUTHORITY_PROFILE` as a LITERAL rather than
     * interpolating it, so a caller passing the deployment's hand-authored `.env` sees it absent while
     * the daemon would have booted. The census is only as true as the environment it is handed.
     *
     * Premise anchored against the shipped Compose file below: if someone later templates that value,
     * this test fails and the caller-contract note in the module header needs revisiting. That is the
     * correct thing to be told, not a brittle assertion.
     */
    test('providedEnv must be the RENDERED env — the declared-only case is a false inadmissible', () => {
        const composeSrc = readFileSync(new URL('../../../../../../ai/deploy/docker-compose.yml', import.meta.url), 'utf8');

        // The premise: pinned literally, NOT as `${NEO_AI_ORCHESTRATOR_AUTHORITY_PROFILE...}`.
        expect(composeSrc).toContain('NEO_AI_ORCHESTRATOR_AUTHORITY_PROFILE=container-plane');
        expect(composeSrc).not.toContain('NEO_AI_ORCHESTRATOR_AUTHORITY_PROFILE=${');

        const target = {entrypoint: 'orchestrator-daemon', mode: 'none', consumerClaims: ['readiness']};

        // Declared-only: the operator's .env carries nothing for a key their profile hardcodes.
        const fromDeclared = evaluateCohortAdmissibility({
            cohortData: ConfigBase.config.data,
            target    : {...target, providedEnv: {}}
        });

        // Rendered: `docker compose config` resolves the literal the service pins.
        const fromRendered = evaluateCohortAdmissibility({
            cohortData: ConfigBase.config.data,
            target    : {...target, providedEnv: {NEO_AI_ORCHESTRATOR_AUTHORITY_PROFILE: 'container-plane'}}
        });

        expect(fromDeclared.admissible).toBe(false);
        expect(fromRendered.admissible).toBe(true);

        // Same cohort, same target, opposite verdicts — the difference is ONLY which environment the
        // caller resolved, which is why the module header makes it a contract rather than a hint.
        expect(fromDeclared.blocking[0].env).toBe('NEO_AI_ORCHESTRATOR_AUTHORITY_PROFILE');
    });

    /**
     * THE EVIDENCE-SOURCE GUARD. Every other branch of this module refuses when it cannot decide; this
     * one would have GRANTED permission when it knew least — the strongest verdict from the weakest
     * evidence, on a predicate whose whole purpose is keeping a plane out of a fail-closed boot.
     *
     * A loader returning nothing, a failed import, or a path aimed at the wrong tree all arrive here as
     * an empty census, and an empty census read as "nothing blocked" is a pass. Caught in review by
     * @neo-gpt-emmy against the shipped head, not by this suite — the suite had no source-absence case
     * at all, so it could not have failed on it.
     *
     * The positive control is carried INSIDE this test on purpose: without it, every assertion below
     * would still pass if the predicate simply refused everything.
     */
    test('an unobserved cohort FAILS CLOSED — "nothing blocked" and "nothing was read" are different states', () => {
        // Positive control first: the predicate must still be capable of a real, specific refusal,
        // otherwise "refuses on bad input" proves nothing.
        const control = evaluateCohortAdmissibility({
            cohortData: ConfigBase.config.data,
            target    : {entrypoint: 'orchestrator-daemon', mode: 'none', consumerClaims: ['readiness'], providedEnv: {}}
        });

        expect(control.admissible).toBe(false);
        expect(control.blocking).toHaveLength(1);
        expect(control.evaluated).toBeGreaterThan(0);
        expect(control.sourceError).toBeNull();

        // …and a fully-supplied target on the same real tree is admissible, so the module is not
        // simply refusing everything handed to it.
        expect(evaluateCohortAdmissibility({
            cohortData: ConfigBase.config.data,
            target    : {
                entrypoint    : 'orchestrator-daemon',
                mode          : 'none',
                consumerClaims: ['readiness'],
                providedEnv   : {NEO_AI_ORCHESTRATOR_AUTHORITY_PROFILE: 'container-plane'}
            }
        }).admissible).toBe(true);

        // Now the failed observations. Each is a DIFFERENT way the evidence never arrived.
        const unobserved = {
            'omitted'        : undefined,
            'null'           : null,
            'a scalar'       : 'oops',
            'a number'       : 7,
            'an array'       : [],
            'an empty object': {},
            'namespaces only': {a: {b: {}}, c: {}}
        };

        for (const [label, cohortData] of Object.entries(unobserved)) {
            const verdict = evaluateCohortAdmissibility({
                cohortData,
                target: {entrypoint: 'orchestrator-daemon', mode: 'none', providedEnv: {}}
            });

            expect(verdict.admissible, `${label} must never certify admissible`).toBe(false);
            expect(verdict.sourceError, `${label} must name a source problem`).toBeTruthy();
            expect(verdict.evaluated).toBe(0);

            // Rendered as its own verdict, not as "0 blocking" — which an operator would read as a
            // tool bug and re-run, instead of fixing the upstream read.
            const rendered = formatAdmissibilityVerdict(verdict).join('\n');

            expect(rendered).toContain('could not be observed');
            expect(rendered).not.toContain('0 blocking');
        }
    });

    /**
     * The distinction the guard turns on, and the reason it counts DESCRIPTORS rather than
     * REQUIREMENTS: a cohort can be completely observed and legitimately demand nothing. Counting
     * requirements would collapse that into the failure case and refuse every migration to a cohort
     * that happens to constrain nothing — a false inadmissible manufactured by the fix itself.
     */
    test('a cohort with descriptors but ZERO requiredFor is legitimately admissible, not a failed read', () => {
        const observedButUndemanding = {group: {a: leafOf({env: 'NEO_A'}), b: leafOf({env: 'NEO_B'})}};

        const source = assessCohortSource(observedButUndemanding);

        expect(source.observed).toBe(true);
        expect(source.leafCount).toBe(2);

        const verdict = evaluateCohortAdmissibility({
            cohortData: observedButUndemanding,
            target    : {entrypoint: 'anything', mode: 'none', providedEnv: {}}
        });

        expect(verdict.admissible).toBe(true);
        expect(verdict.sourceError).toBeNull();
        expect(verdict.evaluated).toBe(0);

        // The same ZERO evaluated count as a failed read — which is exactly why `evaluated` cannot be
        // the discriminator, and why the guard exists upstream of the census rather than inside it.
        expect(evaluateCohortAdmissibility({cohortData: {}, target: {}}).evaluated).toBe(0);
        expect(evaluateCohortAdmissibility({cohortData: {}, target: {}}).admissible).toBe(false);
    });

    test('assessCohortSource names WHICH way the read failed, not merely that it did', () => {
        expect(assessCohortSource(undefined).reason).toContain('No cohort data was supplied');
        expect(assessCohortSource([]).reason).toContain('an array');
        expect(assessCohortSource('x').reason).toContain('a string');
        expect(assessCohortSource({}).reason).toContain('no leaf descriptors');
        expect(assessCohortSource({a: leafOf({env: 'NEO_A'})}).reason).toBeNull();
    });

    test('isLeafDescriptor separates leaves from namespace nodes', () => {
        expect(isLeafDescriptor({default: '', env: 'X'})).toBe(true);
        expect(isLeafDescriptor({default: 1, type: 'number'})).toBe(true);
        expect(isLeafDescriptor({nested: {default: ''}})).toBe(false);
        expect(isLeafDescriptor(null)).toBe(false);
        expect(isLeafDescriptor([1, 2])).toBe(false);
    });
});
