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
import {buildComposeFragment, buildPipelineEnv, parseArgs} from '../../../../../../ai/scripts/maintenance/migrateDeployment.mjs';

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
/**
 * Provenance for a fully-measured cohort. Supplied by default because its ABSENCE is a refusal: an empty
 * guarded set means "not measured" or "carries no Neo config" depending on whether the read succeeded, and
 * a caller that omits the discriminator must not be able to authorize by omission.
 */
function createObservation(services = COHORT, overrides = {}) {
    return {...Object.fromEntries(services.map(service => [service, {inspected: true, configRead: true}])), ...overrides}
}

function createPlanInput(overrides = {}) {
    return {
        observedEnvByService: createObserved(),
        observationByService: createObservation(),
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

    test('an UNREAD service blocks — silence from an unreachable container is not absence', () => {
        // The failure this encodes: `docker exec`/`inspect` against a stopped container emits nothing, so an
        // empty observation from a failed read means "not measured", never "no config set". I published three
        // false facts off exactly that silence.
        const plan = buildMigrationPlan(createPlanInput({
            observedEnvByService: {...createObserved(), orchestrator: new Map()},
            observationByService: createObservation(COHORT, {orchestrator: {inspected: true, configRead: false}})
        }));

        expect(plan.clean).toBe(false);

        const blocker = plan.blockers.find(entry => entry.kind === 'service-unmeasured');

        expect(blocker.key).toBe('orchestrator');
        expect(blocker.reason).toContain('not evidence of absence')
    });

    test('a READ service with a legitimately empty guarded set owes nothing, and says so', () => {
        // Chroma is the live instance: `docker inspect` succeeds and the guarded set is empty, because it is a
        // third-party image with no Neo configuration surface. Conflating this with an unread container refused
        // every real plane for a service behaving correctly. Measured before/after: 13 blockers -> 12.
        const plan = buildMigrationPlan(createPlanInput({
            observedEnvByService: {...createObserved(), chroma: new Map()},
            observationByService: createObservation([...COHORT, 'chroma']),
            serviceScopes       : {...createScopes(), chroma: new Set()}
        }));

        expect(plan.blockers.filter(entry => entry.key === 'chroma')).toEqual([]);

        // Visible, not silent: an operator must see the service was inspected and found irrelevant.
        expect(plan.notes.some(note => note.includes("service 'chroma'") && note.includes('nothing owed'))).toBe(true)
    });

    test('the same empty Map yields OPPOSITE verdicts depending only on provenance', () => {
        // The state the prior fixtures could not represent, which is why this class was missed: they always
        // populated every observed service, so observed-and-empty had no representation at all. Both cases
        // below pass an IDENTICAL empty Map; only the discriminator differs.
        const observedEnvByService = {...createObserved(), chroma: new Map()},
              scopes               = {...createScopes(), chroma: new Set()},
              read                 = buildMigrationPlan(createPlanInput({
                  observedEnvByService, serviceScopes: scopes,
                  observationByService: createObservation([...COHORT, 'chroma'])
              })),
              unread               = buildMigrationPlan(createPlanInput({
                  observedEnvByService, serviceScopes: scopes,
                  observationByService: createObservation([...COHORT, 'chroma'], {chroma: {inspected: true, configRead: false}})
              }));

        expect(read.blockers.filter(entry => entry.key === 'chroma')).toEqual([]);
        expect(unread.blockers.find(entry => entry.key === 'chroma').kind).toBe('service-unmeasured')
    });

    test('the discriminator is provenance, not an image allowlist — no third-party name in the source', async () => {
        // Deliberately a STRUCTURAL claim, which is all a source-text guard can carry: allowlisting `chroma`
        // would fix this plane and mis-handle the next third-party service, the same hardcode that cohort
        // discovery removed one layer up. The behavioural claims are the specs above.
        for (const rel of ['ai/scripts/maintenance/deploymentMigrationCore.mjs', 'ai/scripts/maintenance/migrateDeployment.mjs']) {
            const source = await fs.readFile(path.join(repoRoot, rel), 'utf8'),
                  code   = source.split('\n').filter(line => !/^\s*(\/\/|\*|\/\*)/.test(line)).join('\n');

            expect(code, `${rel} must not name a third-party service`).not.toMatch(/['"`]chroma['"`]/);
            expect(code, `${rel} must not name the proxy service`).not.toMatch(/['"`]ingress['"`]/)
        }
    });

    test('ABSENT provenance fails closed — a caller cannot authorize by omission', () => {
        const plan = buildMigrationPlan(createPlanInput({observationByService: null}));

        expect(plan.clean).toBe(false);

        const blockers = plan.blockers.filter(entry => entry.kind === 'service-unmeasured');

        expect(blockers.length).toBe(COHORT.length);
        expect(blockers[0].reason).toContain('no observation provenance')
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

test.describe('the invocation boundary carries the repair into the transaction', () => {
    const identity = {project: 'neo-local-agent-os', configFiles: ['/x/base.yml', '/x/overlay.yml']};

    test('the repair travels as a fragment appended LAST, because merge order decides which value wins', () => {
        // Two defects behind this, both @neo-gpt-emmy's. First: --set reached the plan and never reached
        // invokePipeline. Second, after I "fixed" it by forwarding parent env: the profile declares these
        // leaves as LITERALS, not ${VAR}, so parent env never reached the consumer either. Her positive
        // control is what settled it — NEO_DEPLOY_HOSTNAME renders while AUTHORITY_PROFILE does not, same
        // command. The fragment is what the containers actually consume.
        const plan                        = buildMigrationPlan(createPlanInput()),
              {pipelineEnv, composeFiles} = buildPipelineEnv(plan, identity, '/tmp/x/repair.compose.json');

        expect(composeFiles).toEqual(['/x/base.yml', '/x/overlay.yml', '/tmp/x/repair.compose.json']);
        expect(pipelineEnv.NEO_DEPLOY_COMPOSE_FILE.split(':').at(-1)).toBe('/tmp/x/repair.compose.json')
    });

    test('the fragment is service-scoped, so two services CAN carry different values for one key', () => {
        // The refusal that used to live here is gone. It blocked differing per-service values on the
        // premise that the transport was global interpolation — a premise that was false, and whose
        // refusal would now reject a transition the fragment can express.
        const fragment = JSON.parse(buildComposeFragment({
            orchestrator: {NEO_CHROMA_HOST: 'chroma'},
            'mc-server' : {NEO_CHROMA_HOST: 'localhost'}
        }));

        expect(fragment.services.orchestrator.environment.NEO_CHROMA_HOST).toBe('chroma');
        expect(fragment.services['mc-server'].environment.NEO_CHROMA_HOST).toBe('localhost');

        expect(buildMigrationPlan(createPlanInput({
            desiredEnv: {orchestrator: {NEO_CHROMA_HOST: 'chroma'}, 'mc-server': {NEO_CHROMA_HOST: 'localhost'}}
        })).blockers.filter(entry => entry.kind === 'desired-value-conflict')).toEqual([])
    });

    test('a literal $ is escaped, or Compose interpolation silently rewrites the operator\'s value', () => {
        // Measured through a real `docker compose config`: `p@ss${x}w$1` renders as `p@ssw$1` — the value
        // replaced by a different one with no error and only a warning on stderr. A generated password or
        // a DSN would be corrupted. `$$` is Compose's own escape for a literal `$`.
        const fragment = JSON.parse(buildComposeFragment({orchestrator: {NEO_SECRETISH: 'p@ss${x}w$1'}}));

        expect(fragment.services.orchestrator.environment.NEO_SECRETISH).toBe('p@ss$${x}w$$1')
    });

    test('the fragment is valid JSON, which is valid YAML — no hand-rolled quoting to get wrong', () => {
        const fragment = buildComposeFragment({orchestrator: {NEO_TRICKY: 'a: b #c "q"\n1'}});

        expect(() => JSON.parse(fragment)).not.toThrow();
        expect(JSON.parse(fragment).services.orchestrator.environment.NEO_TRICKY).toBe('a: b #c "q"\n1')
    });

    test('nothing declared yields NO fragment, so apply never appends a file it did not need', () => {
        expect(buildComposeFragment()).toBeNull();
        expect(buildComposeFragment({})).toBeNull();
        expect(buildComposeFragment({orchestrator: {}})).toBeNull()
    });

    test('the pinned revision and discovered identity survive alongside a repair fragment', () => {
        const plan          = buildMigrationPlan(createPlanInput()),
              {pipelineEnv} = buildPipelineEnv(plan, identity, '/tmp/x/repair.compose.json');

        expect(pipelineEnv.NEO_REF).toBe(TARGET_SHA);
        expect(pipelineEnv.NEO_DEPLOY_PROJECT_NAME).toBe('neo-local-agent-os');
        expect(pipelineEnv.NEO_DEPLOY_COMPOSE_FILE).toContain('/x/overlay.yml')
    });

    test('shadowing a transaction key is now impossible BY CONSTRUCTION, not by spread ordering', () => {
        // History worth keeping. @neo-gpt-emmy found `--set orchestrator.NEO_REF=<other>` emitted the other
        // SHA, because the repair spread AFTER the pinning; the test that was supposed to catch it passed
        // throughout, because its fixture never contained a transaction key — the control could not fail
        // for the reason the target might. The first fix reordered the spread. Moving the repair into a
        // fragment removed the class instead: `buildPipelineEnv` no longer accepts desired values at all,
        // so the three transaction keys can only come from the plan and the discovered identity.
        const plan = buildMigrationPlan(createPlanInput());

        // A fragment path is the ONLY third argument; a desired-env object cannot be smuggled through it.
        const {pipelineEnv} = buildPipelineEnv(plan, identity, '/tmp/x/repair.compose.json');

        expect(pipelineEnv.NEO_REF).toBe(TARGET_SHA);
        expect(pipelineEnv.NEO_DEPLOY_PROJECT_NAME).toBe('neo-local-agent-os');
        expect(Object.keys(pipelineEnv).sort()).toEqual(['NEO_DEPLOY_COMPOSE_FILE', 'NEO_DEPLOY_PROJECT_NAME', 'NEO_REF']);

        // And the parser still refuses the keys by name, so a fragment cannot set them on a container
        // either — belt and braces, since the fragment writes real container env.
        for (const key of ['NEO_REF', 'NEO_DEPLOY_PROJECT_NAME', 'NEO_DEPLOY_COMPOSE_FILE']) {
            expect(() => parseArgs(['plan', '--set', `orchestrator.${key}=HIJACKED`]), key).toThrow(/defines the transaction/)
        }
    });

    test('parseArgs refuses a reserved transaction key by NAME, not by losing a precedence contest', () => {
        // Two independent guards: a caller building desiredEnv programmatically never reaches the parser,
        // and a parser rejection alone would not protect that path.
        for (const key of ['NEO_REF', 'NEO_DEPLOY_PROJECT_NAME', 'NEO_DEPLOY_COMPOSE_FILE']) {
            expect(() => parseArgs(['plan', '--set', `orchestrator.${key}=x`]), key)
                .toThrow(/may not carry .*: it defines the transaction/)
        }

        expect(parseArgs(['plan', '--set', 'orchestrator.NEO_CHROMA_HOST=chroma']).desiredEnv)
            .toEqual({orchestrator: {NEO_CHROMA_HOST: 'chroma'}})
    });

    test('no repair declared appends no file — apply never carries config the operator did not name', () => {
        const {pipelineEnv, composeFiles} = buildPipelineEnv(buildMigrationPlan(createPlanInput()), identity);

        expect(composeFiles).toEqual(['/x/base.yml', '/x/overlay.yml']);
        expect(Object.keys(pipelineEnv).sort()).toEqual(['NEO_DEPLOY_COMPOSE_FILE', 'NEO_DEPLOY_PROJECT_NAME', 'NEO_REF'])
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

    test('the config cohort is WIDER than the revision cohort, and ingress is in it', () => {
        // Conflating them was the defect: `/app/.neo-revision` is written by the Neo image, so Caddy can
        // never produce a receipt — but Compose owns NEO_DEPLOY_HOSTNAME on ingress and the census
        // classifies it required. Observing only the receipt cohort left that key owned by nobody, which
        // refused every real plane as unattributable. Measured before and after: 13 blockers -> 12, with
        // `required-input-unattributable` gone.
        const options = parseArgs(['plan']);

        expect(options.services).toEqual(['mc-server', 'orchestrator', 'kb-server']);

        // `null` means DISCOVER from the plane's Compose labels. An earlier revision defaulted this to
        // `[...DEFAULT_SERVICES, 'ingress']`, which hardcodes one profile's topology into a tool whose whole
        // job is addressing a plane it did not build — a differently-named proxy or a fourth
        // config-bearing service would fall outside the contract again. Verified live: the discovered
        // cohort is `chroma, ingress, kb-server, mc-server, orchestrator`.
        expect(options.configServices).toBeNull()
    });

    test('--config-services narrows the config cohort independently of --services', () => {
        const options = parseArgs(['plan', '--services', 'mc-server', '--config-services', 'mc-server,ingress']);

        expect(options.services).toEqual(['mc-server']);
        expect(options.configServices).toEqual(['mc-server', 'ingress'])
    });

    test('--services splits, trims and drops empties', () => {
        expect(parseArgs(['plan', '--services', ' a , b ,, c ']).services).toEqual(['a', 'b', 'c'])
    });
});
