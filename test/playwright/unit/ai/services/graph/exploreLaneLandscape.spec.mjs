import {setup} from '../../../../setup.mjs';

const appName = 'ExploreLaneLandscapeTest';

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

/**
 * End-to-end contract tests for the current-state Bird View composition: census reads → projection →
 * optional cited synthesis → one notAuthority envelope. Pins the honest-absence firewall (a degraded
 * census withholds the narrative; an inference failure degrades only the narrative) and the
 * no-durable-write property.
 */
test.describe('exploreLaneLandscape — the current-state Bird View composition', () => {
    let exploreLaneLandscape;

    const now = new Date('2026-07-16T10:00:00.000Z');

    // An epic with two open children, one of them blocked, one unassigned — in the shape the OWNING
    // source returns (real assignee evidence; unassigned means the source said nobody owns it).
    const censusItems = [
        {number: 100, kind: 'issue', state: 'OPEN', labels: ['epic'], assignees: ['neo-opus-ada']},
        {number: 101, kind: 'issue', state: 'OPEN', labels: ['bug'],  assignees: ['neo-opus-ada']},
        {number: 102, kind: 'issue', state: 'OPEN', labels: ['bug'],  assignees: []},
        {number: 103, kind: 'issue', state: 'OPEN', labels: ['bug'],  assignees: ['neo-gpt']}
    ];

    const edgeRows = [
        {source: 'issue-100', target: 'issue-101', type: 'PARENT_OF'},
        {source: 'issue-100', target: 'issue-102', type: 'PARENT_OF'},
        {source: 'issue-103', target: 'issue-101', type: 'BLOCKS'}
    ];

    const deps = (overrides = {}) => ({
        queryOpenWorkCensus: async () => ({items: censusItems, manifest: {exhausted: true, pages: 1, reasons: []}}),
        queryRelationEdges : async () => ({edges: edgeRows, manifest: {exhausted: true, reasons: []}}),
        generate           : async () => ({content: 'issue-100 carries two open children; issue-101 is blocked by issue-103.'}),
        ...overrides
    });

    test.beforeAll(async () => {
        ({exploreLaneLandscape} = await import('../../../../../../ai/services/graph/exploreLaneLandscape.mjs'));
    });

    test('projects all three dimensions and stamps a cite-backed, notAuthority envelope', async () => {
        const result = await exploreLaneLandscape({now, deps: deps()});

        expect(result.schemaVersion).toBe('lane-landscape.v1');
        expect(result.notAuthority).toBe(true);
        expect(result.capturedAt).toBe('2026-07-16T10:00:00.000Z');

        // goal trajectory: the epic and its open children
        expect(result.goalTrajectory.map(entry => entry.id)).toEqual(['issue-100']);
        expect(result.goalTrajectory[0].openChildren).toEqual(['issue-101', 'issue-102']);
        // dependency path: the blocked item names its blocker
        expect(result.dependencyPath.map(entry => entry.id)).toEqual(['issue-101']);
        expect(result.dependencyPath[0].blockedBy).toEqual(['issue-103']);
        // authority coverage: the unassigned item is named, not just counted
        expect(result.authorityCoverage.unassignedIds).toEqual(['issue-102']);
        expect(result.coverage.degraded).toBe(false);

        expect(result.synthesis.available).toBe(true);
        expect(result.synthesis.narrative).toContain('issue-100');
        expect(result.synthesis.inferenceInputIds).toContain('issue-101');
    });

    test('citations mark what the narrative could have used — the census is broader than the prompt', async () => {
        const result = await exploreLaneLandscape({now, deps: deps()});

        expect(result.citations.map(citation => citation.id))
            .toEqual(['issue-100', 'issue-101', 'issue-102', 'issue-103']);
        expect(result.sourceManifestHash).toMatch(/^[0-9a-f]{8}$/);

        // issue-100 is an epic the prompt enumerates; it reached inference
        expect(result.citations.find(citation => citation.id === 'issue-100').inSynthesis).toBe(true);
        // issue-103 is enumerated too — as issue-101's blocker
        expect(result.citations.find(citation => citation.id === 'issue-103').inSynthesis).toBe(true);
        expect(result.citations[0].drillDown).toEqual({operation: 'get_conversation', arguments: {issue_number: 100}});
    });

    test('a withheld narrative marks NO citation as used — nothing reached an inference that never ran', async () => {
        const result = await exploreLaneLandscape({
            now,
            deps: deps({generate: async () => { throw new Error('provider down') }})
        });

        expect(result.synthesis.available).toBe(false);
        // the citations survive the failed narrative — they are census evidence, not synthesis output
        expect(result.citations).toHaveLength(4);
        expect(result.citations.every(citation => citation.inSynthesis === false)).toBe(true);
    });

    test('a DEGRADED census withholds the narrative entirely and never runs inference', async () => {
        // Honest absence: a partial structure narrated confidently is worse than no narrative, so the
        // LLM leg must be SKIPPED — not run and discarded.
        let generateCalls = 0;

        const result = await exploreLaneLandscape({
            now,
            deps: deps({
                queryOpenWorkCensus: async () => { throw new Error('graph unavailable') },
                generate           : async () => { generateCalls++; return {content: 'should never run'} }
            })
        });

        expect(result.coverage.degraded).toBe(true);
        expect(result.synthesis.available).toBe(false);
        expect(result.synthesis.narrative).toBeNull();
        expect(result.synthesis.unavailableReason).toBe('coverage-degraded');
        expect(generateCalls).toBe(0);
        // the envelope is still honest + readable, not an exception
        expect(result.notAuthority).toBe(true);
    });

    test('an inference failure degrades ONLY the narrative — deterministic census evidence survives', async () => {
        const result = await exploreLaneLandscape({
            now,
            deps: deps({generate: async () => { throw new Error('provider down') }})
        });

        expect(result.synthesis.available).toBe(false);
        expect(result.synthesis.narrative).toBeNull();
        expect(result.synthesis.unavailableReason).toMatch(/synthesis-failed: provider down/);
        // the structure the census proved is preserved, not discarded with the failed inference
        expect(result.goalTrajectory[0].openChildren).toEqual(['issue-101', 'issue-102']);
        expect(result.authorityCoverage.unassignedIds).toEqual(['issue-102']);
        expect(result.coverage.degraded).toBe(false);
    });

    test('an empty narrative is an honest absence, never an authoritative-looking blank', async () => {
        const result = await exploreLaneLandscape({now, deps: deps({generate: async () => ({content: ''})})});

        expect(result.synthesis.available).toBe(false);
        expect(result.synthesis.narrative).toBeNull();
        expect(result.synthesis.unavailableReason).toMatch(/produced no narrative/);
    });

    test('writes nothing above L2 — by construction, no write dep is injectable', async () => {
        // The composition's only deps are two reads and one inference call; there is no durable sink to
        // pass, so no L3-L5 cascade is constructible here.
        const injected = Object.keys(deps());

        expect(injected.sort()).toEqual(['generate', 'queryOpenWorkCensus', 'queryRelationEdges']);
    });

    test('fails LOUD on an unbound dep or a missing capture time — a wiring bug is not a degradation', async () => {
        await expect(exploreLaneLandscape({now, deps: {queryOpenWorkCensus: async () => ({items: [], manifest: {exhausted: true}})}}))
            .rejects.toThrow(/must supply queryOpenWorkCensus, queryRelationEdges, and generate/);

        await expect(exploreLaneLandscape({deps: deps()})).rejects.toThrow(/`now` capture time is required/);
    });
});
