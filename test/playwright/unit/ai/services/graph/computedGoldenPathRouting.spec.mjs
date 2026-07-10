import {setup} from '../../../../setup.mjs';

const appName = 'ComputedGoldenPathRoutingTest';

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

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';

test.describe('computedGoldenPathRouting — the contradiction guard (routing-decision surface, #14588)', () => {
    let findComputedFocusContradiction, isRoutingConflictFocusCandidate;

    const contentNode = id => ({
        node: {
            id,
            type      : 'ISSUE',
            properties: {labels: ['documentation', 'ai'], title: 'release cut: notes + version bump'}
        },
        score: 1, semantic: 1, structural: 0
    });

    const codeNode = id => ({
        node: {
            id,
            type      : 'ISSUE',
            properties: {labels: ['bug', 'ai'], title: 'router collapses to zero routes'}
        },
        score: 1, semantic: 1, structural: 0
    });

    test.beforeAll(async () => {
        const mod = await import('../../../../../../ai/services/graph/computedGoldenPathRouting.mjs');
        findComputedFocusContradiction  = mod.findComputedFocusContradiction;
        isRoutingConflictFocusCandidate = mod.isRoutingConflictFocusCandidate;
    });

    test('a release-version reason does NOT arm the routing guard (the stale-boundary class, #14588 / #14531 sibling)', () => {
        // The 2026-07-04 live reproducer: post-release focus tail carrying the shipped
        // release's reason zeroed every routing pass. Release literals are banned from
        // the conflict set; the candidate stays visibility-only.
        expect(isRoutingConflictFocusCandidate({number: 14475, reasons: ['v13.1', 'fresh-updated']})).toBe(false);

        const result = findComputedFocusContradiction({
            currentFocusCandidates: [{number: 14310, reasons: ['v13.1']}],
            topNodes              : [contentNode('issue-14475')]
        });

        expect(result).toBeNull();
    });

    test('incident and prio-zero reasons still arm the guard', () => {
        expect(isRoutingConflictFocusCandidate({number: 1, reasons: ['incident']})).toBe(true);
        expect(isRoutingConflictFocusCandidate({number: 2, reasons: ['prio-zero']})).toBe(true);
        expect(isRoutingConflictFocusCandidate({number: 3, reasons: ['agent-os', 'fresh-created']})).toBe(false);
    });

    test('under live incident focus, content candidates are blocked while non-content candidates survive (fallback-to-next stays routable)', () => {
        const result = findComputedFocusContradiction({
            currentFocusCandidates: [{number: 100, reasons: ['incident']}],
            topNodes              : [contentNode('issue-200'), codeNode('issue-201')]
        });

        expect(result).not.toBeNull();
        expect([...result.blockedIds]).toEqual(['issue-200']);

        // The synthesizer routes topNodes minus blockedIds — the non-content candidate remains.
        const routed = [contentNode('issue-200'), codeNode('issue-201')]
            .filter(item => !result.blockedIds.has(item.node.id));

        expect(routed).toHaveLength(1);
        expect(routed[0].node.id).toBe('issue-201');
    });

    test('a focus MEMBER is never blocked, even when content-classified', () => {
        const result = findComputedFocusContradiction({
            currentFocusCandidates: [{number: 300, reasons: ['incident']}],
            topNodes              : [contentNode('issue-300')]
        });

        expect(result).toBeNull();
    });
});

test.describe('computedGoldenPathRouting — the fixture-provenance guard (source-set hygiene)', () => {
    let isActionableComputedRecommendation;

    test.beforeAll(async () => {
        ({isActionableComputedRecommendation} = await import('../../../../../../ai/services/graph/computedGoldenPathRouting.mjs'));
    });

    test('a stamped test fixture never enters the scored steering surface', () => {
        expect(isActionableComputedRecommendation({
            id        : 'issue-91003',
            type      : 'ISSUE',
            properties: {state: 'OPEN', title: 'Actionable Issue Fixture', isTestFixture: true}
        })).toBe(false);
    });

    test('the stamp excludes both steerable prefixes — the exact shape that served as the live rank-1 "release lane"', () => {
        expect(isActionableComputedRecommendation({
            id        : 'discussion-open-1783347784287',
            type      : 'DISCUSSION',
            properties: {state: 'OPEN', title: 'Open Discussion Fixture', isTestFixture: true}
        })).toBe(false);

        expect(isActionableComputedRecommendation({
            id        : 'issue-actionable-1783347784287',
            type      : 'ISSUE',
            properties: {state: 'OPEN', title: 'Actionable Issue Fixture', isTestFixture: true}
        })).toBe(false);
    });

    test('realistic unstamped nodes still flow — the guard costs no live lane', () => {
        expect(isActionableComputedRecommendation({
            id        : 'issue-14926',
            type      : 'ISSUE',
            properties: {state: 'OPEN', title: 'Computed GP advisory surfaces fixture seed data', labels: ['ai']}
        })).toBe(true);

        expect(isActionableComputedRecommendation({
            id        : 'discussion-14561',
            type      : 'DISCUSSION',
            properties: {state: 'OPEN', title: 'v13.2 planning'}
        })).toBe(true);
    });
});
