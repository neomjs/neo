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

import {test, expect}  from '@playwright/test';
import fs              from 'node:fs';
import path            from 'node:path';
import {fileURLToPath} from 'node:url';
import Neo             from '../../../../../../src/Neo.mjs';
import * as core       from '../../../../../../src/core/_export.mjs';
import {
    ENGINE_CLASS_KEYS,
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
    planSpecSurface,
    renderModelStatsSection,
    renderOnboardingReport,
    renderReadmeRow,
    renderRosterEntry,
    renderSpecPin
} from '../../../../../../ai/scripts/setup/generateRosterOnboarding.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../../..');

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

const FIXTURE_FILES = Object.freeze({
    identityRoots: ROSTER_FIXTURE,
    modelStats   : MODEL_STATS_FIXTURE,
    readme       : README_FIXTURE,
    spec         : SPEC_FIXTURE
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
        expect(entry).toContain(`githubLogin     : '@neo-unit-probe',`);
        expect(entry).toContain(`displayName     : 'Neo Unit Probe',`);
        expect(entry).toContain(`modelFamily     : 'claude',`);
        expect(entry).toContain('trustTier       : TRUST_TIERS.PEER_TRUSTED,');
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

test.describe('generateRosterOnboarding — surface planning (anchors + idempotency)', () => {

    test('roster surface: inserts immediately before the broadcast sentinel; a second run reports EXISTS', () => {
        const plan  = buildPlan();
        const first = planRosterSurface(ROSTER_FIXTURE, plan);

        expect(first.status).toBe('insert');
        expect(first.updated).toContain(`id         : '@neo-unit-probe',`);
        expect(first.updated.indexOf(`'@neo-unit-probe'`)).toBeGreaterThan(first.updated.indexOf(`'@neo-existing'`));
        expect(first.updated.indexOf(`'@neo-unit-probe'`)).toBeLessThan(first.updated.indexOf(`'AGENT:*'`));

        const second = planRosterSurface(first.updated, plan);

        expect(second.status).toBe('exists');
        expect(second.updated).toBeNull();
    });

    test('README surface: appends after the last roster-table row; a second run reports EXISTS', () => {
        const plan  = buildPlan();
        const first = planReadmeSurface(README_FIXTURE, plan);

        expect(first.status).toBe('insert');

        const lines  = first.updated.split('\n'),
              rowIdx = lines.indexOf(renderReadmeRow(plan));

        expect(rowIdx).toBeGreaterThan(-1);
        expect(lines[rowIdx - 1].startsWith('| Euclid |')).toBe(true);
        expect(lines[rowIdx + 1]).toBe('');

        const second = planReadmeSurface(first.updated, plan);

        expect(second.status).toBe('exists');
        expect(second.updated).toBeNull();
    });

    test('ModelStats surface: inserts inside the pending section before its divider; a second run reports EXISTS', () => {
        const plan  = buildPlan();
        const first = planModelStatsSurface(MODEL_STATS_FIXTURE, plan);

        expect(first.status).toBe('insert');

        const sectionIdx = first.updated.indexOf('### §neo_unit_probe');

        expect(sectionIdx).toBeGreaterThan(first.updated.indexOf('## §pending_swarm_identities'));
        expect(sectionIdx).toBeLessThan(first.updated.indexOf('## §mlx_local_operational'));

        const second = planModelStatsSurface(first.updated, plan);

        expect(second.status).toBe('exists');
        expect(second.updated).toBeNull();
    });

    test('spec surface: appends the pin at the end; a second run reports EXISTS', () => {
        const plan  = buildPlan();
        const first = planSpecSurface(SPEC_FIXTURE, plan);

        expect(first.status).toBe('insert');
        expect(first.updated.trimEnd().endsWith('});')).toBe(true);
        expect(first.updated.indexOf('@neo-unit-probe roster pin')).toBeGreaterThan(first.updated.indexOf(`node.id === '@neo-existing'`));

        const second = planSpecSurface(first.updated, plan);

        expect(second.status).toBe('exists');
        expect(second.updated).toBeNull();
    });

    test('a ModelStats anchor prefix-collision does not false-report EXISTS (§neo_x vs §neo_x_sibling)', () => {
        const sibling = MODEL_STATS_FIXTURE.replace('### §neo_gpt', '### §neo_unit_probe_sibling');
        const result  = planModelStatsSurface(sibling, buildPlan());

        expect(result.status).toBe('insert');
    });

    test('missing insertion anchors refuse loudly instead of guessing', () => {
        const plan = buildPlan();

        expect(planRosterSurface('export const IDENTITIES = [];\n', plan).status).toBe('invalid');
        expect(planReadmeSurface('# No table here\n', plan).status).toBe('invalid');
        expect(planModelStatsSurface('# No pending heading\n', plan).status).toBe('invalid');
        expect(planSpecSurface('', plan).status).toBe('invalid');
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
        expect(healthy.surfaces.map(surface => surface.status)).toEqual(['insert', 'insert', 'insert', 'insert']);
    });

    test('the dry-run report prints status, anchor, and the exact snippet per surface, plus the advisory notes', () => {
        const plan    = buildPlan();
        const planned = planOnboardingSurfaces(plan, FIXTURE_FILES);
        const report  = renderOnboardingReport(plan, planned).join('\n');

        expect(report).toContain('[INSERT] ai/graph/identityRoots.mjs');
        expect(report).toContain('[INSERT] README.md');
        expect(report).toContain('[INSERT] learn/agentos/ModelStats.md');
        expect(report).toContain('[INSERT] test/playwright/unit/ai/graph/identityRoots.spec.mjs');
        expect(report).toContain('anchor: immediately before the');
        expect(report).toContain('advisory (printed, never written)');

        // EXISTS surfaces report the reason instead of a duplicate snippet
        const readme   = planned.surfaces.find(surface => surface.surface === 'readme');
        const applied  = planOnboardingSurfaces(plan, {...FIXTURE_FILES, readme: readme.updated});
        const rerender = renderOnboardingReport(plan, applied).join('\n');

        expect(rerender).toContain('[EXISTS] README.md');
    });
});

test.describe('generateRosterOnboarding — live-file anchoring (the anchors must match the real shapes)', () => {

    test('a fresh resident plans INSERT on all four REAL surfaces', () => {
        const planned = planOnboardingSurfaces(buildPlan(), readRealFiles());

        expect(planned.valid).toBe(true);
        expect(planned.surfaces.map(surface => surface.status)).toEqual(['insert', 'insert', 'insert', 'insert']);
    });

    test('an existing resident (@neo-fable) reports EXISTS on all four REAL surfaces — no duplicates possible', () => {
        const planned = planOnboardingSurfaces(buildPlan({handle: '@neo-fable'}), readRealFiles());

        expect(planned.valid).toBe(true);
        expect(planned.surfaces.map(surface => surface.status)).toEqual(['exists', 'exists', 'exists', 'exists']);
    });

    test('the applied REAL roster output is valid JavaScript and lands the Layer-1 entry (data-URL import)', async () => {
        const plan   = buildPlan();
        const result = planRosterSurface(readRealFiles().identityRoots, plan);

        expect(result.status).toBe('insert');

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

        expect(designation.valid).toBe(false);

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
