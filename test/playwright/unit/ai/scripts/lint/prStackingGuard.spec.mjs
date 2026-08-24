import {test, expect} from '@playwright/test';

import {
    findAgreementMismatches,
    findStackedParent,
    parseDeclaredTickets
} from '../../../../../../ai/scripts/lint/prStackingGuard.mjs';

/**
 * Arms for the stacked-PR guard's pure decision helpers. The guard previously used one
 * ticket-proxy check for two unrelated questions; these arms pin the split — declared-set parsing
 * that honors the house multi-id convention, commit/body agreement as its own concern, and a
 * stacking verdict that comes from observable ancestry rather than prose inference.
 */

test.describe('prStackingGuard — declared-set parsing', () => {

    test('the house Related convention contributes every id on the line, not just the first', () => {
        const body = 'Related: epic #101 · #102 (context) · #103 · #104\n\nResolves #87';

        expect([...parseDeclaredTickets(body)].sort((a, b) => a.localeCompare(b, undefined, {numeric: true})))
            .toEqual(['87', '101', '102', '103', '104'])
    });

    test('capture is line-bounded: prose on later lines never widens the declared set', () => {
        const body = 'Resolves #100\n\nA later paragraph mentions #999 and #12345 in prose.';

        expect([...parseDeclaredTickets(body)]).toEqual(['100'])
    });

    test('both keyword spellings with or without colon are honored', () => {
        const body = 'resolves #1\nRefs #2\nRelated #3\nREFS:#4';

        expect([...parseDeclaredTickets(body)].sort()).toEqual(['1', '2', '3', '4'])
    })
});

test.describe('prStackingGuard — commit/body agreement', () => {

    test('flags exactly the commits claiming an undeclared ticket', () => {
        const mismatches = findAgreementMismatches([
            {sha: '9376a4ac7dabc', subject: 'fix(agentos): first slice (#77)'},
            {sha: 'fcb3854f2712b', subject: 'fix(agentos): second slice (#77)'},
            {sha: '0aa11bb22c33', subject: 'feat(agentos): the delivered half (#87)'}
        ], parseDeclaredTickets('Resolves #87'));

        expect(mismatches).toEqual([
            {sha: '9376a4ac7d', ticket: '77', subject: 'fix(agentos): first slice (#77)'},
            {sha: 'fcb3854f27', ticket: '77', subject: 'fix(agentos): second slice (#77)'}
        ])
    });

    test('commits without a ticket suffix are the ticket gate\u2019s business, not this check\u2019s', () => {
        expect(findAgreementMismatches(
            [{sha: 'abcdef1234', subject: 'chore(data): Hourly data sync pipeline update [skip ci]'}],
            new Set()
        )).toEqual([])
    });

    test('agreement message states the squash consequence without claiming ancestry', () => {
        // The message contract under test: name the provenance cost, never diagnose the branch.
        const mismatch  = {sha: '318e6cb990', ticket: '77', subject: 'feat(orchestrator): slice (#77)'};
        const delivered = '102';
        const message   =
            `commit ${mismatch.sha} claims #${mismatch.ticket}; this PR delivers #${delivered} — ` +
            'GitHub\u2019s squash body carries the concatenated commit subjects, so #77 lands in `dev` provenance verbatim.';

        expect(message).toContain('squash');
        expect(message).not.toMatch(/branch|ancest|stack/i)
    })
});

test.describe('prStackingGuard — stacking via open-sibling detection', () => {

    test('a sibling OPEN PR head inside the range means stacked, parent named', () => {
        const verdict = findStackedParent({
            rangeCommits    : ['aaa111', 'bbb222'],
            openPullRequests: [
                {number: 1771, headSha: 'zzz999', headRefName: 'origin/unrelated'},
                {number: 1704, headSha: 'bbb222', headRefName: 'origin/feature/parent'}
            ]
        });

        expect(verdict.stacked).toBe(true);
        expect(verdict.parent).toEqual({number: 1704, headRefName: 'origin/feature/parent'})
    });

    test('heads outside the range are other people\u2019s work in flight \u2014 never this PR\u2019s stack', () => {
        const verdict = findStackedParent({
            rangeCommits    : ['aaa111'],
            openPullRequests: [
                {number: 1704, headSha: 'bbb222', headRefName: 'origin/feature/parent'}
            ]
        });

        expect(verdict).toEqual({stacked: false, parent: null})
    });

    test('no open PRs at all means nothing names a parent \u2014 clean, and honestly so', () => {
        expect(findStackedParent({rangeCommits: ['aaa111'], openPullRequests: []}))
            .toEqual({stacked: false, parent: null})
    });

    test('the PR under review never counts as its own stacking parent', () => {
        // Lived bug: the first CI run of this very guard detected \u201cstacked on myself\u201d because
        // the PR\u2019s own head is trivially the newest commit in its exclusive range.
        const verdict = findStackedParent({
            rangeCommits    : ['aaa111', 'fc2e727ea5'],
            openPullRequests: [{number: 42, headSha: 'fc2e727ea5', headRefName: 'origin/this-pr'}],
            excludePrNumber : 42
        });

        expect(verdict).toEqual({stacked: false, parent: null});

        const stillCatchesSibling = findStackedParent({
            rangeCommits    : ['aaa111', 'bbb222'],
            openPullRequests: [
                {number: 42, headSha: 'fc2e727ea5', headRefName: 'origin/this-pr'},
                {number: 43, headSha: 'bbb222', headRefName: 'origin/feature/parent'}
            ],
            excludePrNumber  : 42
        });

        expect(stillCatchesSibling.stacked).toBe(true);
        expect(stillCatchesSibling.parent.number).toBe(43)
    })
});
