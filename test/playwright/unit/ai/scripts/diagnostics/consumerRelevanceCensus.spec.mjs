import {test, expect} from '@playwright/test';
import {
    classifyPath,
    classifyPr,
    parseSquashSubject,
    REPORT_WINDOW,
    resolveWindow,
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
        expect(classifyPath('resources/scss/src/apps/agentos/fleet/cockpit/Container.scss')).toBe('fleet-tooling');
        expect(classifyPath('resources/scss/theme-dark/Global.scss')).toBe('app-engine');
        expect(classifyPath('.agent/skills/create-skill/SKILL.md')).toBe('skill-machinery');
        expect(classifyPath('.agents/skills/pr-review/SKILL.md')).toBe('skill-machinery');
        expect(classifyPath('AGENTS.md')).toBe('skill-machinery');
        expect(classifyPath('some/random/thing.xyz')).toBeNull()
    });

    test('classifyPr: majority bucket wins, precedence breaks ties, unclassified names its cause', () => {
        expect(classifyPr(['src/data/Store.mjs', 'src/grid/Container.mjs', 'test/playwright/unit/x.spec.mjs']).bucket)
            .toBe('consumer-direct');

        // 1v1 tie: consumer-direct outranks consumer-enabling
        expect(classifyPr(['src/data/Store.mjs', 'test/playwright/unit/x.spec.mjs']).bucket)
            .toBe('consumer-direct');

        expect(classifyPr(['docs/guides/x.md', 'learn/agentos/y.md']).bucket)
            .toBe('internal-only');

        // The unclassified family names its cause: a zero-file merge is an honest empty row,
        // files matching no rule are a mapping gap — the legend can never mislabel a member.
        expect(classifyPr([]).bucket).toBe('unclassified:no-files');
        expect(classifyPr(['some/random/thing.xyz']).bucket).toBe('unclassified:no-rule')
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

    test('resolveWindow: no flags pins to REPORT_WINDOW, never the clock (the re-run invariant)', () => {
        // A bare invocation must reproduce the committed artifact's window — a clock default
        // would make the window a hidden moving input and void the re-run claim.
        expect(resolveWindow([])).toEqual(REPORT_WINDOW);
        expect(resolveWindow(['--json', 'x.json'])).toEqual(REPORT_WINDOW);

        // Explicit flags pin their end only; the other end stays on the artifact window.
        expect(resolveWindow(['--until', '2026-08-01']))
            .toEqual({since: REPORT_WINDOW.since, until: '2026-08-01'});
        expect(resolveWindow(['--since', '2026-01-01', '--until', '2026-02-01']))
            .toEqual({since: '2026-01-01', until: '2026-02-01'})
    });

    test('re-run determinism: the same corpus + mapping classifies byte-identically twice', () => {
        const records = [
            {date: '2026-07-01T00:00:00Z', pr: '1', subject: 'a', files: ['src/data/Store.mjs']},
            {date: '2026-07-02T00:00:00Z', pr: '2', subject: 'b', files: ['apps/agentos/view/FleetCockpit.mjs', 'src/grid/Container.mjs']},
            {date: '2026-06-03T00:00:00Z', pr: '3', subject: 'c', files: ['some/random/thing.xyz']}
        ];

        const run = () => summarize(records.map(record => ({...record, ...classifyPr(record.files)})));

        expect(JSON.stringify(run())).toBe(JSON.stringify(run()))
    });
});
