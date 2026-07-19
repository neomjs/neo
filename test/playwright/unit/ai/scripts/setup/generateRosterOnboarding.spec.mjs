import {setup} from '../../../../setup.mjs';

const appName = 'GenerateRosterOnboardingTest';

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect}            from '@playwright/test';
import {execFileSync, spawnSync} from 'node:child_process';
import fs                        from 'node:fs';
import os                        from 'node:os';
import path                      from 'node:path';
import {fileURLToPath}           from 'node:url';
import Neo                       from '../../../../../../src/Neo.mjs';
import * as core                 from '../../../../../../src/core/_export.mjs';
import {
    ENGINE_CLASS_KEYS,
    SURFACE_STATES,
    SOCIAL_NAME_CLASS_KEYS,
    SURFACE_PATHS,
    buildOnboardingPlan,
    checkWriteGuard,
    deriveDisplayForm,
    deriveSectionAnchor,
    parseGenerateArgs,
    planModelStatsSurface,
    planOnboardingSurfaces,
    planReadmeSurface,
    planRosterSurface,
    planRotationSurfaces,
    planSpecSurface,
    renderModelStatsSection,
    renderOnboardingReport,
    renderReadmeRow,
    renderRosterEntry,
    renderSpecPin,
    renderPrBodyDraft
} from '../../../../../../ai/scripts/setup/generateRosterOnboarding.mjs';

const REPO_ROOT   = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../../..');
const SCRIPT_PATH = path.join(REPO_ROOT, 'ai/scripts/setup/generateRosterOnboarding.mjs');

const FIXED_NOW    = '2026-07-10T12:00:00.000Z';
const BASE_OPTIONS = Object.freeze({
    handle: '@neo-unit-probe',
    family: 'claude',
    now   : FIXED_NOW
});

/**
 * @summary Builds a valid plan from the shared fixture options.
 * @param {Object} [overrides] Option overrides.
 * @returns {Object} The frozen plan.
 */
function buildPlan(overrides = {}) {
    const built = buildOnboardingPlan({...BASE_OPTIONS, ...overrides});

    expect(built.valid).toBe(true);

    return built.plan;
}

/**
 * @summary Reads the four REAL surface files from the repo root, so anchor assumptions are
 * verified against the live shapes rather than fixtures alone.
 * @returns {Object} File contents keyed `{identityRoots, modelStats, readme, spec}`
 */
function readRealFiles() {
    const files = {};

    for (const [key, relative] of Object.entries(SURFACE_PATHS)) {
        files[key] = fs.readFileSync(path.join(REPO_ROOT, relative), 'utf8');
    }

    return files;
}

const ROSTER_FIXTURE = `export const TRUST_TIERS = Object.freeze({PEER_TRUSTED: 'peer-trusted', UNCLASSIFIED: 'unclassified'});

export const IDENTITIES = [
    {
        id         : '@neo-existing',
        type       : 'AgentIdentity',
        properties : {}
    },
    {
        id         : 'AGENT:*',
        type       : 'BroadcastSentinel',
        properties : {}
    }
];
`;

const README_FIXTURE = `# Fixture

| Name | Maintainer | Role | Identity |
|---|---|---|---|
| Tobias | [@tobiu](https://github.com/tobiu) | Gardener | Human |
| Euclid | [@neo-gpt](https://github.com/neo-gpt) | AI maintainer | Machine Account |

Trailing prose.
`;

const MODEL_STATS_FIXTURE = `# Model Stats Registry

## §active_swarm_identities

### §neo_gpt

| Field | Value |
|---|---|
| \`id\` / \`githubLogin\` | \`@neo-gpt\` |

---

## §pending_swarm_identities

Pending identities paragraph.

---

## §mlx_local_operational
`;

const SPEC_FIXTURE = `import {test, expect} from '@playwright/test';
import {IDENTITIES}   from '../../../../../ai/graph/identityRoots.mjs';

test.describe('existing', () => {
    test('pins @neo-existing', () => {
        expect(IDENTITIES.find(node => node.id === '@neo-existing')).toBeTruthy();
    });
});
`;

const MIGRATION_FIXTURE = `export const MIGRATION_EPOCH = '2026-07-04T00:00:00Z';
export const REGISTRY_MODEL_DESIGNATIONS = Object.freeze({'@neo-gpt': 'GPT-5.5'});
`;

const FIXTURE_FILES = Object.freeze({
    identityRoots: ROSTER_FIXTURE,
    migration    : MIGRATION_FIXTURE,
    modelStats   : MODEL_STATS_FIXTURE,
    readme       : README_FIXTURE,
    spec         : SPEC_FIXTURE
});

const ROTATION_FILES = Object.freeze({
    identityRoots: `export const IDENTITIES = [
    {
        id         : '@neo-gpt',
        type       : 'AgentIdentity',
        name       : 'Euclid',
        description: 'Stable resident compatibility prose',
        properties : {
            githubLogin        : '@neo-gpt',
            displayName        : 'Euclid',
            modelFamily        : 'gpt',
            participationStatus: 'active'
        }
    },
    {
        id         : 'AGENT:*',
        type       : 'BroadcastSentinel',
        properties : {}
    }
];
`,
    migration : MIGRATION_FIXTURE,
    modelStats: `# Model Stats Registry

### §neo_gpt

| Field | Value |
|---|---|
| \`id\` / \`githubLogin\` | \`@neo-gpt\` |
| \`name\` | GPT-5.5 |
| \`family\` | \`gpt\` (OpenAI) |

## §update_history

| Date | Identity | Change | Reference |
|---|---|---|---|
`,
    readme: `# Fixture

| Name | Maintainer | Role | Identity |
|---|---|---|---|
| Euclid | [@neo-gpt](https://github.com/neo-gpt) | AI maintainer (OpenAI GPT-5.5 / Codex) | Machine Account |
`,
    spec: `test.describe('identity continuity', () => {
    test('pins @neo-gpt', () => {
        expect(IDENTITIES.find(node => node.id === '@neo-gpt')).toBeTruthy();
    });
});
`
});

const fixtureRoots = [];

/**
 * @summary Creates a real temporary git worktree carrying the generator's fixed surfaces.
 * @param {Object} [files] Surface contents
 * @returns {String} Temporary repo root
 */
function createFixtureRepo(files = FIXTURE_FILES) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-roster-generator-'));

    fixtureRoots.push(root);

    for (const [key, relative] of Object.entries(SURFACE_PATHS)) {
        const target = path.join(root, relative);

        fs.mkdirSync(path.dirname(target), {recursive: true});
        fs.writeFileSync(target, files[key], 'utf8');
    }

    execFileSync('git', ['init', '-b', 'fixture/identity-ceremony'], {cwd: root, stdio: 'ignore'});

    return root;
}

/**
 * @summary Executes the real CLI in a fresh Node process against an isolated fixture repo.
 * @param {String} root Fixture repo root
 * @param {String[]} args CLI args before the injected repo-root
 * @returns {{status: Number|null, stdout: String, stderr: String}}
 */
function runFreshCli(root, args) {
    const result = spawnSync(process.execPath, [SCRIPT_PATH, ...args, '--repo-root', root], {
        cwd     : REPO_ROOT,
        encoding: 'utf8'
    });

    return {status: result.status, stdout: result.stdout, stderr: result.stderr};
}

test.afterAll(() => {
    for (const root of fixtureRoots) {
        fs.rmSync(root, {recursive: true, force: true});
    }
});

test.describe('generateRosterOnboarding — plan construction (pure half)', () => {

    test('builds the Layer-1 plan: handle-derived display form, defaults, section anchor, since = generation time', () => {
        const plan = buildPlan();

        expect(plan.handle).toBe('@neo-unit-probe');
        expect(plan.handleBody).toBe('neo-unit-probe');
        expect(plan.family).toBe('claude');
        expect(plan.familyVendor).toBe('Anthropic');
        expect(plan.familyDisplay).toBe('Claude');
        expect(plan.displayForm).toBe('Neo Unit Probe');
        expect(plan.sectionAnchor).toBe('neo_unit_probe');
        expect(plan.since).toBe(FIXED_NOW);

        // GitHub defaults to the resident handle; A2A addressing is the identity id itself
        expect(plan.githubUsername).toBe('@neo-unit-probe');

        // helper derivations hold for multi-part handles
        expect(deriveDisplayForm('@neo-fable-clio')).toBe('Neo Fable Clio');
        expect(deriveDisplayForm('@neo-gpt-emmy')).toBe('Neo GPT Emmy');
        expect(deriveSectionAnchor('@neo-fable-clio')).toBe('neo_fable_clio');

        // unknown families render with the bare token — never a guessed vendor
        const exotic = buildPlan({family: 'newfamily'});
        expect(exotic.familyVendor).toBeNull();
        expect(exotic.familyDisplay).toBe('newfamily');
    });

    test('every socialName-class key is rejected loudly — Social Names are never seed data', () => {
        for (const key of SOCIAL_NAME_CLASS_KEYS) {
            const built = buildOnboardingPlan({...BASE_OPTIONS, [key]: 'Muse'});

            expect(built.valid).toBe(false);
            expect(built.plan).toBeNull();
            expect(built.reason).toContain('naming ritual');
        }
    });

    test('every engine-class key is rejected loudly — engine facts are observation-owned', () => {
        for (const key of ENGINE_CLASS_KEYS) {
            const built = buildOnboardingPlan({...BASE_OPTIONS, [key]: 'some-engine-5'});

            expect(built.valid).toBe(false);
            expect(built.plan).toBeNull();
            expect(built.reason).toContain('observation-owned');
        }
    });

    test('malformed inputs refuse: handle, family, github username, timestamp', () => {
        expect(buildOnboardingPlan({...BASE_OPTIONS, handle: ''}).valid).toBe(false);
        expect(buildOnboardingPlan({...BASE_OPTIONS, handle: '@Neo-Upper'}).valid).toBe(false);
        expect(buildOnboardingPlan({...BASE_OPTIONS, family: 'Claude'}).valid).toBe(false);
        expect(buildOnboardingPlan({...BASE_OPTIONS, family: undefined}).valid).toBe(false);
        expect(buildOnboardingPlan({...BASE_OPTIONS, githubUsername: 'not a handle!'}).valid).toBe(false);
        expect(buildOnboardingPlan({...BASE_OPTIONS, now: 'not-a-date'}).valid).toBe(false);
    });
});

test.describe('generateRosterOnboarding — surface emitters (pure half)', () => {

    test('the roster entry is schema-backed only: pending lifecycle state, no workflow contract, engine facts, wake template, or social name', () => {
        const entry = renderRosterEntry(buildPlan());

        // Layer-1 operational fields
        expect(entry).toContain(`id         : '@neo-unit-probe',`);
        expect(entry).toContain(`githubLogin: '@neo-unit-probe',`);
        expect(entry).toContain(`displayName: 'Neo Unit Probe',`);
        expect(entry).toContain(`modelFamily: 'claude',`);
        expect(entry).toContain('trustTier  : TRUST_TIERS.PEER_TRUSTED,');
        expect(entry).not.toContain('identityContract');

        // pending-first-boot lifecycle state with the ACTUAL generation timestamp (no backfill)
        expect(entry).toContain(`participationStatus: 'temporarily_unreachable',`);
        expect(entry).toContain(`since              : '${FIXED_NOW}',`);
        expect(entry).toContain(`createdAt          : '${FIXED_NOW}'`);
        expect(entry).toContain(`authority          : '@tobiu',`);

        // engine facts, wake templates, and social-name material are absent BY CONSTRUCTION —
        // asserted at property-KEY position (the explanatory comments may name the absences)
        for (const forbidden of ['contextWindowInput', 'pricingInput', 'pricingOutput', 'thoughtBudget', 'releaseDate', 'sunsetTriggers', 'swarmRole', 'subscriptionTemplate', 'modelAssignment', 'socialName', 'identityContract']) {
            expect(entry, `roster entry must not carry a '${forbidden}' property`).not.toMatch(new RegExp(`^\\s*${forbidden}\\s*:`, 'm'));
        }

        const gptEntry = renderRosterEntry(buildPlan({family: 'gpt', handle: '@neo-gpt-emmy'}));

        expect(gptEntry).toContain(`name       : 'Neo GPT Emmy'`);
        expect(gptEntry).toContain(`description: 'OpenAI GPT Agent Identity`);
        expect(gptEntry).toContain(`reactivationTrigger: 'Operator confirms participation activation after first boot'`);
    });

    test('the README row keeps the Name cell bare and the Role cell family-only (engine designation pending)', () => {
        expect(renderReadmeRow(buildPlan())).toBe(
            '| - | [@neo-unit-probe](https://github.com/neo-unit-probe) | AI maintainer (Anthropic Claude family — engine designation pending first boot) | Machine Account |'
        );

        // unknown family: bare token, no invented vendor
        expect(renderReadmeRow(buildPlan({family: 'newfamily'}))).toContain('AI maintainer (newfamily family — engine designation pending first boot)');
    });

    test('the ModelStats skeleton carries source-citation placeholders, never invented capability facts', () => {
        const section = renderModelStatsSection(buildPlan());

        expect(section.startsWith('### §neo_unit_probe\n')).toBe(true);
        expect(section).toContain('| `id` / `githubLogin` | `@neo-unit-probe` |');
        expect(section).toContain('| `family` | `claude` (Anthropic) |');
        expect(section).toContain('`temporarily_unreachable`');
        expect(section).toContain('**Sources** (primary first):');

        // every observation-owned value is an explicit placeholder
        for (const field of ['name', 'hosting', 'tier', 'contextWindowInput', 'parallelToolCalls', 'thoughtBudget', 'releaseDate', 'pricingInput', 'pricingOutput', 'sunsetTriggers']) {
            const row = section.split('\n').find(line => line.startsWith('| `' + field + '` |'));

            expect(row, `ModelStats row for '${field}' must exist`).toBeTruthy();
            expect(row, `ModelStats row for '${field}' must be a V-B-A placeholder`).toContain('V-B-A pending');
        }

        // no invented numeric capability values anywhere (token counts, prices, dates)
        expect(section).not.toMatch(/\| `(contextWindowInput|pricingInput|pricingOutput|releaseDate)` \| [^(]/);
        expect(section).not.toContain('`swarmRole`');
    });

    test('generated identity prose never assigns staffing utility or a fixed character', () => {
        const plan  = buildPlan(),
              prose = [renderRosterEntry(plan), renderReadmeRow(plan), renderModelStatsSection(plan)].join('\n');

        expect(prose).not.toMatch(/\b(assigned lane|bandwidth|bottleneck|capacity|force multiplier|generalist|mythos|opening lane|pressure|productivity|redundancy|review coverage|reviewer|staffing utility|throughput|workhorse)\b/i);
    });

    test('the spec pin asserts Layer-1 invariants and engine-fact absence', () => {
        const pin = renderSpecPin(buildPlan());

        expect(pin).toContain(`test.describe('ai/graph/identityRoots — @neo-unit-probe roster pin', () => {`);
        expect(pin).toContain(`githubLogin: '@neo-unit-probe',`);
        expect(pin).toContain(`displayName: 'Neo Unit Probe',`);
        expect(pin).toContain(`trustTier  : 'peer-trusted'`);
        expect(pin).toContain(`not.toHaveProperty('subscriptionTemplate')`);
        expect(pin).toContain(`not.toHaveProperty('contextWindowInput')`);
    });
});

test.describe('generateRosterOnboarding — surface planning (anchors + convergence)', () => {

    test('roster surface: MISSING inserts before the broadcast sentinel; exact rerun reports MATCH', () => {
        const plan  = buildPlan();
        const first = planRosterSurface(ROSTER_FIXTURE, plan);

        expect(first.status).toBe(SURFACE_STATES.MISSING);
        expect(first.updated).toContain(`id         : '@neo-unit-probe',`);
        expect(first.updated.indexOf(`'@neo-unit-probe'`)).toBeGreaterThan(first.updated.indexOf(`'@neo-existing'`));
        expect(first.updated.indexOf(`'@neo-unit-probe'`)).toBeLessThan(first.updated.indexOf(`'AGENT:*'`));

        const laterPlan = buildPlan({now: '2026-07-11T12:00:00.000Z'}),
              second    = planRosterSurface(first.updated, laterPlan);

        expect(second.status).toBe(SURFACE_STATES.MATCH);
        expect(second.updated).toBeNull();
        expect(first.updated).toContain(`createdAt          : '${FIXED_NOW}'`);
    });

    test('README surface: MISSING appends after the roster table; exact rerun reports MATCH', () => {
        const plan  = buildPlan();
        const first = planReadmeSurface(README_FIXTURE, plan);

        expect(first.status).toBe(SURFACE_STATES.MISSING);

        const lines  = first.updated.split('\n'),
              rowIdx = lines.indexOf(renderReadmeRow(plan));

        expect(rowIdx).toBeGreaterThan(-1);
        expect(lines[rowIdx - 1].startsWith('| Euclid |')).toBe(true);
        expect(lines[rowIdx + 1]).toBe('');

        const second = planReadmeSurface(first.updated, plan);

        expect(second.status).toBe(SURFACE_STATES.MATCH);
        expect(second.updated).toBeNull();
    });

    test('ModelStats surface: MISSING inserts inside pending; exact rerun reports MATCH', () => {
        const plan  = buildPlan();
        const first = planModelStatsSurface(MODEL_STATS_FIXTURE, plan);

        expect(first.status).toBe(SURFACE_STATES.MISSING);

        const sectionIdx = first.updated.indexOf('### §neo_unit_probe');

        expect(sectionIdx).toBeGreaterThan(first.updated.indexOf('## §pending_swarm_identities'));
        expect(sectionIdx).toBeLessThan(first.updated.indexOf('## §mlx_local_operational'));

        const second = planModelStatsSurface(first.updated, plan);

        expect(second.status).toBe(SURFACE_STATES.MATCH);
        expect(second.updated).toBeNull();
    });

    test('spec surface: MISSING appends the dedicated pin; exact rerun reports MATCH', () => {
        const plan  = buildPlan();
        const first = planSpecSurface(SPEC_FIXTURE, plan);

        expect(first.status).toBe(SURFACE_STATES.MISSING);
        expect(first.updated.trimEnd().endsWith('});')).toBe(true);
        expect(first.updated.indexOf('@neo-unit-probe roster pin')).toBeGreaterThan(first.updated.indexOf(`node.id === '@neo-existing'`));

        const second = planSpecSurface(first.updated, plan);

        expect(second.status).toBe(SURFACE_STATES.MATCH);
        expect(second.updated).toBeNull();
    });

    test('incidental quoted-handle prose does not satisfy the dedicated structural spec pin', () => {
        const incidental = SPEC_FIXTURE + "\nconst unrelatedExample = '@neo-unit-probe';\n",
              result     = planSpecSurface(incidental, buildPlan());

        expect(result.status).toBe(SURFACE_STATES.MISSING);
        expect(result.updated).toContain('@neo-unit-probe roster pin');
    });

    test('corrected family/login input repairs every unambiguous generated block, then converges to MATCH', () => {
        const initialPlan = buildPlan(),
              initial     = planOnboardingSurfaces(initialPlan, FIXTURE_FILES),
              applied     = Object.fromEntries(initial.surfaces.map(surface => [surface.surface, surface.updated]));

        applied.migration = MIGRATION_FIXTURE;

        const correctedPlan = buildPlan({family: 'gpt', githubUsername: '@neo-unit-probe-gh'}),
              corrected     = planOnboardingSurfaces(correctedPlan, applied);

        expect(corrected.valid).toBe(true);
        expect(corrected.surfaces.map(surface => surface.status)).toEqual([
            SURFACE_STATES.DIVERGENT,
            SURFACE_STATES.DIVERGENT,
            SURFACE_STATES.DIVERGENT,
            SURFACE_STATES.DIVERGENT
        ]);
        expect(corrected.surfaces.every(surface => surface.repairable)).toBe(true);

        const repaired = Object.fromEntries(corrected.surfaces.map(surface => [surface.surface, surface.updated]));

        repaired.migration = MIGRATION_FIXTURE;

        const converged = planOnboardingSurfaces(correctedPlan, repaired);

        expect(converged.valid).toBe(true);
        expect(converged.surfaces.map(surface => surface.status)).toEqual([
            SURFACE_STATES.MATCH,
            SURFACE_STATES.MATCH,
            SURFACE_STATES.MATCH,
            SURFACE_STATES.MATCH
        ]);
        expect((repaired.readme.match(/neo-unit-probe-gh/g) || [])).toHaveLength(2);
        expect(repaired.readme).not.toContain('github.com/neo-unit-probe)');
    });

    test('a corrected custom login replaces the prior custom-login row instead of appending', () => {
        const initialPlan = buildPlan({githubUsername: '@neo-unit-old'}),
              initial     = planOnboardingSurfaces(initialPlan, FIXTURE_FILES),
              applied     = Object.fromEntries(initial.surfaces.map(surface => [surface.surface, surface.updated])),
              corrected   = planOnboardingSurfaces(buildPlan({githubUsername: '@neo-unit-new'}), applied),
              readme      = corrected.surfaces.find(surface => surface.surface === 'readme');

        expect(corrected.valid).toBe(true);
        expect(readme.status).toBe(SURFACE_STATES.DIVERGENT);
        expect((readme.updated.match(/github\.com\/neo-unit-new/g) || [])).toHaveLength(1);
        expect(readme.updated).not.toContain('github.com/neo-unit-old');
    });

    test('ambiguous legacy content fails the whole plan before any partial write is applicable', () => {
        const duplicate = README_FIXTURE.replace(
                  '\nTrailing prose.',
                  '\n| - | [@neo-unit-probe](https://github.com/neo-unit-probe) | legacy | Machine Account |\n| - | [@neo-unit-probe](https://github.com/neo-unit-probe) | duplicate | Machine Account |\n\nTrailing prose.'
              ),
              planned = planOnboardingSurfaces(buildPlan(), {...FIXTURE_FILES, readme: duplicate});

        expect(planned.valid).toBe(false);
        expect(planned.reason).toContain('2 maintainer rows');
        expect(planned.surfaces.find(surface => surface.surface === 'readme')).toMatchObject({
            status    : SURFACE_STATES.DIVERGENT,
            repairable: false,
            updated   : null
        });
    });

    test('a ModelStats anchor prefix-collision does not false-report MATCH (§neo_x vs §neo_x_sibling)', () => {
        const sibling = MODEL_STATS_FIXTURE.replace('### §neo_gpt', '### §neo_unit_probe_sibling');
        const result  = planModelStatsSurface(sibling, buildPlan());

        expect(result.status).toBe(SURFACE_STATES.MISSING);
    });

    test('missing insertion anchors refuse loudly instead of guessing', () => {
        const plan = buildPlan();

        expect(planRosterSurface('export const IDENTITIES = [];\n', plan).status).toBe(SURFACE_STATES.DIVERGENT);
        expect(planReadmeSurface('# No table here\n', plan).status).toBe(SURFACE_STATES.DIVERGENT);
        expect(planModelStatsSurface('# No pending heading\n', plan).status).toBe(SURFACE_STATES.DIVERGENT);
        expect(planSpecSurface('', plan).status).toBe(SURFACE_STATES.DIVERGENT);
    });

    test('planOnboardingSurfaces is fail-closed: missing file content or an invalid surface invalidates the payload', () => {
        const plan = buildPlan();

        const missing = planOnboardingSurfaces(plan, {identityRoots: ROSTER_FIXTURE});

        expect(missing.valid).toBe(false);
        expect(missing.surfaces).toEqual([]);

        const broken = planOnboardingSurfaces(plan, {...FIXTURE_FILES, readme: '# No table here\n'});

        expect(broken.valid).toBe(false);
        expect(broken.reason).toContain('insertion anchor not found');

        const healthy = planOnboardingSurfaces(plan, FIXTURE_FILES);

        expect(healthy.valid).toBe(true);
        expect(healthy.surfaces.map(surface => surface.status)).toEqual([
            SURFACE_STATES.MISSING,
            SURFACE_STATES.MISSING,
            SURFACE_STATES.MISSING,
            SURFACE_STATES.MISSING
        ]);
    });

    test('the dry-run report prints status, anchor, and the exact snippet per surface, plus the advisory notes', () => {
        const plan    = buildPlan();
        const planned = planOnboardingSurfaces(plan, FIXTURE_FILES);
        const report  = renderOnboardingReport(plan, planned).join('\n');

        expect(report).toContain('[MISSING] ai/graph/identityRoots.mjs');
        expect(report).toContain('[MISSING] README.md');
        expect(report).toContain('[MISSING] learn/agentos/ModelStats.md');
        expect(report).toContain('[MISSING] test/playwright/unit/ai/graph/identityRoots.spec.mjs');
        expect(report).toContain('anchor: immediately before the');
        expect(report).toContain('advisory (printed, never written)');

        // MATCH surfaces report the reason instead of a duplicate snippet
        const readme   = planned.surfaces.find(surface => surface.surface === 'readme');
        const applied  = planOnboardingSurfaces(plan, {...FIXTURE_FILES, readme: readme.updated});
        const rerender = renderOnboardingReport(plan, applied).join('\n');

        expect(rerender).toContain('[MATCH] README.md');
    });
});

test.describe('generateRosterOnboarding — rotation hindcast (#14901 / PR #14902)', () => {

    test('rotates only README + ModelStats while roots, spec, and migration epoch stay byte-stable', () => {
        const plan = buildPlan({
                  designation: 'GPT-5.6 Sol',
                  family     : 'gpt',
                  handle     : '@neo-gpt',
                  mode       : 'rotation'
              }),
              planned = planRotationSurfaces(plan, ROTATION_FILES);

        expect(planned.valid).toBe(true);
        expect(planned.surfaces.map(surface => surface.status)).toEqual([
            SURFACE_STATES.MATCH,
            SURFACE_STATES.DIVERGENT,
            SURFACE_STATES.DIVERGENT,
            SURFACE_STATES.MATCH,
            SURFACE_STATES.MATCH
        ]);
        expect(planned.surfaces.filter(surface => surface.updated !== null).map(surface => surface.path)).toEqual([
            'README.md',
            'learn/agentos/ModelStats.md'
        ]);
        expect(planned.surfaces.find(surface => surface.surface === 'readme').updated).toContain('OpenAI GPT-5.6 Sol / Codex');
        expect(planned.surfaces.find(surface => surface.surface === 'modelStats').updated).toContain('| `name` | GPT-5.6 Sol |');
        expect(planned.surfaces.find(surface => surface.surface === 'identityRoots').updated).toBeNull();
        expect(planned.surfaces.find(surface => surface.surface === 'migration').updated).toBeNull();
        expect(ROTATION_FILES.migration).toContain("'@neo-gpt': 'GPT-5.5'");

        const draft = renderPrBodyDraft(plan, planned).join('\n');

        expect(draft).toContain('`README.md`');
        expect(draft).toContain('`learn/agentos/ModelStats.md`');
        expect(draft).not.toContain('`ai/graph/identityRoots.mjs` —');
        expect(draft).not.toContain('`ai/graph/identityRootsMigration.mjs` —');
        expect(draft).toContain('migration epoch/designation snapshot unchanged');
    });

    test('rerunning the repaired rotation is a five-surface MATCH', () => {
        const plan  = buildPlan({designation: 'GPT-5.6 Sol', family: 'gpt', handle: '@neo-gpt', mode: 'rotation'}),
              first = planRotationSurfaces(plan, ROTATION_FILES),
              files = {
                  ...ROTATION_FILES,
                  modelStats: first.surfaces.find(surface => surface.surface === 'modelStats').updated,
                  readme    : first.surfaces.find(surface => surface.surface === 'readme').updated
              },
              second = planRotationSurfaces(plan, files);

        expect(second.valid).toBe(true);
        expect(second.surfaces.every(surface => surface.status === SURFACE_STATES.MATCH)).toBe(true);
        expect(second.surfaces.every(surface => surface.updated === null)).toBe(true);
    });

    test('a desired designation that is only a substring of the prior designation still rotates both mirrors', () => {
        const plan  = buildPlan({designation: 'GPT-5.5', family: 'gpt', handle: '@neo-gpt', mode: 'rotation'}),
              files = {
                  ...ROTATION_FILES,
                  modelStats: ROTATION_FILES.modelStats.replace('| `name` | GPT-5.5 |', '| `name` | GPT-5.5 Preview |'),
                  readme    : ROTATION_FILES.readme.replace('OpenAI GPT-5.5 / Codex', 'OpenAI GPT-5.5 Preview / Codex')
              },
              planned = planRotationSurfaces(plan, files),
              readme  = planned.surfaces.find(surface => surface.surface === 'readme');

        expect(planned.valid).toBe(true);
        expect(readme.status).toBe(SURFACE_STATES.DIVERGENT);
        expect(readme.updated).toContain('OpenAI GPT-5.5 / Codex');
        expect(readme.updated).not.toContain('GPT-5.5 Preview');
    });
});

test.describe('generateRosterOnboarding — live-file anchoring (the anchors must match the real shapes)', () => {

    test('a fresh resident plans MISSING on all four REAL onboarding surfaces', () => {
        const planned = planOnboardingSurfaces(buildPlan(), readRealFiles());

        expect(planned.valid).toBe(true);
        expect(planned.surfaces.map(surface => surface.status)).toEqual([
            SURFACE_STATES.MISSING,
            SURFACE_STATES.MISSING,
            SURFACE_STATES.MISSING,
            SURFACE_STATES.MISSING
        ]);
    });

    test('an activated resident (@neo-fable) is DIVERGENT and refuses onboarding overwrite', () => {
        const planned = planOnboardingSurfaces(buildPlan({handle: '@neo-fable'}), readRealFiles());

        expect(planned.valid).toBe(false);
        expect(planned.surfaces[0].status).toBe(SURFACE_STATES.DIVERGENT);
        expect(planned.surfaces[0].repairable).toBe(false);
    });

    test('the applied REAL roster output is valid JavaScript and lands the Layer-1 entry (data-URL import)', async () => {
        const plan   = buildPlan();
        const result = planRosterSurface(readRealFiles().identityRoots, plan);

        expect(result.status).toBe(SURFACE_STATES.MISSING);

        const module_ = await import('data:text/javascript;base64,' + Buffer.from(result.updated, 'utf8').toString('base64'));
        const entry   = module_.IDENTITIES.find(node => node.id === '@neo-unit-probe');

        expect(entry).toBeTruthy();
        expect(entry.type).toBe('AgentIdentity');
        expect(entry.name).toBe('Neo Unit Probe');
        expect(entry.properties.githubLogin).toBe('@neo-unit-probe');
        expect(entry.properties.trustTier).toBe('peer-trusted');
        expect(entry.properties.participationStatus).toBe('temporarily_unreachable');
        expect(entry.properties.since).toBe(FIXED_NOW);
        expect(entry.properties.createdAt).toBe(FIXED_NOW);

        // the emitted entry carries NO engine facts and NO wake template
        for (const forbidden of ['contextWindowInput', 'pricingInput', 'pricingOutput', 'thoughtBudget', 'releaseDate', 'subscriptionTemplate', 'modelAssignment', 'identityContract', 'swarmRole']) {
            expect(entry.properties, `applied entry must not carry '${forbidden}'`).not.toHaveProperty(forbidden);
        }

        // the sentinel stays the roster tail; the resident sits directly before it
        const ids = module_.IDENTITIES.map(node => node.id);

        expect(ids.indexOf('@neo-unit-probe')).toBe(ids.indexOf('AGENT:*') - 1);
    });
});

test.describe('generateRosterOnboarding — CLI contract + write guard', () => {

    test('the write guard refuses integration branches, detached HEAD, and unresolvable branches', () => {
        expect(checkWriteGuard({branch: 'dev'}).valid).toBe(false);
        expect(checkWriteGuard({branch: 'main'}).valid).toBe(false);
        expect(checkWriteGuard({branch: 'HEAD'}).valid).toBe(false);
        expect(checkWriteGuard({branch: null}).valid).toBe(false);
        expect(checkWriteGuard({branch: ''}).valid).toBe(false);
        expect(checkWriteGuard({}).valid).toBe(false);

        const allowed = checkWriteGuard({branch: 'agent/14916-roster-onboarding-generator'});

        expect(allowed).toEqual({valid: true, reason: null});
    });

    test('engine-class and socialName-class flags refuse loudly; unknown flags refuse; the valid surface parses', () => {
        const engine = parseGenerateArgs(['--handle', '@neo-x', '--family', 'claude', '--model', 'some-engine-5']);

        expect(engine.valid).toBe(false);
        expect(engine.reason).toContain('observation-owned');

        const designation = parseGenerateArgs(['--designation', 'some-engine-5']);

        expect(designation.valid).toBe(true);
        expect(buildOnboardingPlan({...BASE_OPTIONS, designation: 'some-engine-5'}).valid).toBe(false);

        const social = parseGenerateArgs(['--handle', '@neo-x', '--family', 'claude', '--social-name', 'Muse']);

        expect(social.valid).toBe(false);
        expect(social.reason).toContain('naming ritual');

        const unknown = parseGenerateArgs(['--frobnicate', 'x']);

        expect(unknown.valid).toBe(false);

        const missingValue = parseGenerateArgs(['--handle']);

        expect(missingValue.valid).toBe(false);

        const parsed = parseGenerateArgs(['--handle', '@neo-x', '--family', 'claude', '--github-username', '@neo-x-gh', '--write']);

        expect(parsed.valid).toBe(true);
        expect(parsed.options).toEqual({
            family        : 'claude',
            githubUsername: '@neo-x-gh',
            handle        : '@neo-x',
            help          : false,
            write         : true
        });
    });
});

test.describe('generateRosterOnboarding — fresh-process CLI convergence', () => {

    const onboardingArgs = ['--handle', '@neo-unit-probe', '--family', 'claude'];

    test('initial onboarding writes four surfaces; same-input rerun is a zero-op MATCH', () => {
        const root = createFixtureRepo(),
              dry  = runFreshCli(root, onboardingArgs);

        expect(dry.status).toBe(0);
        expect((dry.stdout.match(/\[MISSING\]/g) || [])).toHaveLength(4);

        const write = runFreshCli(root, [...onboardingArgs, '--write']);

        expect(write.status).toBe(0);
        expect((write.stdout.match(/\[WROTE\]/g) || [])).toHaveLength(4);

        const rerun = runFreshCli(root, onboardingArgs);

        expect(rerun.status).toBe(0);
        expect((rerun.stdout.match(/\[MATCH\]/g) || [])).toHaveLength(4);
        expect(rerun.stdout).toContain('- None — exact generated/current content already matches.');
    });

    test('corrected input is DIVERGENT-but-repairable and produces no duplicate README row', () => {
        const root = createFixtureRepo();

        expect(runFreshCli(root, [...onboardingArgs, '--write']).status).toBe(0);

        const correctedArgs = ['--handle', '@neo-unit-probe', '--family', 'gpt', '--github-username', '@neo-unit-probe-gh'],
              dry           = runFreshCli(root, correctedArgs);

        expect(dry.status).toBe(0);
        expect((dry.stdout.match(/\[DIVERGENT\]/g) || [])).toHaveLength(4);

        const write = runFreshCli(root, [...correctedArgs, '--write']);

        expect(write.status).toBe(0);

        const readme = fs.readFileSync(path.join(root, SURFACE_PATHS.readme), 'utf8');

        expect((readme.match(/github\.com\/neo-unit-probe-gh/g) || [])).toHaveLength(1);
        expect(readme).not.toContain('github.com/neo-unit-probe)');
    });

    test('ambiguous legacy content fails before any sibling surface changes', () => {
        const root       = createFixtureRepo(),
              beforeRoot = fs.readFileSync(path.join(root, SURFACE_PATHS.identityRoots), 'utf8'),
              duplicate  = FIXTURE_FILES.readme.replace(
                  '\nTrailing prose.',
                  '\n| - | [@neo-unit-probe](https://github.com/neo-unit-probe) | legacy | Machine Account |\n| - | [@neo-unit-probe](https://github.com/neo-unit-probe) | duplicate | Machine Account |\n\nTrailing prose.'
              );

        fs.writeFileSync(path.join(root, SURFACE_PATHS.readme), duplicate, 'utf8');

        const result = runFreshCli(root, [...onboardingArgs, '--write']);

        expect(result.status).toBe(1);
        expect(result.stderr).toContain('refusing a duplicate or ambiguous rewrite');
        expect(fs.readFileSync(path.join(root, SURFACE_PATHS.identityRoots), 'utf8')).toBe(beforeRoot);
    });

    test('rotation changes public/stat mirrors only and preserves the July-4 seed snapshot', () => {
        const root            = createFixtureRepo(ROTATION_FILES),
              identityBefore  = fs.readFileSync(path.join(root, SURFACE_PATHS.identityRoots), 'utf8'),
              migrationBefore = fs.readFileSync(path.join(root, SURFACE_PATHS.migration), 'utf8'),
              specBefore      = fs.readFileSync(path.join(root, SURFACE_PATHS.spec), 'utf8'),
              args            = ['--mode', 'rotation', '--handle', '@neo-gpt', '--family', 'gpt', '--designation', 'GPT-5.6 Sol', '--write'],
              result          = runFreshCli(root, args);

        expect(result.status).toBe(0);
        expect((result.stdout.match(/\[WROTE\]/g) || [])).toHaveLength(2);
        expect(fs.readFileSync(path.join(root, SURFACE_PATHS.identityRoots), 'utf8')).toBe(identityBefore);
        expect(fs.readFileSync(path.join(root, SURFACE_PATHS.migration), 'utf8')).toBe(migrationBefore);
        expect(fs.readFileSync(path.join(root, SURFACE_PATHS.spec), 'utf8')).toBe(specBefore);
        expect(fs.readFileSync(path.join(root, SURFACE_PATHS.readme), 'utf8')).toContain('OpenAI GPT-5.6 Sol / Codex');
        expect(fs.readFileSync(path.join(root, SURFACE_PATHS.modelStats), 'utf8')).toContain('| `name` | GPT-5.6 Sol |');
    });

    test('strict GitHub-login syntax fails in the real CLI process', () => {
        const root   = createFixtureRepo(),
              result = runFreshCli(root, [...onboardingArgs, '--github-username', '@bad--login']);

        expect(result.status).toBe(1);
        expect(result.stderr).toContain('no consecutive hyphens');
    });
});
