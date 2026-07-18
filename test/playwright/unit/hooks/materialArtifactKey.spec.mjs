import {test, expect}                                                                              from '@playwright/test';
import {collectMaterialArtifactsFromJsonl, evaluateMaterialArtifactKey, MATERIAL_ARTIFACT_CLASSES} from '../../../../ai/scripts/lifecycle/materialArtifactKey.mjs';

/**
 * @summary The autonomous-quadrant stop key, both halves driven directly: the collector confirms
 * artifacts ONLY from tool-use→tool-result record shapes (prose can never mint a key), the
 * since-boundary scopes the license to the current work stretch, and the evaluator requires a
 * valid terminal PLUS at least one confirmed artifact — with formal reviews and RC-responses as
 * first-class keys so the capacity advisory stays coherent (never a PR-only Goodhart).
 */

const record = (blocks, timestamp = '2026-07-18T06:00:00.000Z') =>
    JSON.stringify({timestamp, message: {content: blocks}});

const toolUse    = (name, input)  => ({type: 'tool_use', name, input});
const toolResult = text           => ({type: 'tool_result', content: text});

test.describe('ai/scripts/lifecycle/materialArtifactKey', () => {
    test.describe('collectMaterialArtifactsFromJsonl — the three recognizers, fail-closed', () => {
        test('pr-opened: a gh pr create call whose result carries the PR URL', () => {
            const jsonl = [
                record([toolUse('Bash', {command: 'gh pr create --repo neomjs/neo --base dev --title "x"'})]),
                record([toolResult('https://github.com/neomjs/neo/pull/15416')])
            ].join('\n');

            expect(collectMaterialArtifactsFromJsonl(jsonl)).toEqual([
                {class: 'pr-opened', ref: '#15416', at: '2026-07-18T06:00:00.000Z'}
            ])
        });

        test('formal-review: a manage_pr_review create whose result confirms the posted review', () => {
            const jsonl = [
                record([toolUse('mcp__neo-mjs-github-workflow__manage_pr_review', {action: 'create', pr_number: 15393, state: 'APPROVED'})]),
                record([toolResult('{"message":"Successfully created APPROVED review on PR #15393","reviewId":"PRR_x"}')])
            ].join('\n');

            expect(collectMaterialArtifactsFromJsonl(jsonl)).toEqual([
                {class: 'formal-review', ref: '#15393', at: '2026-07-18T06:00:00.000Z'}
            ])
        });

        test('rc-response: a confirmed push FOLLOWED by a confirmed PR comment — order is load-bearing', () => {
            const push    = [record([toolUse('Bash', {command: 'git push --force-with-lease origin agent/x'})]), record([toolResult(' + abc...def agent/x -> agent/x (forced update)')])];
            const comment = [record([toolUse('Bash', {command: 'gh pr comment 15408 --repo neomjs/neo --body "addressed"'})]), record([toolResult('https://github.com/neomjs/neo/pull/15408#issuecomment-99')])];

            expect(collectMaterialArtifactsFromJsonl([...push, ...comment].join('\n'))).toEqual([
                {class: 'rc-response', ref: '#15408', at: '2026-07-18T06:00:00.000Z'}
            ]);

            // comment BEFORE any push: no cycle — the response half alone is not the key
            expect(collectMaterialArtifactsFromJsonl([...comment, ...push].join('\n'))).toEqual([])
        });

        test('the prose-claim negative: TALKING about PRs, reviews, and pushes mints NOTHING', () => {
            const jsonl = [
                JSON.stringify({timestamp: '2026-07-18T06:00:00.000Z', message: {content: [
                    {type: 'text', text: 'I opened https://github.com/neomjs/neo/pull/99999 and posted a formal review; git push succeeded.'}
                ]}}),
                // a result with a PR URL but NO arming tool_use before it
                record([toolResult('https://github.com/neomjs/neo/pull/99999')])
            ].join('\n');

            expect(collectMaterialArtifactsFromJsonl(jsonl)).toEqual([])
        });

        test('an armed call whose result never confirms yields nothing (fail-closed per class)', () => {
            const jsonl = [
                record([toolUse('Bash', {command: 'gh pr create --title x'})]),
                record([toolResult('error: could not create pull request')]),
                record([toolUse('mcp__neo-mjs-github-workflow__manage_pr_review', {action: 'create', pr_number: 1})]),
                record([toolResult('Error executing manage_pr_review: budget gate')])
            ].join('\n');

            expect(collectMaterialArtifactsFromJsonl(jsonl)).toEqual([])
        });

        test('the since-boundary: artifacts at-or-before the last accepted stop do not key a later one; undatable records fail closed under a boundary', () => {
            const early   = [record([toolUse('Bash', {command: 'gh pr create'})], '2026-07-18T05:00:00.000Z'), record([toolResult('github.com/neomjs/neo/pull/1')], '2026-07-18T05:00:01.000Z')];
            const late    = [record([toolUse('Bash', {command: 'gh pr create'})], '2026-07-18T06:00:00.000Z'), record([toolResult('github.com/neomjs/neo/pull/2')], '2026-07-18T06:00:01.000Z')];
            const undated = [JSON.stringify({message: {content: [toolUse('Bash', {command: 'gh pr create'})]}}), JSON.stringify({message: {content: [toolResult('github.com/neomjs/neo/pull/3')]}})];
            const jsonl   = [...early, ...late, ...undated].join('\n');

            const since = collectMaterialArtifactsFromJsonl(jsonl, {sinceIso: '2026-07-18T05:30:00.000Z'});
            expect(since.map(artifact => artifact.ref)).toEqual(['#2']);

            // no boundary: everything counts, undated included
            expect(collectMaterialArtifactsFromJsonl(jsonl).map(artifact => artifact.ref)).toEqual(['#1', '#2', '#3'])
        });

        test('garbage in, empty out — total function', () => {
            expect(collectMaterialArtifactsFromJsonl(undefined)).toEqual([]);
            expect(collectMaterialArtifactsFromJsonl('not json\n{"broken')).toEqual([]);
            expect(collectMaterialArtifactsFromJsonl('')).toEqual([])
        })
    });

    test.describe('evaluateMaterialArtifactKey — the license requires BOTH halves', () => {
        test('a valid terminal + one confirmed artifact accepts, naming the artifacts in the audit reason', () => {
            const verdict = evaluateMaterialArtifactKey({
                verdictValid: true,
                artifacts   : [{class: 'formal-review', ref: '#15393'}]
            });

            expect(verdict.accept).toBe(true);
            expect(verdict.reason).toContain('[material-allow]');
            expect(verdict.reason).toContain('formal-review #15393')
        });

        test('a formal review ALONE keys the stop — the capacity-advisory coherence pin (never PR-only)', () => {
            for (const cls of MATERIAL_ARTIFACT_CLASSES) {
                expect(evaluateMaterialArtifactKey({verdictValid: true, artifacts: [{class: cls, ref: '#1'}]}).accept,
                    `${cls} must key the stop`).toBe(true)
            }
        });

        test('artifact-less refuses with the directive line; invalid terminal refuses regardless of artifacts', () => {
            const bare = evaluateMaterialArtifactKey({verdictValid: true, artifacts: []});
            expect(bare.accept).toBe(false);
            expect(bare.reason).toContain('that is the stop key');

            expect(evaluateMaterialArtifactKey({verdictValid: false, artifacts: [{class: 'pr-opened', ref: '#1'}]}).accept).toBe(false)
        });

        test('unrecognized artifact classes never key — prose-shaped objects are not a license', () => {
            expect(evaluateMaterialArtifactKey({
                verdictValid: true,
                artifacts   : [{class: 'claimed-in-prose', ref: '#1'}, {class: 'lane-state-block'}]
            }).accept).toBe(false)
        });

        test('the empty call is safe and refusing (total)', () => {
            expect(evaluateMaterialArtifactKey().accept).toBe(false);
            expect(evaluateMaterialArtifactKey(undefined).accept).toBe(false)
        })
    })
});
