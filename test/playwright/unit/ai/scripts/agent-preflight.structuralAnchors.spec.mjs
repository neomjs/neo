import {readFileSync} from 'node:fs';
import {expect, test} from '@playwright/test';
import {
    buildStructuralAnchorMissGuidance,
    INVISIBLE_PR_BODY_ANCHORS,
    validatePrBody,
    VISIBLE_PR_BODY_ANCHORS
}                     from '../../../../../ai/scripts/agent-preflight.mjs';

/**
 * Controls for the structural-anchor layer's silent-miss guidance.
 *
 * The layer's silence is deliberate policy: naming a missing anchor lets an author paste it
 * instead of reading the template. These controls pin the three properties that keep that
 * policy honest — the message states the silence is deliberate, points at the artifact that
 * carries the full list, and leaks no anchor literal — plus the two guards against silent
 * collapse: the visible layer keeps enumerating, and a fully anchored body emits nothing.
 *
 * The route-following control encodes the review lesson from this guidance's first draft:
 * a control over a POINTER must assert something about the TARGET, not the pointer text —
 * `output contains '<path>'` stays green whether or not that file has anything to do with
 * anchors, so the control reads the routed-to artifact and checks the anchors are there.
 */

const allAnchorLiterals = [...VISIBLE_PR_BODY_ANCHORS, ...INVISIBLE_PR_BODY_ANCHORS];
const AGENT_BODY_TEMPLATE_PATH = '../../../../../.agents/skills/pull-request/references/pull-request-workflow.md';

const validBody = [
    'Resolves #100',
    '',
    'Authored by Eos (ox-alpha, opencode). Session test.',
    '',
    'Evidence: L2 local unit coverage.',
    '',
    '## AC Evidence',
    '| AC-1 | unit spec: this file |',
    '',
    '## Deltas',
    '- Delivered as requested.',
    '',
    '## Test Evidence',
    '- npm run test-unit -- test/playwright/unit/ai/scripts/agent-preflight.structuralAnchors.spec.mjs',
    '',
    '## Post-Merge Validation',
    '- None.'
].join('\n');

test.describe('buildStructuralAnchorMissGuidance — silent-layer contract', () => {
    test('states the silence is deliberate and points at the artifact carrying the list', () => {
        const out = buildStructuralAnchorMissGuidance().join('\n');

        expect(out).toMatch(/silently and deliberately/i);
        // The agent-facing body template (workflow §9), never the external-contributor
        // `.github/PULL_REQUEST_TEMPLATE.md` — that file carries 0/6 anchors and §9:278
        // forbids copying it into agent PRs.
        expect(out).toContain('pull-request-workflow.md');
        expect(out).not.toContain('.github/PULL_REQUEST_TEMPLATE.md');
    });

    test('the routed-to artifact actually carries the anchor list (route-following control)', () => {
        const contents = readFileSync(new URL(AGENT_BODY_TEMPLATE_PATH, import.meta.url), 'utf8');

        for (const literal of allAnchorLiterals) {
            expect(contents.includes(literal), `"${literal}" missing from pull-request-workflow.md`).toBe(true);
        }
    });

    test('never names, counts, or hints at which anchors are missing — zero literal leaks', () => {
        const out = buildStructuralAnchorMissGuidance().join('\n');

        // Self-verifying control: an empty literal array would make the filter below pass vacuously.
        expect(allAnchorLiterals.length).toBe(6);
        expect(allAnchorLiterals.filter(literal => out.includes(literal))).toEqual([]);
    });
});

test.describe('validatePrBody — collapse guards around the silent layer', () => {
    test('the computed visible layer still enumerates its misses (collapse guard; reporter enumeration asserted in agent-preflight.spec)', () => {
        const result = validatePrBody(validBody.replace(
            'Evidence: L2 local unit coverage.',
            'no evidence marker here'
        ));

        expect(result.missingVisible).toContain('Evidence:');
    });

    test('a fully anchored body produces no misses in either layer (negative control)', () => {
        const result = validatePrBody(validBody);

        expect(result.missingVisible).toEqual([]);
        expect(result.missingInvisible).toEqual([]);
    });

    test('a structural miss lands in the silent layer only — the finding is withheld from output shaping', () => {
        const result = validatePrBody(validBody.replace('## Deltas\n- Delivered as requested.', '## Changed\n- Delivered as requested.'));

        expect(result.missingInvisible).toContain('## Deltas');
        expect(result.missingVisible).toEqual([]);
        // The reporter renders buildStructuralAnchorMissGuidance() for exactly this branch;
        // the guidance itself stays literal-free (asserted above), so the printed output
        // names nothing even though the internal finding array must.
    });
});
