import {test, expect} from '@playwright/test';

import {checkEngineCoherence, parseModelStats} from '../../../../../../ai/scripts/lint/lint-identity-engine-coherence.mjs';

/**
 * The three hand-maintained places this lint compares. Fixtures are minimal on purpose: the guard's
 * value is that a DISAGREEMENT fires and a declared ABSENCE does not, so each test moves exactly one
 * of those two dials.
 */
const MODEL_STATS = `
### §neo_one

| Field | Value |
|---|---|
| \`id\` / \`githubLogin\` | \`@neo-one\` |
| \`name\` | Claude Opus 5 (Social Name: **One**) |
| \`releaseDate\` | 2026-07-24 |

### §neo_rotating

| Field | Value |
|---|---|
| \`id\` / \`githubLogin\` | \`@neo-rotating\` |
| \`name\` | Claude Fable 5 active / Claude Opus 5 on the Opus half |
`;

const identity = (id, description, extra = {}) => ({
    id,
    type      : 'AgentIdentity',
    description,
    properties: {accountType: 'agent', participationStatus: 'active', description, ...extra}
});

const run = (identities, engineTags = {}) =>
    checkEngineCoherence({identities, engineTags, modelStats: MODEL_STATS});

test.describe('lint-identity-engine-coherence — parseModelStats', () => {
    test('keys sections by the handle in their own id row, not by a hardcoded anchor map', () => {
        const sections = parseModelStats(MODEL_STATS);

        expect(Object.keys(sections).sort()).toEqual(['neo-one', 'neo-rotating']);
        expect(sections['neo-one'].section).toBe('§neo_one');
        expect(sections['neo-one'].releaseDate).toBe('2026-07-24');
        expect(sections['neo-one'].name).toContain('Claude Opus 5');
        // A section without a releaseDate row parses cleanly rather than throwing — absence is data.
        expect(sections['neo-rotating'].releaseDate).toBeNull()
    });
});

test.describe('lint-identity-engine-coherence — agreement passes', () => {
    test('all three places agreeing is clean, and the resident is counted as checked', () => {
        const {violations, checked} = run(
            [identity('@neo-one', 'Anthropic Claude Opus 5 Agent Identity', {releaseDate: '2026-07-24'})],
            {'neo-one': 'opus-5'}
        );

        expect(violations).toEqual([]);
        expect(checked).toBe(1)
    });

    test('non-active and non-agent entries are skipped entirely', () => {
        const benched = identity('@neo-one', 'Anthropic Claude Opus 4.8 Agent Identity', {releaseDate: '2026-01-01'});

        benched.properties.participationStatus = 'operator_benched';

        // Same entry would be a releaseDate AND description violation if it were active.
        expect(run([benched], {'neo-one': 'fable-5'})).toEqual({violations: [], checked: 0})
    });

    test('a resident with no ModelStats section is not flagged — roster completeness is another lint', () => {
        expect(run([identity('@neo-absent', 'Anthropic Claude Opus 5 Agent Identity')])).toEqual({violations: [], checked: 0})
    });
});

test.describe('lint-identity-engine-coherence — the RED cases (each place, one at a time)', () => {
    test('registry releaseDate disagreeing with the ModelStats row fires', () => {
        const {violations} = run(
            [identity('@neo-one', 'Anthropic Claude Opus 5 Agent Identity', {releaseDate: '2026-05-28'})],
            {'neo-one': 'opus-5'}
        );

        expect(violations).toHaveLength(1);
        expect(violations[0].kind).toBe('releaseDate');
        expect(violations[0].detail).toContain('2026-05-28');
        expect(violations[0].detail).toContain('2026-07-24');
        // The message must name both files, or a reader cannot tell which one is wrong.
        expect(violations[0].sources).toEqual(['ai/graph/identityRoots.mjs', 'learn/agentos/ModelStats.md:2'])
    });

    test('a stale version in the registry description fires against the row name', () => {
        const {violations} = run(
            [identity('@neo-one', 'Anthropic Claude Opus 4.8 Agent Identity', {releaseDate: '2026-07-24'})],
            {'neo-one': 'opus-5'}
        );

        expect(violations).toHaveLength(1);
        expect(violations[0].kind).toBe('description');
        expect(violations[0].detail).toContain('4.8')
    });

    test('a stale cockpit engine tag fires against the row name — the exact drift that shipped', () => {
        const {violations} = run(
            [identity('@neo-one', 'Anthropic Claude Opus 5 Agent Identity', {releaseDate: '2026-07-24'})],
            {'neo-one': 'opus-4.8'}
        );

        expect(violations).toHaveLength(1);
        expect(violations[0].kind).toBe('engineTag');
        expect(violations[0].detail).toContain('opus-4.8');
        expect(violations[0].sources[0]).toBe('ai/scripts/fleet/deriveFleetRoster.mjs')
    });

    test('all three disagreeing report separately rather than collapsing into one', () => {
        const {violations} = run(
            [identity('@neo-one', 'Anthropic Claude Opus 4.8 Agent Identity', {releaseDate: '2026-05-28'})],
            {'neo-one': 'fable-5'}
        );

        expect(violations.map(v => v.kind).sort()).toEqual(['description', 'engineTag', 'releaseDate'])
    });
});

test.describe('lint-identity-engine-coherence — declared absence is NOT drift', () => {
    // The load-bearing case. A seat on an operator-managed weekly engine rotation has no true flat
    // value, so its tag is deliberately null. If any of these fired, the lint would pressure an
    // author into re-adding a literal that is false half the week — manufacturing the exact fiction
    // the guard exists to catch.
    test('a rotating seat with NO engine tag and a rotation-explicit description passes', () => {
        const {violations, checked} = run(
            [identity('@neo-rotating', 'Anthropic Claude Agent Identity; weekly Claude Fable 5 / Claude Opus 5 rotation')],
            {}
        );

        expect(violations).toEqual([]);
        expect(checked).toBe(1)
    });

    test('an absent tag is treated differently from a DISAGREEING tag', () => {
        const rotating = identity('@neo-rotating', 'Anthropic Claude Agent Identity; weekly rotation');

        expect(run([rotating], {}).violations).toEqual([]);
        expect(run([rotating], {'neo-rotating': 'kimi-k3'}).violations).toHaveLength(1)
    });

    test('a registry description naming no version at all is silent, not wrong', () => {
        expect(run([identity('@neo-rotating', 'Anthropic Claude Agent Identity with version-free handle')], {}).violations).toEqual([])
    });

    test('a missing releaseDate on either side is not a disagreement', () => {
        // Row has no releaseDate; registry does. Nothing to compare, so nothing to report.
        expect(run(
            [identity('@neo-rotating', 'Anthropic Claude Agent Identity', {releaseDate: '2026-07-24'})],
            {}
        ).violations).toEqual([])
    });

    test('a partially-matching description does not fire — only a wholly absent version does', () => {
        // "Fable 5 / Opus 5" against a row naming both: every token is present.
        expect(run(
            [identity('@neo-rotating', 'weekly Claude Fable 5 / Claude Opus 5 rotation')],
            {'neo-rotating': 'fable-5'}
        ).violations).toEqual([])
    });
});

test.describe('lint-identity-engine-coherence — the live repo', () => {
    test('the committed registry, ModelStats, and engine-tag map agree', () => {
        const {violations, checked} = checkEngineCoherence();

        expect(violations).toEqual([]);
        expect(checked).toBeGreaterThan(0)
    });
});
