import {test, expect} from '@playwright/test';
import {spawnSync}    from 'node:child_process';
import path           from 'node:path';
import {
    CURATED_HARNESS_TYPES,
    buildOnboardingIntent,
    normalizeToken,
    parseOnboardArgs,
    planOnboarding,
    renderPlan
} from '../../../../../../ai/scripts/fleet/onboardPeer.mjs';

const BASE_OPTIONS = Object.freeze({
    residentId    : 'neo-gpt-2',
    githubUsername: 'neo-gpt-2',
    harnessType   : 'codex'
});

/**
 * @summary Builds a valid intent from the shared fixture options.
 * @param {Object} [overrides] Option overrides.
 * @returns {Object} The frozen intent.
 */
function buildIntent(overrides = {}) {
    const built = buildOnboardingIntent({...BASE_OPTIONS, ...overrides});

    expect(built.valid).toBe(true);

    return built.intent;
}

test.describe('onboardPeer — intent construction (pure half)', () => {

    test('the resident handle is the Fleet agent id; repo coordinates come as a pair or not at all', () => {
        const intent = buildIntent({cloneUrl: 'https://github.com/x/y.git', repoSlug: 'x/y'});

        expect(intent.agentId).toBe('neo-gpt-2');
        expect(intent.repo).toEqual({cloneUrl: 'https://github.com/x/y.git', repoSlug: 'x/y'});

        expect(buildOnboardingIntent({...BASE_OPTIONS, cloneUrl: 'https://github.com/x/y.git'}).valid).toBe(false);
        expect(buildOnboardingIntent({...BASE_OPTIONS, repoSlug: 'x/y'}).valid).toBe(false);
    });

    test('only curated harness families are accepted, with a named refusal', () => {
        expect(CURATED_HARNESS_TYPES).toEqual(['claude-code', 'codex']);

        const built = buildOnboardingIntent({...BASE_OPTIONS, harnessType: 'gemini-cli'});

        expect(built.valid).toBe(false);
        expect(built.reason).toContain('claude-code');
    });

    test('malformed identifiers fail loud, and the @-prefix normalizes off', () => {
        expect(normalizeToken('@neo-gpt-2', '--resident-id')).toEqual({valid: true, reason: null, token: 'neo-gpt-2'});
        expect(normalizeToken('Bad Handle', '--resident-id').valid).toBe(false);
        expect(buildOnboardingIntent({}).valid).toBe(false);
    });

    test('there is NO engine and NO name input surface — the flags do not exist', () => {
        expect(parseOnboardArgs(['--model', 'gpt-6']).valid).toBe(false);
        expect(parseOnboardArgs(['--social-name', 'Minerva']).valid).toBe(false);
        expect(parseOnboardArgs(['--resident-id']).valid).toBe(false);   // missing value refuses too
    });
});

test.describe('onboardPeer — the two-phase planner', () => {

    test('PHASE A: an un-rostered resident ends at the roster ceremony PRINT + the operator gate', () => {
        const intent = buildIntent({cloneUrl: 'https://github.com/x/y.git', repoSlug: 'x/y'}),
              plan   = planOnboarding({intent, facts: {agentDefined: false, repoConfigured: false, rosterHasResident: false}});

        expect(plan.phase).toBe('A');
        expect(plan.segments.map(segment => [segment.key, segment.action])).toEqual([
            ['define', 'CREATE'],
            ['repo',   'CREATE'],
            ['roster', 'PRINT']
        ]);
        expect(plan.segments[2].detail).toContain('generateRosterOnboarding.mjs');
        expect(plan.gateMessage).toContain('membership ceremony');
        expect(plan.gateMessage).toContain('restart the Memory Core');
        // Phase A NEVER contains a launch segment — launching an un-rostered resident is refused by omission
        expect(plan.segments.some(segment => segment.key === 'launch')).toBe(false);
    });

    test('PHASE A re-run: existing definition + repo report EXISTS honestly', () => {
        const intent = buildIntent({cloneUrl: 'https://github.com/x/y.git', repoSlug: 'x/y'}),
              plan   = planOnboarding({intent, facts: {agentDefined: true, repoConfigured: true, rosterHasResident: false}});

        expect(plan.segments.map(segment => segment.action)).toEqual(['EXISTS', 'EXISTS', 'PRINT']);
    });

    test('PHASE B REFUSE: roster merged but the graph node is NOT seeded — the exact operator step is named', () => {
        const intent = buildIntent(),
              plan   = planOnboarding({intent, facts: {agentDefined: true, rosterHasResident: true, graphNodeSeeded: false}});

        expect(plan.phase).toBe('B');

        const preflight = plan.segments.find(segment => segment.key === 'preflight');

        expect(preflight.action).toBe('REFUSE');
        expect(preflight.detail).toContain('restart the Memory Core server');
        expect(plan.segments.some(segment => segment.key === 'launch')).toBe(false);
    });

    test('PHASE B happy path: seeded node → launch CREATE + auth PRINT; unverifiable graph degrades to WARN, never a false OK', () => {
        const intent = buildIntent(),
              seeded = planOnboarding({intent, facts: {agentDefined: true, rosterHasResident: true, graphNodeSeeded: true, running: false}});

        expect(seeded.phase).toBe('B');
        expect(seeded.segments.find(segment => segment.key === 'preflight').action).toBe('OK');
        expect(seeded.segments.find(segment => segment.key === 'launch').action).toBe('CREATE');
        expect(seeded.segments.find(segment => segment.key === 'auth').action).toBe('PRINT');

        const unverifiable = planOnboarding({intent, facts: {agentDefined: true, rosterHasResident: true, graphNodeSeeded: null, running: false}});

        expect(unverifiable.segments.find(segment => segment.key === 'preflight').action).toBe('WARN');
    });

    test('PHASE B re-run on a running agent reports launch EXISTS (start short-circuits at the owner)', () => {
        const intent = buildIntent(),
              plan   = planOnboarding({intent, facts: {agentDefined: true, rosterHasResident: true, graphNodeSeeded: true, running: true}});

        expect(plan.segments.find(segment => segment.key === 'launch').action).toBe('EXISTS');
    });

    test('renderPlan derives from the same plan the commit path executes — phase + gate rendered verbatim', () => {
        const intent   = buildIntent(),
              plan     = planOnboarding({intent, facts: {rosterHasResident: false}}),
              rendered = renderPlan(intent, plan).join('\n');

        expect(rendered).toContain('phase A');
        expect(rendered).toContain('OPERATOR GATE');
        expect(rendered).toContain('[PRINT] roster');
    });
});

test.describe('onboardPeer — fresh-process bootstrap contract', () => {
    test('--help exits 0 with usage output in a BARE process — no Neo bootstrap, no services touched', () => {
        const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../../../../..'),
              result   = spawnSync(process.execPath, ['ai/scripts/fleet/onboardPeer.mjs', '--help'], {cwd: repoRoot, encoding: 'utf-8', timeout: 30_000});

        expect(result.status, `--help must exit 0 (stderr: ${result.stderr})`).toBe(0);
        expect(result.stdout).toContain('Usage:');
        expect(result.stdout).toContain('roster ceremony');
    });
});
