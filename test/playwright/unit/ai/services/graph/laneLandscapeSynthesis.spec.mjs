import {setup} from '../../../../setup.mjs';

const appName = 'LaneLandscapeSynthesisTest';

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
 * Contract tests for the landscape-framed cited synthesis: the prompt must carry the projected
 * structure as facts (not counts), forbid ranking/assignment, and keep unknown unknown.
 */
test.describe('laneLandscapeSynthesis — the current-state cited synthesis', () => {
    let buildLaneLandscapeSynthesisPrompt, makeLaneLandscapeSynthesize, selectLandscapeSynthesisInputIds;

    const landscape = {
        capturedAt       : '2026-07-16T10:00:00.000Z',
        goalTrajectory   : [{id: 'issue-100', openChildren: ['issue-101', 'issue-102']}],
        dependencyPath   : [{id: 'issue-101', blockedBy: ['issue-103']}],
        authorityCoverage: {assignedCount: 2, unassignedCount: 1, unassignedIds: ['issue-102']},
        coverage         : {totalOpenItems: 4, edgeCount: 3, degraded: false},
        notAuthority     : true
    };

    test.beforeAll(async () => {
        const mod = await import('../../../../../../ai/services/graph/laneLandscapeSynthesis.mjs');
        buildLaneLandscapeSynthesisPrompt = mod.buildLaneLandscapeSynthesisPrompt;
        makeLaneLandscapeSynthesize       = mod.makeLaneLandscapeSynthesize;
        selectLandscapeSynthesisInputIds  = mod.selectLandscapeSynthesisInputIds;
    });

    test('the prompt enumerates the structure as FACTS, not counts — a count alone lets the model invent the shape', () => {
        const prompt = buildLaneLandscapeSynthesisPrompt({landscape});

        expect(prompt).toContain('issue-100: 2 open child/children (issue-101, issue-102)');
        expect(prompt).toContain('issue-101: blocked by issue-103');
        expect(prompt).toContain('unassigned: 1 (issue-102)');
        expect(prompt).toContain('captured at 2026-07-16T10:00:00.000Z');
    });

    test('the prompt forbids ranking and assignment — the landscape describes, it is not a second scorer', () => {
        const prompt = buildLaneLandscapeSynthesisPrompt({landscape});

        expect(prompt).toMatch(/do NOT rank the lanes/);
        expect(prompt).toMatch(/suggest who should own anything/);
        expect(prompt).toMatch(/Ranking and assignment are other surfaces' authority\./);
    });

    test('the prompt keeps unknown unknown and bans outside knowledge', () => {
        const prompt = buildLaneLandscapeSynthesisPrompt({landscape});

        expect(prompt).toMatch(/Use ONLY the structure above/);
        expect(prompt).toMatch(/do not invent items, edges, or owners/);
        expect(prompt).toMatch(/say it is unknown rather than inferring it/);
        // a current-state answer must not be narrated as a history
        expect(prompt).toMatch(/do not narrate change over time/);
    });

    test('an empty landscape renders honest "none" rows rather than omitting the dimension', () => {
        const prompt = buildLaneLandscapeSynthesisPrompt({landscape: {capturedAt: '2026-07-16T10:00:00.000Z'}});

        expect(prompt).toContain('GOAL TRAJECTORY');
        expect(prompt).toContain('DEPENDENCY / CRITICAL PATH');
        expect(prompt).toMatch(/- none/);
    });

    test('selectLandscapeSynthesisInputIds reports exactly the ids the prompt enumerated', () => {
        // Derived from the prompt TEXT rather than hand-copied from the implementation: the two must
        // agree, and a hand-written expectation can only ever pin whatever the code already does. An id
        // the model was handed but the envelope omits reads as an ungrounded mention to anyone auditing
        // the narrative against its citations.
        const prompt      = buildLaneLandscapeSynthesisPrompt({landscape}),
              idsInPrompt = [...new Set(prompt.match(/issue-\d+/g))].sort();

        expect(selectLandscapeSynthesisInputIds(landscape)).toEqual(idsInPrompt);
        // the blocker is enumerated as a citable fact, so it must be reported as one
        expect(idsInPrompt).toContain('issue-103');
        expect(selectLandscapeSynthesisInputIds({})).toEqual([]);
    });

    test('related items — an epic\'s children and a blocked item\'s blockers — are reported, not just entry ids', () => {
        const ids = selectLandscapeSynthesisInputIds({
            goalTrajectory   : [{id: 'issue-100', openChildren: ['issue-201', 'issue-202']}],
            dependencyPath   : [{id: 'issue-300', blockedBy: ['issue-400']}],
            authorityCoverage: {unassignedIds: ['issue-500']}
        });

        // Reporting only [100, 300, 500] would under-report the evidence that actually reached inference.
        expect(ids).toEqual(['issue-100', 'issue-201', 'issue-202', 'issue-300', 'issue-400', 'issue-500']);
    });

    test('makeLaneLandscapeSynthesize returns the narrative plus the ids that reached inference', async () => {
        const synthesize = makeLaneLandscapeSynthesize({generate: async () => ({content: 'issue-100 carries 2 open children.'})}),
              result     = await synthesize({landscape});

        expect(result.narrative).toBe('issue-100 carries 2 open children.');
        expect(result.inferenceInputIds).toEqual(['issue-100', 'issue-101', 'issue-102', 'issue-103']);
    });

    test('fails LOUD on a missing generate dep or an empty narrative — a blank is not an honest absence', async () => {
        expect(() => makeLaneLandscapeSynthesize({})).toThrow(/injected `generate` function is required/);

        const synthesize = makeLaneLandscapeSynthesize({generate: async () => ({content: ''})});

        await expect(synthesize({landscape})).rejects.toThrow(/produced no narrative/);
    });
});
