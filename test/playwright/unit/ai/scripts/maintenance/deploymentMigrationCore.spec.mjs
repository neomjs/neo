import {test, expect}  from '@playwright/test';
import fs              from 'fs-extra';
import path            from 'path';
import {fileURLToPath} from 'url';
import {
    buildMigrationPlan,
    deriveContractDelta,
    formatPlan,
    parseObservedEnv,
    resolveCensus
} from '../../../../../../ai/scripts/maintenance/deploymentMigrationCore.mjs';
import {parseArgs} from '../../../../../../ai/scripts/maintenance/migrateDeployment.mjs';

const repoRoot   = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../../..'),
      PARITY_REL = 'ai/scripts/lint/config-leaf-parity.json',
      PROFILE    = 'ai/deploy/docker-compose.yml',
      TARGET_SHA = '8a5808007ac4647041d2b425ceba76426a707a50',
      OLD_SHA    = 'efe4490dd7fef0beb9df9ae21363b8e44e05ad3d',
      AUTHORITY  = 'NEO_AI_ORCHESTRATOR_AUTHORITY_PROFILE';

/**
 * A census fixture DELIBERATELY unlike the live one, so these tests assert classification MECHANICS
 * rather than today's key list. The separate live-document test proves only that the real census still
 * resolves — the coupling, not the contents.
 */
function createCensus(overrides = {}) {
    return {
        profile                 : PROFILE,
        requiredDeploymentInputs: ['NEO_REQ_ONE', 'NEO_REQ_TWO'],
        optionalOverrides       : ['NEO_OPT'],
        secrets                 : [],
        forbiddenEnv            : {NEO_BANNED: 'retired; the orchestrator owns it'},
        ...overrides
    }
}

const COHORT = ['mc-server', 'orchestrator', 'kb-server'];

/**
 * Every service observing the same satisfied env. Per service, never unioned: a union reports a key set
 * on one container as satisfied for all of them, which is the misconfiguration the gate exists to catch.
 */
function createObserved(entries = ['NEO_REQ_ONE=a', 'NEO_REQ_TWO=b', 'PATH=/usr/bin'], services = COHORT) {
    return Object.fromEntries(services.map(service => [service, parseObservedEnv(entries)]))
}

/**
 * Declared scopes covering the whole fixture census, so a test that does not care about attribution does
 * not accidentally trip the unattributable refusal.
 */
function createScopes(keys = ['NEO_REQ_ONE', 'NEO_REQ_TWO', 'NEO_OPT', 'NEO_BANNED', 'NEO_SECRET', AUTHORITY], services = COHORT) {
    return Object.fromEntries(services.map(service => [service, new Set(keys)]))
}

/**
 * A plan input whose every field is valid, so each test perturbs one thing and the resulting blocker is
 * attributable to that perturbation.
 */
function createPlanInput(overrides = {}) {
    return {
        observedEnvByService: createObserved(),
        serviceScopes       : createScopes(),
        census              : createCensus(),
        composeIdentity     : {project: 'neo-local-agent-os', configFiles: ['/x/base.yml', '/x/overlay.yml']},
        deployedRevisions   : {'mc-server': OLD_SHA, orchestrator: OLD_SHA, 'kb-server': OLD_SHA},
        targetRevision      : TARGET_SHA,
        ...overrides
    }
}

test.describe('parseObservedEnv', () => {
    test('keeps only the guarded NEO_/MCP_ namespace', () => {
        expect([...parseObservedEnv(['NEO_A=1', 'MCP_B=2', 'PATH=/usr/bin', 'NODE_VERSION=24']).keys()]).toEqual(['NEO_A', 'MCP_B'])
    });

    test('splits on the FIRST = so a value containing = survives intact', () => {
        // Truncating a value makes a correctly-set key look malformed, on exactly the DSN/base64 values
        // most likely to contain '='.
        const observed = parseObservedEnv(['NEO_URL=https://x/y?a=1&b=2', 'NEO_B64=aGk=']);

        expect(observed.get('NEO_URL')).toBe('https://x/y?a=1&b=2');
        expect(observed.get('NEO_B64')).toBe('aGk=')
    });

    test('records a set-but-empty key as PRESENT, not absent', () => {
        // set-but-empty and unset are different defects; collapsing them hides the first.
        const observed = parseObservedEnv(['NEO_EMPTY=', 'NEO_BARE']);

        expect(observed.has('NEO_EMPTY')).toBe(true);
        expect(observed.get('NEO_EMPTY')).toBe('');
        expect(observed.has('NEO_BARE')).toBe(true)
    });

    test('a non-array input yields an empty map rather than throwing', () => {
        expect(parseObservedEnv(undefined).size).toBe(0);
        expect(parseObservedEnv(null).size).toBe(0)
    });
});

test.describe('resolveCensus fails closed', () => {
    test('throws when the parity block is absent', () => {
        expect(() => resolveCensus({}, PROFILE)).toThrow(/no \$composeDefaultParity block/)
    });

    test('throws on an undeclared profile rather than defaulting to the canonical contract', () => {
        // Defaulting is the dangerous branch: the plan would read as authoritative while comparing the
        // deployment to a contract that is not its own.
        const parity = {$composeDefaultParity: {profiles: {[PROFILE]: {}}, census: {}, forbiddenEnv: {}}};

        expect(() => resolveCensus(parity, 'ai/deploy/invented.yml')).toThrow(/refusing to plan against a defaulted contract/)
    });

    test('throws when the census block describes a different profile than requested', () => {
        const parity = {
            $composeDefaultParity: {
                profiles    : {[PROFILE]: {}, 'ai/deploy/docker-compose.dev.yml': {}},
                census      : {profile: PROFILE, requiredDeploymentInputs: []},
                forbiddenEnv: {}
            }
        };

        expect(() => resolveCensus(parity, 'ai/deploy/docker-compose.dev.yml')).toThrow(/per-profile and cannot be reused/)
    });

    test('the LIVE parity document still resolves, and still declares the boot-blocking key', async () => {
        // Guards the coupling rather than the contents: if the real document's shape moves, this tool
        // breaks, and that must fail here rather than during a migration.
        const census = resolveCensus(await fs.readJson(path.join(repoRoot, PARITY_REL)), PROFILE);

        expect(census.requiredDeploymentInputs.length).toBeGreaterThan(0);
        expect(census.requiredDeploymentInputs).toContain(AUTHORITY);
        expect(Object.keys(census.forbiddenEnv).length).toBeGreaterThan(0)
    });
});

test.describe('deriveContractDelta — the single resolver', () => {
    test('a satisfied deployment yields an empty delta', () => {
        const delta = deriveContractDelta(parseObservedEnv(['NEO_REQ_ONE=a', 'NEO_REQ_TWO=b']), createCensus());

        expect(delta.missingRequired).toEqual([]);
        expect(delta.presentForbidden).toEqual([]);
        expect(delta.missingSecrets).toEqual([])
    });

    test('a missing required key is reported', () => {
        expect(deriveContractDelta(parseObservedEnv(['NEO_REQ_ONE=a']), createCensus())
            .missingRequired.map(({key}) => key)).toEqual(['NEO_REQ_TWO'])
    });

    test("a forbidden key's reason is the census's own text, VERBATIM", () => {
        // The census already declares each forbidden key's replacement guidance. Re-authoring it here
        // would create a second copy free to drift from the authority it paraphrases.
        const delta = deriveContractDelta(parseObservedEnv(['NEO_REQ_ONE=a', 'NEO_REQ_TWO=b', 'NEO_BANNED=1']), createCensus());

        expect(delta.presentForbidden).toEqual([{key: 'NEO_BANNED', reason: 'retired; the orchestrator owns it'}])
    });

    test('the authority key is flagged bootBlocking and ordinary required keys are not', () => {
        const delta = deriveContractDelta(new Map(), createCensus({requiredDeploymentInputs: [AUTHORITY, 'NEO_REQ_ONE']})),
              byKey = Object.fromEntries(delta.missingRequired.map(entry => [entry.key, entry.bootBlocking]));

        expect(byKey[AUTHORITY]).toBe(true);
        expect(byKey.NEO_REQ_ONE).toBe(false)
    });

    test('a set-but-empty required key is its OWN finding — present, unusable, and a different repair', () => {
        // Reversed from the original position ("the contract is declaration, not validity") on review:
        // a required input set to an empty value satisfies every presence check and still configures
        // nothing, so collapsing it into either bucket loses the operator's actual fix. It stays out of
        // `missingRequired` — it is not absent — and lands in `setButEmpty`.
        const delta = deriveContractDelta(parseObservedEnv(['NEO_REQ_ONE=', 'NEO_REQ_TWO=b']), createCensus());

        expect(delta.missingRequired).toEqual([]);
        expect(delta.setButEmpty.map(entry => entry.key)).toEqual(['NEO_REQ_ONE'])
    });

    test('whitespace is not a value — a key set to spaces is unusable, not satisfied', () => {
        expect(deriveContractDelta(parseObservedEnv(['NEO_REQ_ONE=   ', 'NEO_REQ_TWO=b']), createCensus())
            .setButEmpty.map(entry => entry.key)).toEqual(['NEO_REQ_ONE'])
    });

    test('a declared scope narrows which required keys this service is held to', () => {
        // The census classifies per PROFILE; the profile's required list is not uniform across its
        // services. Judging every key against every service invents obligations it never declared.
        const delta = deriveContractDelta(new Map([['NEO_REQ_ONE', 'a']]), createCensus(), new Set(['NEO_REQ_ONE']));

        expect(delta.missingRequired).toEqual([]);
        expect(delta.setButEmpty).toEqual([])
    });

    test('optional overrides that are set are reported separately from blockers', () => {
        const delta = deriveContractDelta(parseObservedEnv(['NEO_REQ_ONE=a', 'NEO_REQ_TWO=b', 'NEO_OPT=1']), createCensus());

        expect(delta.optionalPresent).toEqual(['NEO_OPT']);
        expect(delta.missingRequired).toEqual([])
    });
});

test.describe('buildMigrationPlan gates apply', () => {
    test('a satisfied deployment plans clean', () => {
        const plan = buildMigrationPlan(createPlanInput());

        expect(plan.clean).toBe(true);
        expect(plan.blockers).toEqual([]);
        expect(plan.revisionDelta).toMatchObject({from: OLD_SHA, to: TARGET_SHA, alreadyTarget: false})
    });

    test('an EMPTY observation blocks rather than deriving a spectacular false delta', () => {
        // The failure this prevents: with nothing read, every required key derives as "missing" and the
        // plan reports a huge contract delta whose real cause is that the target was never inspected.
        for (const observed of [{}, null, undefined]) {
            const plan = buildMigrationPlan(createPlanInput({observedEnvByService: observed}));

            expect(plan.clean, String(observed)).toBe(false);
            expect(plan.blockers.some(blocker => blocker.kind === 'no-observed-service')).toBe(true)
        }
    });

    test('a service observed as empty blocks per service — silence from an unreachable container is not absence', () => {
        // The failure this encodes: `docker exec` against a stopped container emits nothing and exits
        // non-zero, so an empty observation means "not measured", never "no config set".
        const plan = buildMigrationPlan(createPlanInput({
            observedEnvByService: {...createObserved(), orchestrator: new Map()}
        }));

        expect(plan.clean).toBe(false);

        const blocker = plan.blockers.find(entry => entry.kind === 'no-observed-env');

        expect(blocker.key).toBe('orchestrator');
        expect(blocker.reason).toContain('not be running')
    });

    test('observations are NOT unioned: a key set on one service does not satisfy another', () => {
        // Measured on the canonical profile, four of thirteen required inputs are declared by a single
        // service. A union reports the key as satisfied cohort-wide and the real gap disappears.
        const plan = buildMigrationPlan(createPlanInput({
            observedEnvByService: {
                ...createObserved(),
                orchestrator: parseObservedEnv(['NEO_REQ_ONE=a'])
            }
        }));

        expect(plan.clean).toBe(false);

        const missing = plan.blockers.filter(entry => entry.kind === 'missing-required-input');

        expect(missing.map(entry => entry.key)).toEqual(['orchestrator.NEO_REQ_TWO'])
    });

    test('a required key no observed service declares blocks as unattributable, never assigned to a default', () => {
        // `NEO_DEPLOY_HOSTNAME` is the live instance: declared required by the profile census and declared
        // by none of the three service templates. Picking an owner for it would be a guess reading as a
        // verdict.
        const plan = buildMigrationPlan(createPlanInput({
            census       : createCensus({requiredDeploymentInputs: ['NEO_REQ_ONE', 'NEO_REQ_TWO', 'NEO_ORPHAN']}),
            serviceScopes: createScopes(['NEO_REQ_ONE', 'NEO_REQ_TWO'])
        }));

        expect(plan.clean).toBe(false);

        const blocker = plan.blockers.find(entry => entry.kind === 'required-input-unattributable');

        expect(blocker.key).toBe('NEO_ORPHAN');
        expect(plan.blockers.some(entry => entry.key.endsWith('.NEO_ORPHAN'))).toBe(false)
    });

    test('a service whose declared scope is unresolved blocks rather than being judged or skipped', () => {
        const {orchestrator, ...partialScopes} = createScopes(),
              plan                             = buildMigrationPlan(createPlanInput({serviceScopes: partialScopes}));

        expect(plan.clean).toBe(false);
        expect(plan.blockers.find(entry => entry.kind === 'service-scope-unresolved').key).toBe('orchestrator')
    });

    test('a supplied desired value turns a missing required input into a declared transition, not a blocker', () => {
        // The point of the whole carrier: without it a plane missing a required input is refused from its
        // own observation and the operator must repair it by another path — the manual intervention this
        // tool exists to remove.
        const plan = buildMigrationPlan(createPlanInput({
            observedEnvByService: {...createObserved(), orchestrator: parseObservedEnv(['NEO_REQ_ONE=a'])},
            desiredEnv          : {orchestrator: {NEO_REQ_TWO: 'supplied'}}
        }));

        expect(plan.clean).toBe(true);
        expect(plan.blockers).toEqual([]);
        expect(plan.configTransition.orchestrator).toEqual([{key: 'NEO_REQ_TWO', from: '<unset>', declared: true}])
    });

    test('a desired value that is itself empty blocks — the repair must be usable, not merely present', () => {
        const plan = buildMigrationPlan(createPlanInput({
            observedEnvByService: {...createObserved(), orchestrator: parseObservedEnv(['NEO_REQ_ONE=a'])},
            desiredEnv          : {orchestrator: {NEO_REQ_TWO: '   '}}
        }));

        expect(plan.clean).toBe(false);
        expect(plan.blockers.find(entry => entry.kind === 'desired-value-unusable').key).toBe('orchestrator.NEO_REQ_TWO')
    });

    test('a set-but-empty required input reports its own blocker kind, distinct from missing', () => {
        const plan = buildMigrationPlan(createPlanInput({
            observedEnvByService: {...createObserved(), orchestrator: parseObservedEnv(['NEO_REQ_ONE=a', 'NEO_REQ_TWO='])}
        }));

        expect(plan.blockers.find(entry => entry.kind === 'required-input-set-but-empty').key)
            .toBe('orchestrator.NEO_REQ_TWO')
    });

    test('a missing required input blocks; the boot-blocking one gets its own kind and sorts FIRST', () => {
        // A refused launch is a different triage priority from a degraded one, and it is the key an
        // operator reading a long list must see first.
        const plan = buildMigrationPlan(createPlanInput({
            observedEnvByService: createObserved(['NEO_OTHER=1']),
            census              : createCensus({requiredDeploymentInputs: ['NEO_REQ_ONE', AUTHORITY]})
        }));

        expect(plan.clean).toBe(false);
        expect(plan.blockers.some(blocker => blocker.kind === 'missing-required-input-boot-blocking')).toBe(true);

        const report = formatPlan(plan);

        expect(report.indexOf(AUTHORITY)).toBeLessThan(report.indexOf('NEO_REQ_ONE'))
    });

    test('a present forbidden key and a missing secret each block', () => {
        const plan = buildMigrationPlan(createPlanInput({
            observedEnvByService: createObserved(['NEO_REQ_ONE=a', 'NEO_REQ_TWO=b', 'NEO_BANNED=1']),
            census              : createCensus({secrets: ['NEO_SECRET']})
        }));

        expect(plan.blockers.find(blocker => blocker.kind === 'forbidden-env-present').reason).toBe('retired; the orchestrator owns it');
        expect(plan.blockers.some(blocker => blocker.kind === 'missing-secret')).toBe(true)
    });

    test('satisfied secrets are NOT VERIFIED, because key presence is weaker than a valid value', () => {
        const plan = buildMigrationPlan(createPlanInput({
            observedEnvByService: createObserved(['NEO_REQ_ONE=a', 'NEO_REQ_TWO=b', 'NEO_SECRET=x']),
            census              : createCensus({secrets: ['NEO_SECRET']})
        }));

        expect(plan.clean).toBe(true);
        expect(plan.unchecked.some(item => item.includes('by env key only'))).toBe(true)
    });
});

test.describe('buildMigrationPlan adds the plane-side facts the census cannot supply', () => {
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
        expect(buildMigrationPlan(createPlanInput({targetRevision: null}))
            .blockers.some(blocker => blocker.kind === 'target-revision-unresolved')).toBe(true)
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
        expect(buildMigrationPlan(createPlanInput({
            deployedRevisions: {'mc-server': null, orchestrator: null, 'kb-server': null}
        })).blockers.some(blocker => blocker.kind === 'no-readable-revision')).toBe(true)
    });

    test('a plane already AT the target still refuses when the contract is unsatisfied', () => {
        // The pairing that matters, and why a revision-only trigger is insufficient: revision-current
        // and contract-invalid at the same time.
        const plan = buildMigrationPlan(createPlanInput({
            deployedRevisions   : {'mc-server': TARGET_SHA, orchestrator: TARGET_SHA, 'kb-server': TARGET_SHA},
            observedEnvByService: createObserved(['NEO_REQ_ONE=a'])
        }));

        expect(plan.revisionDelta.alreadyTarget).toBe(true);
        expect(plan.clean).toBe(false)
    });

    test('one unreadable revision BLOCKS — an unestablished before-state cannot coexist with CLEAN', () => {
        // Reversed from the original position on review. Reporting it and passing over it meant a plan
        // could authorise apply while one service had no baseline, so a successful-looking apply was
        // indistinguishable from one that stranded that service.
        const plan = buildMigrationPlan(createPlanInput({
            deployedRevisions: {'mc-server': OLD_SHA, orchestrator: OLD_SHA, 'kb-server': null}
        }));

        expect(plan.clean).toBe(false);

        const blocker = plan.blockers.find(entry => entry.kind === 'revision-unreadable');

        expect(blocker.key).toBe('kb-server:/app/.neo-revision');
        expect(blocker.reason).toContain('stranded')
    });

    test('entrypoint-supplied unchecked notes survive into the plan', () => {
        expect(buildMigrationPlan(createPlanInput({uncheckedNotes: ['overlay drift: not evaluated']}))
            .unchecked).toContain('overlay drift: not evaluated')
    });
});

test.describe('formatPlan', () => {
    test('a refused plan states REFUSED and includes every blocker key', () => {
        const plan   = buildMigrationPlan(createPlanInput({observedEnv: new Map(), composeIdentity: null})),
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
        // The entrypoint guard's real assertion: reaching this line means importing the driver did not
        // run a migration as an import side effect.
        expect(typeof parseArgs).toBe('function')
    });

    test('defaults to the dev selector, the canonical profile and the canonical cohort', () => {
        const options = parseArgs(['plan']);

        expect(options).toMatchObject({mode: 'plan', target: 'dev', profile: PROFILE});
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

    test('--set is repeatable and nests by service, so two services can carry the same key', () => {
        const options = parseArgs(['plan',
            '--set', 'orchestrator.NEO_CHROMA_HOST=chroma',
            '--set', 'mc-server.NEO_CHROMA_HOST=chroma',
            '--set', 'orchestrator.NEO_TRANSPORT=streamable-http'
        ]);

        expect(options.desiredEnv).toEqual({
            orchestrator: {NEO_CHROMA_HOST: 'chroma', NEO_TRANSPORT: 'streamable-http'},
            'mc-server' : {NEO_CHROMA_HOST: 'chroma'}
        })
    });

    test('--set splits on the FIRST = so a value containing = survives, and defaults to no desired env', () => {
        // Same reason `parseObservedEnv` splits on the first `=`: DSNs, base64 and query strings carry it,
        // and truncating the value would silently write a wrong config rather than failing.
        expect(parseArgs(['plan', '--set', 'kb-server.NEO_KB_ASK_BASE_URL=https://x/y?a=1&b=2']).desiredEnv)
            .toEqual({'kb-server': {NEO_KB_ASK_BASE_URL: 'https://x/y?a=1&b=2'}});

        expect(parseArgs(['plan']).desiredEnv).toEqual({})
    });

    test('--set refuses a malformed assignment rather than half-parsing it', () => {
        for (const bad of ['NEO_NO_SERVICE=1', 'orchestrator.NEO_NO_VALUE']) {
            expect(() => parseArgs(['plan', '--set', bad]), bad).toThrow(/--set expects/)
        }
    });

    test('--services splits, trims and drops empties', () => {
        expect(parseArgs(['plan', '--services', ' a , b ,, c ']).services).toEqual(['a', 'b', 'c'])
    });
});
