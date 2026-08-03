import {test, expect} from '@playwright/test';
import {
    buildMigrationPlan,
    DISCOVER_SCHEMA_VERSION,
    formatPlan,
    validateDiscoverResult
} from '../../../../../../ai/scripts/maintenance/deploymentMigrationCore.mjs';
import {parseArgs} from '../../../../../../ai/scripts/maintenance/migrateDeployment.mjs';

const PROFILE    = 'ai/deploy/docker-compose.yml',
      TARGET_SHA = '8a5808007ac4647041d2b425ceba76426a707a50',
      OLD_SHA    = 'efe4490dd7fef0beb9df9ae21363b8e44e05ad3d';

/**
 * A discover result in the shape this consumer contracts for (the discover driver's JSON). Built as a factory
 * so each test perturbs one field and the resulting blocker is attributable to that perturbation.
 */
function createDiscover(overrides = {}) {
    return {
        schemaVersion   : DISCOVER_SCHEMA_VERSION,
        profile         : PROFILE,
        clean           : true,
        missingRequired : [],
        presentForbidden: [],
        missingSecrets  : [],
        unchecked       : [],
        ...overrides
    }
}

/**
 * A plan input whose every field is already valid.
 */
function createPlanInput(overrides = {}) {
    return {
        discover         : createDiscover(),
        composeIdentity  : {project: 'neo-local-agent-os', configFiles: ['/x/docker-compose.yml', '/x/docker-compose.local.yml']},
        deployedRevisions: {'mc-server': OLD_SHA, orchestrator: OLD_SHA, 'kb-server': OLD_SHA},
        targetRevision   : TARGET_SHA,
        expectedProfile  : PROFILE,
        ...overrides
    }
}

test.describe('validateDiscoverResult refuses on shape, never best-efforts', () => {
    test('accepts a well-formed result', () => {
        expect(validateDiscoverResult(createDiscover(), PROFILE)).toEqual([])
    });

    test('a non-object is rejected outright', () => {
        for (const input of [null, undefined, 'x', 42, []]) {
            expect(validateDiscoverResult(input, PROFILE).length, JSON.stringify(input)).toBeGreaterThan(0)
        }
    });

    test('a schemaVersion this consumer does not implement is refused rather than interpreted', () => {
        // Silent mis-parsing of a changed producer shape would authorize an apply against fields
        // that were never populated.
        const problems = validateDiscoverResult(createDiscover({schemaVersion: DISCOVER_SCHEMA_VERSION + 1}), PROFILE);

        expect(problems.some(problem => problem.includes('refusing to interpret an unknown shape'))).toBe(true)
    });

    test('a profile mismatch is refused — the census is per-profile', () => {
        const problems = validateDiscoverResult(createDiscover({profile: 'ai/deploy/docker-compose.dev.yml'}), PROFILE);

        expect(problems.some(problem => problem.includes('but this run targets'))).toBe(true)
    });

    test('an ABSENT finding list is refused, because absent and empty are the same shape once parsed', () => {
        // This is the "never report an empty delta" property: a missing list would otherwise read as
        // "you are fine" from a producer that never ran the check.
        for (const listName of ['missingRequired', 'presentForbidden', 'missingSecrets']) {
            const discover = createDiscover();
            delete discover[listName];

            const problems = validateDiscoverResult(discover, PROFILE);

            expect(problems.some(problem => problem.includes(listName)), listName).toBe(true)
        }
    });

    test('an empty finding list is accepted — that is the normal clean case', () => {
        expect(validateDiscoverResult(createDiscover({missingRequired: [], presentForbidden: [], missingSecrets: []}), PROFILE)).toEqual([])
    });

    test('a missing boolean verdict is refused', () => {
        const discover = createDiscover();
        delete discover.clean;

        expect(validateDiscoverResult(discover, PROFILE).some(problem => problem.includes("'clean'"))).toBe(true)
    });
});

test.describe('buildMigrationPlan gates apply on the consumed contract', () => {
    test('a satisfied deployment plus a clean discover result plans clean', () => {
        const plan = buildMigrationPlan(createPlanInput());

        expect(plan.clean).toBe(true);
        expect(plan.blockers).toEqual([]);
        expect(plan.revisionDelta).toMatchObject({from: OLD_SHA, to: TARGET_SHA, alreadyTarget: false})
    });

    test('an invalid discover result blocks before any finding is read', () => {
        const plan = buildMigrationPlan(createPlanInput({discover: {schemaVersion: 99}}));

        expect(plan.clean).toBe(false);
        expect(plan.blockers.some(blocker => blocker.kind === 'discover-result-invalid')).toBe(true)
    });

    test('an ABSENT discover result blocks — there is no fallback derivation', () => {
        // Deliberate: a second census resolver could disagree with the discover driver's, and the
        // disagreement would surface as a migration authorized against the wrong answer.
        const plan = buildMigrationPlan(createPlanInput({discover: null}));

        expect(plan.clean).toBe(false);
        expect(plan.blockers.some(blocker => blocker.kind === 'discover-result-invalid')).toBe(true)
    });

    test('a missing required input blocks and forwards the census reason verbatim', () => {
        const plan = buildMigrationPlan(createPlanInput({
            discover: createDiscover({clean: false, missingRequired: [{key: 'NEO_TRANSPORT', reason: 'declared required'}]})
        }));

        expect(plan.clean).toBe(false);
        expect(plan.discoverFindings.missingRequired).toEqual(['NEO_TRANSPORT']);
        expect(plan.blockers.find(blocker => blocker.key === 'NEO_TRANSPORT').reason).toBe('declared required')
    });

    test('a boot-blocking missing input gets its own kind and sorts first in the report', () => {
        // A refused launch is a different triage priority from a degraded one, and the discover
        // contract distinguishes them; flattening that would bury the one key that stops the plane
        // from starting at all.
        const plan = buildMigrationPlan(createPlanInput({
            discover: createDiscover({
                clean          : false,
                missingRequired: [
                    {key: 'NEO_TRANSPORT', reason: 'declared required'},
                    {key: 'NEO_AI_ORCHESTRATOR_AUTHORITY_PROFILE', reason: 'no default; launch is refused', bootBlocking: true}
                ]
            })
        }));

        expect(plan.blockers.some(blocker => blocker.kind === 'missing-required-input-boot-blocking')).toBe(true);

        const report         = formatPlan(plan),
              bootBlockingAt = report.indexOf('NEO_AI_ORCHESTRATOR_AUTHORITY_PROFILE'),
              ordinaryAt     = report.indexOf('NEO_TRANSPORT');

        expect(bootBlockingAt).toBeGreaterThan(-1);
        expect(bootBlockingAt).toBeLessThan(ordinaryAt)
    });

    test('a present forbidden key and a missing secret each block', () => {
        const plan = buildMigrationPlan(createPlanInput({
            discover: createDiscover({
                clean           : false,
                presentForbidden: [{key: 'NEO_MESSAGE_WAL_DIR', reason: 'derived from NEO_MEMORY_WAL_DIR'}],
                missingSecrets  : [{key: 'NEO_KB_ASK_API_KEY', reason: 'required secret'}]
            })
        }));

        expect(plan.blockers.find(blocker => blocker.kind === 'forbidden-env-present').reason).toBe('derived from NEO_MEMORY_WAL_DIR');
        expect(plan.blockers.some(blocker => blocker.kind === 'missing-secret')).toBe(true)
    });

    test('clean=false with zero findings blocks rather than resolving the contradiction', () => {
        // The producer knows something the gate does not; trusting the findings over the verdict
        // would silently discard it.
        const plan = buildMigrationPlan(createPlanInput({discover: createDiscover({clean: false})}));

        expect(plan.blockers.some(blocker => blocker.kind === 'discover-verdict-unexplained')).toBe(true)
    });

    test('a bare-string finding is tolerated without losing the key', () => {
        const plan = buildMigrationPlan(createPlanInput({
            discover: createDiscover({clean: false, missingRequired: ['NEO_TRANSPORT']})
        }));

        expect(plan.discoverFindings.missingRequired).toEqual(['NEO_TRANSPORT'])
    });
});

test.describe('buildMigrationPlan adds the plane-side facts discovery cannot supply', () => {
    test('an undiscoverable Compose identity blocks rather than falling back to a default', () => {
        // The pipeline default is project `neo-agent-os`; against a two-file plane that addresses a
        // DIFFERENT project with the overlay dropped.
        for (const identity of [null, {project: 'x', configFiles: []}, {configFiles: ['/a.yml']}]) {
            const plan = buildMigrationPlan(createPlanInput({composeIdentity: identity}));

            expect(plan.clean, JSON.stringify(identity)).toBe(false);
            expect(plan.blockers.some(blocker => blocker.kind === 'compose-identity-undiscoverable')).toBe(true)
        }
    });

    test('an unresolved target revision blocks', () => {
        const plan = buildMigrationPlan(createPlanInput({targetRevision: null}));

        expect(plan.blockers.some(blocker => blocker.kind === 'target-revision-unresolved')).toBe(true)
    });

    test('a cohort reporting two revisions blocks as a partially-applied prior run', () => {
        const plan = buildMigrationPlan(createPlanInput({
                  deployedRevisions: {'mc-server': OLD_SHA, orchestrator: TARGET_SHA, 'kb-server': OLD_SHA}
              })),
              blocker = plan.blockers.find(entry => entry.kind === 'cohort-revision-split');

        expect(plan.clean).toBe(false);
        expect(blocker.reason).toContain('2 different revisions')
    });

    test('no readable revision anywhere blocks — there is no baseline to assert against', () => {
        const plan = buildMigrationPlan(createPlanInput({
            deployedRevisions: {'mc-server': null, orchestrator: null, 'kb-server': null}
        }));

        expect(plan.blockers.some(blocker => blocker.kind === 'no-readable-revision')).toBe(true)
    });

    test('a plane already AT the target still refuses when the contract is unsatisfied', () => {
        // The pairing that matters, and the reason a revision-only trigger is insufficient:
        // revision-current and contract-invalid at once.
        const plan = buildMigrationPlan(createPlanInput({
            deployedRevisions: {'mc-server': TARGET_SHA, orchestrator: TARGET_SHA, 'kb-server': TARGET_SHA},
            discover         : createDiscover({clean: false, missingRequired: [{key: 'NEO_TRANSPORT', reason: 'declared required'}]})
        }));

        expect(plan.revisionDelta.alreadyTarget).toBe(true);
        expect(plan.clean).toBe(false)
    });
});

test.describe('unchecked items are never silently passed', () => {
    test('one unreadable service becomes UNCHECKED, not a pass and not a blocker', () => {
        const plan = buildMigrationPlan(createPlanInput({
            deployedRevisions: {'mc-server': OLD_SHA, orchestrator: OLD_SHA, 'kb-server': null}
        }));

        expect(plan.clean).toBe(true);
        expect(plan.unchecked.some(item => item.includes('kb-server'))).toBe(true)
    });

    test("the producer's own unchecked items are forwarded and attributed", () => {
        const plan = buildMigrationPlan(createPlanInput({
            discover: createDiscover({unchecked: ['secrets not readable on this host']})
        }));

        expect(plan.unchecked).toContain('discover: secrets not readable on this host')
    });

    test('entrypoint-supplied unchecked notes survive into the plan', () => {
        const plan = buildMigrationPlan(createPlanInput({uncheckedNotes: ['overlay drift: not evaluated']}));

        expect(plan.unchecked).toContain('overlay drift: not evaluated')
    });
});

test.describe('formatPlan', () => {
    test('a refused plan states REFUSED and includes every blocker key', () => {
        const plan   = buildMigrationPlan(createPlanInput({discover: null, composeIdentity: null})),
              report = formatPlan(plan);

        expect(report).toContain('verdict: REFUSED');
        expect(report).toContain('compose-identity-undiscoverable');
        expect(plan.blockers.every(({key}) => report.includes(key))).toBe(true)
    });

    test('a clean plan states CLEAN and says apply is authorized', () => {
        const report = formatPlan(buildMigrationPlan(createPlanInput()));

        expect(report).toContain('verdict: CLEAN');
        expect(report).toContain('apply is authorized')
    });

    test('unchecked items render as NOT VERIFIED rather than being omitted', () => {
        const report = formatPlan(buildMigrationPlan(createPlanInput({uncheckedNotes: ['overlay drift: not evaluated']})));

        expect(report).toContain('NOT VERIFIED');
        expect(report).toContain('overlay drift: not evaluated')
    });
});

test.describe('parseArgs', () => {
    test('importing the driver does not execute it', () => {
        // The entrypoint guard's real assertion: this spec reaching this line at all means importing
        // the driver did not run a migration as an import side effect.
        expect(typeof parseArgs).toBe('function')
    });

    test('defaults to the dev selector and the canonical cohort', () => {
        const options = parseArgs(['plan', '--discover-json', 'x.json']);

        expect(options).toMatchObject({mode: 'plan', target: 'dev', profile: PROFILE, discoverJson: 'x.json'});
        expect(options.services).toEqual(['mc-server', 'orchestrator', 'kb-server'])
    });

    test('refuses a missing or unknown mode', () => {
        expect(() => parseArgs([])).toThrow(/must be 'plan' or 'apply'/);
        expect(() => parseArgs(['deploy'])).toThrow(/must be 'plan' or 'apply'/)
    });

    test('refuses an unknown flag rather than ignoring it', () => {
        // A silently-ignored flag is how an operator believes they scoped a run that ran unscoped.
        expect(() => parseArgs(['plan', '--fource', 'x'])).toThrow(/unknown flag: --fource/)
    });

    test('refuses a flag with no value', () => {
        expect(() => parseArgs(['plan', '--target'])).toThrow(/requires a value/)
    });

    test('--services splits, trims and drops empties', () => {
        expect(parseArgs(['plan', '--services', ' a , b ,, c ']).services).toEqual(['a', 'b', 'c'])
    });
});
