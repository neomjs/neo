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
    let findComputedFocusContradiction, isRoutingConflictFocusCandidate, renderComputedGoldenPathContradictionSection;

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
        findComputedFocusContradiction               = mod.findComputedFocusContradiction;
        isRoutingConflictFocusCandidate              = mod.isRoutingConflictFocusCandidate;
        renderComputedGoldenPathContradictionSection = mod.renderComputedGoldenPathContradictionSection;
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

    test('behavior 1 (#14609) — the no-survivor state renders the focus items as numbered routes, never empty', () => {
        // Every computed candidate is content that contradicts live incident focus → zero survive the guard.
        const contradiction = findComputedFocusContradiction({
            currentFocusCandidates: [{number: 100, reasons: ['incident'], title: 'incident: cockpit auth relaunch'}],
            topNodes              : [contentNode('issue-200'), contentNode('issue-201')]
        });

        expect(contradiction).not.toBeNull();
        expect([...contradiction.blockedIds].sort()).toEqual(['issue-200', 'issue-201']);

        const section = renderComputedGoldenPathContradictionSection({contradiction, stats: {selectedTopNodes: 0}});

        // never empty: the live Current Focus item IS the numbered route. Parser-SHAPED at the render
        // level — the `**issue-N**:` row is followed by the `- *…*` continuation line the route parser
        // requires (the full render→parseGoldenPath round-trip is asserted in AgentOrchestrator.spec).
        expect(section).toMatch(/1\. \*\*issue-100\*\*:[^\n]*\n\s+-\s\*incident: cockpit auth relaunch\*/);
        // the blocked content is filtered-only — it appears in the diagnostic, never as a numbered route
        expect(section).toMatch(/Contradictory computed candidates filtered:.*issue-200/);
        expect(section).not.toMatch(/^\d+\.\s+\*\*issue-20[01]\*\*/m);
    });

    test('behavior 1 (#14609) — a title-less focus candidate still routes, labelled by its reasons', () => {
        const contradiction = findComputedFocusContradiction({
            currentFocusCandidates: [{number: 300, reasons: ['prio-zero']}],
            topNodes              : [contentNode('issue-400')]
        });

        const section = renderComputedGoldenPathContradictionSection({contradiction, stats: {}});

        expect(section).toContain('1. **issue-300**');
        expect(section).toContain('prio-zero');
    });

    test('RA-2 (#15058) — epic + actionable-leaf focus: the leaf routes, the epic umbrella does NOT (single actionability authority)', () => {
        const contradiction = findComputedFocusContradiction({
            currentFocusCandidates: [
                {number: 100, reasons: ['incident'], labels: ['epic', 'bug'], title: 'incident epic umbrella'},
                {number: 101, reasons: ['incident'], labels: ['bug'],         title: 'incident: the actual leaf fix'}
            ],
            topNodes: [contentNode('issue-200')]
        });

        const section = renderComputedGoldenPathContradictionSection({contradiction, stats: {}, renderLimit: 10});

        // the actionable leaf is a numbered route; the epic umbrella is NOT rendered as a machine route
        expect(section).toMatch(/^\d+\.\s+\*\*issue-101\*\*/m);
        expect(section).not.toMatch(/^\d+\.\s+\*\*issue-100\*\*/m);
        // the epic still appears in the diagnostic focus-candidates line (visibility, not route)
        expect(section).toMatch(/Active incident\/release focus candidates:.*#100/);
    });

    test('RA-2 (#15058) — epic-only focus: ZERO numbered routes, surfaced diagnostically (no umbrella-as-route lie)', () => {
        const contradiction = findComputedFocusContradiction({
            currentFocusCandidates: [{number: 100, reasons: ['incident'], labels: ['epic'], title: 'incident epic'}],
            topNodes              : [contentNode('issue-200')]
        });

        const section = renderComputedGoldenPathContradictionSection({contradiction, stats: {}, renderLimit: 10});

        // no numbered machine route at all — an epic umbrella is not immediate work
        expect(section).not.toMatch(/^\d+\.\s+\*\*issue-/m);
        expect(section).toContain('visibility-only');
        // still surfaced diagnostically so the pass is not context-empty
        expect(section).toMatch(/Active incident\/release focus candidates:.*#100/);
    });

    test('RA-2 (#15058) — actionable focus is bounded to the Golden Path render limit (noisy focus set)', () => {
        const currentFocusCandidates = Array.from({length: 8}, (_, i) => ({
            number: 200 + i, reasons: ['incident'], labels: ['bug'], title: `incident leaf ${i}`
        }));

        const contradiction = findComputedFocusContradiction({
            currentFocusCandidates,
            topNodes: [contentNode('issue-900')]
        });

        const section    = renderComputedGoldenPathContradictionSection({contradiction, stats: {}, renderLimit: 3});
        const routeLines = section.split('\n').filter(line => /^\d+\.\s+\*\*issue-/.test(line));

        expect(routeLines).toHaveLength(3);
    });
});

test.describe('computedGoldenPathRouting — the fixture-provenance guard (source-set hygiene)', () => {
    let evaluateDiscussionLiveness;
    let getDiscussionRoutingDisposition;
    let isActionableComputedRecommendation;

    test.beforeAll(async () => {
        ({
            evaluateDiscussionLiveness,
            getDiscussionRoutingDisposition,
            isActionableComputedRecommendation
        } = await import('../../../../../../ai/services/graph/computedGoldenPathRouting.mjs'));
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

    test('Discussion liveness is a distinct post-actionability gate with typed rejection buckets', () => {
        const projection = disposition => {
            if (disposition === 'active') return {
                routingDispositionSchemaVersion: 'discussion-routing-disposition.v1',
                routingDisposition             : 'active',
                routingDispositionReason       : 'explicit-active-marker',
                routingDispositionEvidence     : ['marker:CONVERGING']
            };
            if (disposition === 'terminal') return {
                routingDispositionSchemaVersion: 'discussion-routing-disposition.v1',
                routingDisposition             : 'terminal',
                routingDispositionReason       : 'graduated-to-ticket',
                routingDispositionEvidence     : ['marker:GRADUATED_TO_TICKET']
            };
            if (disposition === 'undetermined') return {
                routingDispositionSchemaVersion: 'discussion-routing-disposition.v1',
                routingDisposition             : 'undetermined',
                routingDispositionReason       : 'no-authoritative-lifecycle-marker',
                routingDispositionEvidence     : []
            };
            return {}
        };
        const discussion = disposition => ({
            id        : 'discussion-15090',
            type      : 'DISCUSSION',
            properties: {state: 'OPEN', title: 'Live lane awareness', ...projection(disposition)}
        });

        expect(isActionableComputedRecommendation(discussion('terminal'))).toBe(true);
        expect(evaluateDiscussionLiveness(discussion('active'), 0)).toEqual({eligible: true, rejectionBucket: []});
        expect(evaluateDiscussionLiveness(discussion('terminal'), 9)).toEqual({eligible: false, rejectionBucket: ['terminal']});
        expect(evaluateDiscussionLiveness(discussion('undetermined'), 0)).toEqual({eligible: false, rejectionBucket: ['undetermined-no-decaying-support']});
        expect(evaluateDiscussionLiveness(discussion('undetermined'), 0.1)).toEqual({eligible: true, rejectionBucket: []});
        expect(evaluateDiscussionLiveness(discussion(), 0.1)).toEqual({eligible: true, rejectionBucket: []});

        for (const unsupported of [-1, NaN, Infinity]) {
            expect(evaluateDiscussionLiveness(discussion(), unsupported).eligible).toBe(false)
        }

        const partialActive = {
            id        : 'discussion-partial-active',
            type      : 'DISCUSSION',
            properties: {routingDisposition: 'active'}
        };
        expect(getDiscussionRoutingDisposition(partialActive)).toBe('undetermined');
        expect(evaluateDiscussionLiveness(partialActive, 0)).toEqual({
            eligible       : false,
            rejectionBucket: ['undetermined-no-decaying-support']
        });

        expect(evaluateDiscussionLiveness({id: 'issue-1', type: 'ISSUE'}, 0)).toEqual({eligible: true, rejectionBucket: []})
    });
});
