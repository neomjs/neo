import {test, expect} from '@playwright/test';
import {
    classifyPath,
    classifyPr,
    parseSquashSubject,
    summarize
} from '../../../../../../ai/scripts/diagnostics/consumerRelevanceCensus.mjs';
import {
    SEED_JUDGMENTS,
    SUBSYSTEMS
} from '../../../../../../ai/scripts/diagnostics/consumerRelevanceMap.mjs';

/**
 * @summary Contract suite for the consumer-relevance census — the premise falsifier (seed
 * judgments reproduce the mapping), the classification rules, and the honesty constraints
 * (unclassified is a first-class bucket; no percentage anywhere).
 *
 * The census classifies by what a PR TOUCHES, never by whether it was NEEDED — necessity is
 * counterfactual judgment and permanently out of scope. These tests pin the mechanical layer of
 * that boundary: path rules, majority-bucket resolution, and the seed taxonomy the stakeholder
 * walk-through validated at the ticket's creation.
 */
test.describe('consumer-relevance census', () => {
    test('the six seed judgments hold in the mapping (the premise falsifier)', () => {
        for (const [subsystem, expected] of Object.entries(SEED_JUDGMENTS)) {
            expect(SUBSYSTEMS[subsystem], `subsystem ${subsystem} must exist`).toBeTruthy();
            expect(SUBSYSTEMS[subsystem].bucket).toBe(expected.bucket);

            if (expected.temporal) {
                expect(SUBSYSTEMS[subsystem].temporal).toBe(expected.temporal)
            }
        }
    });

    test('parseSquashSubject accepts the merge form and rejects everything else', () => {
        expect(parseSquashSubject('feat(ai): x (#15879) (#15900)'))
            .toEqual({ticket: '15879', pr: '15900'});
        expect(parseSquashSubject('fix: y (#12) (#34) trailing')).toBeNull();
        expect(parseSquashSubject('no refs at all')).toBeNull();
        expect(parseSquashSubject('Merge branch dev')).toBeNull()
    });

    test('classifyPath: longest prefix wins; no rule is an honest null', () => {
        expect(classifyPath('src/data/Store.mjs')).toBe('app-engine');
        expect(classifyPath('ai/mcp/server/memory-core/config.template.mjs')).toBe('mcp-runtime');
        expect(classifyPath('ai/mcp/server/gitlab-workflow/mcp-server.mjs')).toBe('team-servers');
        expect(classifyPath('resources/scss/src/apps/agentos/fleet/FleetCockpit.scss')).toBe('fleet-tooling');
        expect(classifyPath('resources/scss/theme-dark/Global.scss')).toBe('app-engine');
        expect(classifyPath('.agent/skills/create-skill/SKILL.md')).toBe('skill-machinery');
        expect(classifyPath('.agents/skills/pr-review/SKILL.md')).toBe('skill-machinery');
        expect(classifyPath('AGENTS.md')).toBe('skill-machinery');
        expect(classifyPath('some/random/thing.xyz')).toBeNull()
    });

    test('classifyPr: majority bucket wins, precedence breaks ties, empty is unclassified', () => {
        expect(classifyPr(['src/data/Store.mjs', 'src/grid/Container.mjs', 'test/playwright/unit/x.spec.mjs']).bucket)
            .toBe('consumer-direct');

        // 1v1 tie: consumer-direct outranks consumer-enabling
        expect(classifyPr(['src/data/Store.mjs', 'test/playwright/unit/x.spec.mjs']).bucket)
            .toBe('consumer-direct');

        expect(classifyPr(['docs/guides/x.md', 'learn/agentos/y.md']).bucket)
            .toBe('internal-only');

        expect(classifyPr([]).bucket).toBe('unclassified');
        expect(classifyPr(['some/random/thing.xyz']).bucket).toBe('unclassified')
    });

    test('temporal tag rides the bucket only for future-direct subsystems', () => {
        const fleet  = classifyPr(['apps/agentos/view/FleetCockpit.mjs']),
              engine = classifyPr(['src/data/Store.mjs']);

        expect(fleet.bucket).toBe('consumer-direct');
        expect(fleet.temporal).toBe('future-direct');
        expect(engine.temporal).toBe('now')
    });

    test('summarize: totals and monthly trend carry the temporal tag in the key', () => {
        const records = [
            {bucket: 'consumer-direct', temporal: 'now', date: '2026-07-01T00:00:00Z', pr: '1', subject: 'a'},
            {bucket: 'consumer-direct', temporal: 'future-direct', date: '2026-07-02T00:00:00Z', pr: '2', subject: 'b'},
            {bucket: 'unclassified', temporal: null, date: '2026-06-03T00:00:00Z', pr: '3', subject: 'c'}
        ];

        const {totals, monthly, unclassified} = summarize(records);

        expect(totals['consumer-direct:now']).toBe(1);
        expect(totals['consumer-direct:future-direct']).toBe(1);
        expect(totals['unclassified']).toBe(1);
        expect(monthly['2026-07']['consumer-direct:future-direct']).toBe(1);
        expect(monthly['2026-06']['unclassified']).toBe(1);
        expect(unclassified).toHaveLength(1);
        expect(unclassified[0].pr).toBe('3')
    });
});
