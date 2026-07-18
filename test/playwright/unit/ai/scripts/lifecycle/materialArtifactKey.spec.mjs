import {test, expect}                                                                              from '@playwright/test';
import {collectMaterialArtifactsFromJsonl, evaluateMaterialArtifactKey, MATERIAL_ARTIFACT_CLASSES} from '../../../../../../ai/scripts/lifecycle/materialArtifactKey.mjs';

/**
 * @summary The autonomous-quadrant stop key with PROVENANCE-GRADE fixtures: every fixture carries
 * the real transcript shape — `tool_use.id`, `tool_result.tool_use_id`, `is_error` — so the suite
 * exercises the trust boundary it claims: only the matching result of a qualifying call confirms
 * an artifact; batched calls keep their keys; mismatched, errored, free-floating, and shell-echoed
 * text mints nothing; the since-boundary and the unavailable-boundary both fail closed.
 */

const record = (blocks, timestamp = '2026-07-18T06:00:00.000Z') =>
    JSON.stringify({timestamp, message: {content: blocks}});

const use    = (id, name, input)                    => ({type: 'tool_use', id, name, input});
const result = (toolUseId, text, isError = false)  => ({type: 'tool_result', tool_use_id: toolUseId, is_error: isError, content: text});

const PR_CREATE = command => ({command});

test.describe('ai/scripts/lifecycle/materialArtifactKey', () => {
    test.describe('collectMaterialArtifactsFromJsonl — ID-correlated provenance, fail-closed', () => {
        test('pr-opened: the MATCHING result of a real gh pr create call confirms; ref and timestamp carried', () => {
            const jsonl = [
                record([use('toolu_01', 'Bash', PR_CREATE('gh pr create --repo neomjs/neo --base dev --title "x"'))]),
                record([result('toolu_01', 'https://github.com/neomjs/neo/pull/15416')], '2026-07-18T06:00:05.000Z')
            ].join('\n');

            expect(collectMaterialArtifactsFromJsonl(jsonl)).toEqual([
                {class: 'pr-opened', ref: '#15416', at: '2026-07-18T06:00:05.000Z'}
            ])
        });

        test('formal-review: the matching confirmed result of a manage_pr_review create', () => {
            const jsonl = [
                record([use('toolu_02', 'mcp__neo-mjs-github-workflow__manage_pr_review', {action: 'create', pr_number: 15393, state: 'APPROVED'})]),
                record([result('toolu_02', '{"message":"Successfully created APPROVED review on PR #15393","reviewId":"PRR_x"}')])
            ].join('\n');

            expect(collectMaterialArtifactsFromJsonl(jsonl)).toEqual([
                {class: 'formal-review', ref: '#15393', at: '2026-07-18T06:00:00.000Z'}
            ])
        });

        test('BATCHED calls keep their keys: two uses in one record, results in either order, both confirm', () => {
            const jsonl = [
                record([
                    use('toolu_a', 'Bash', PR_CREATE('gh pr create --title one')),
                    use('toolu_b', 'mcp__neo-mjs-github-workflow__manage_pr_review', {action: 'create', pr_number: 7})
                ]),
                record([
                    result('toolu_b', 'Successfully created APPROVED review on PR #7 "reviewId"'),
                    result('toolu_a', 'github.com/neomjs/neo/pull/101')
                ])
            ].join('\n');

            expect(collectMaterialArtifactsFromJsonl(jsonl).map(artifact => artifact.class).sort())
                .toEqual(['formal-review', 'pr-opened'])
        });

        test('a MISMATCHED tool_use_id confirms nothing — nearby unrelated results are not provenance', () => {
            const jsonl = [
                record([use('toolu_pr', 'Bash', PR_CREATE('gh pr create --title x'))]),
                // a DIFFERENT call's result happens to carry a PR URL (e.g. a gh pr view)
                record([result('toolu_other', 'https://github.com/neomjs/neo/pull/999')])
            ].join('\n');

            expect(collectMaterialArtifactsFromJsonl(jsonl)).toEqual([])
        });

        test('an is_error result CONSUMES the key and confirms nothing — and the key cannot be re-confirmed later', () => {
            const jsonl = [
                record([use('toolu_pr', 'Bash', PR_CREATE('gh pr create --title x'))]),
                record([result('toolu_pr', 'https://github.com/neomjs/neo/pull/500', true)]),
                // a replay of the same id after the error: the key is gone
                record([result('toolu_pr', 'https://github.com/neomjs/neo/pull/500')])
            ].join('\n');

            expect(collectMaterialArtifactsFromJsonl(jsonl)).toEqual([])
        });

        test('shell impersonation never arms: echo/quoted/piped mentions of gh pr create are not the command head', () => {
            const jsonl = [
                record([use('toolu_1', 'Bash', PR_CREATE('echo "gh pr create --title fake"'))]),
                record([result('toolu_1', 'gh pr create --title fake\nhttps://github.com/neomjs/neo/pull/666')]),
                record([use('toolu_2', 'Bash', PR_CREATE('history | grep "gh pr create"'))]),
                record([result('toolu_2', 'gh pr create https://github.com/neomjs/neo/pull/667')])
            ].join('\n');

            expect(collectMaterialArtifactsFromJsonl(jsonl)).toEqual([]);

            // while env-prefixed and leading-whitespace REAL invocations still arm (the shell
            // ignores both — and the linear anchor hoists exactly one whitespace run outside
            // the assignment loop, the js/redos-safe form)
            const real = [
                record([use('toolu_3', 'Bash', PR_CREATE('GH_TOKEN=x gh pr create --title real'))]),
                record([result('toolu_3', 'https://github.com/neomjs/neo/pull/700')]),
                record([use('toolu_4', 'Bash', PR_CREATE('  gh pr create --title indented'))]),
                record([result('toolu_4', 'https://github.com/neomjs/neo/pull/701')])
            ].join('\n');

            expect(collectMaterialArtifactsFromJsonl(real).map(artifact => artifact.ref)).toEqual(['#700', '#701'])
        });

        test('compound commands never arm — ||, &&, ;, |, single-& backgrounding, and CR/LF line breaks all fail closed', () => {
            const jsonl = [
                record([use('toolu_c1', 'Bash', PR_CREATE('gh pr create --title x || echo https://github.com/neomjs/neo/pull/800'))]),
                record([result('toolu_c1', 'https://github.com/neomjs/neo/pull/800')]),
                record([use('toolu_c2', 'Bash', PR_CREATE('gh pr create --title y && echo done'))]),
                record([result('toolu_c2', 'https://github.com/neomjs/neo/pull/801')]),
                record([use('toolu_c3', 'Bash', PR_CREATE('gh pr create --title z; echo tail'))]),
                record([result('toolu_c3', 'https://github.com/neomjs/neo/pull/802')]),
                record([use('toolu_c4', 'Bash', PR_CREATE('gh pr create --title w | tee log'))]),
                record([result('toolu_c4', 'https://github.com/neomjs/neo/pull/803')]),
                // the reviewer falsifiers, pinned exactly: a single `&` BACKGROUNDS the pr-create and
                // hands the tail command the visible output — no double-operator spelling required
                record([use('toolu_c5', 'Bash', PR_CREATE('gh pr create --title v & echo https://github.com/neomjs/neo/pull/804'))]),
                record([result('toolu_c5', 'https://github.com/neomjs/neo/pull/804')]),
                // and a line break is sequential composition with NO operator spelling at all
                record([use('toolu_c6', 'Bash', PR_CREATE('gh pr create --title u\necho https://github.com/neomjs/neo/pull/805'))]),
                record([result('toolu_c6', 'https://github.com/neomjs/neo/pull/805')]),
                record([use('toolu_c7', 'Bash', PR_CREATE('gh pr create --title t\r\necho https://github.com/neomjs/neo/pull/806'))]),
                record([result('toolu_c7', 'https://github.com/neomjs/neo/pull/806')])
            ].join('\n');

            // the stop LICENSE requires the standalone invocation whose result is unambiguously
            // the pr-create's own — chained forms fail closed even when legitimate
            expect(collectMaterialArtifactsFromJsonl(jsonl)).toEqual([])
        });

        test('the prose-claim negative: text blocks and free-floating results mint nothing; an id-less tool_use arms nothing', () => {
            const jsonl = [
                JSON.stringify({timestamp: '2026-07-18T06:00:00.000Z', message: {content: [
                    {type: 'text', text: 'I opened https://github.com/neomjs/neo/pull/99999 and posted a formal review.'}
                ]}}),
                record([result('toolu_nobody', 'https://github.com/neomjs/neo/pull/99999')]),
                record([{type: 'tool_use', name: 'Bash', input: PR_CREATE('gh pr create --title idless')}]),
                record([result('toolu_still_nobody', 'github.com/neomjs/neo/pull/1000')])
            ].join('\n');

            expect(collectMaterialArtifactsFromJsonl(jsonl)).toEqual([])
        });

        test('the since-boundary: at-or-before excluded, undatable-under-boundary excluded, no-boundary counts all', () => {
            const early   = [record([use('u1', 'Bash', PR_CREATE('gh pr create'))], '2026-07-18T05:00:00.000Z'), record([result('u1', 'github.com/neomjs/neo/pull/1')], '2026-07-18T05:00:01.000Z')];
            const late    = [record([use('u2', 'Bash', PR_CREATE('gh pr create'))], '2026-07-18T06:00:00.000Z'), record([result('u2', 'github.com/neomjs/neo/pull/2')], '2026-07-18T06:00:01.000Z')];
            const undated = [JSON.stringify({message: {content: [use('u3', 'Bash', PR_CREATE('gh pr create'))]}}), JSON.stringify({message: {content: [result('u3', 'github.com/neomjs/neo/pull/3')]}})];
            const jsonl   = [...early, ...late, ...undated].join('\n');

            expect(collectMaterialArtifactsFromJsonl(jsonl, {sinceIso: '2026-07-18T05:30:00.000Z'}).map(artifact => artifact.ref)).toEqual(['#2']);
            expect(collectMaterialArtifactsFromJsonl(jsonl).map(artifact => artifact.ref)).toEqual(['#1', '#2', '#3'])
        });

        test('garbage in, empty out — total function', () => {
            expect(collectMaterialArtifactsFromJsonl(undefined)).toEqual([]);
            expect(collectMaterialArtifactsFromJsonl('not json\n{"broken')).toEqual([]);
            expect(collectMaterialArtifactsFromJsonl('')).toEqual([])
        })
    });

    test.describe('evaluateMaterialArtifactKey — the license requires a valid terminal, a provable scope, and a confirmed artifact', () => {
        test('a valid terminal + one confirmed artifact accepts, naming the artifacts in the audit reason', () => {
            const verdict = evaluateMaterialArtifactKey({
                verdictValid: true,
                artifacts   : [{class: 'formal-review', ref: '#15393'}]
            });

            expect(verdict.accept).toBe(true);
            expect(verdict.reason).toContain('[material-allow]');
            expect(verdict.reason).toContain('formal-review #15393')
        });

        test('every v1 class keys the stop — the capacity-advisory coherence pin (never PR-only)', () => {
            expect(MATERIAL_ARTIFACT_CLASSES).toEqual(['pr-opened', 'formal-review']);

            for (const cls of MATERIAL_ARTIFACT_CLASSES) {
                expect(evaluateMaterialArtifactKey({verdictValid: true, artifacts: [{class: cls, ref: '#1'}]}).accept,
                    `${cls} must key the stop`).toBe(true)
            }
        });

        test('an UNAVAILABLE accepted-stop boundary refuses regardless of artifacts — unscoped evidence licenses nothing', () => {
            const verdict = evaluateMaterialArtifactKey({
                verdictValid    : true,
                sinceUnavailable: true,
                artifacts       : [{class: 'pr-opened', ref: '#1'}]
            });

            expect(verdict.accept).toBe(false);
            expect(verdict.reason).toContain('unreadable')
        });

        test('artifact-less refuses with the directive line; invalid terminal refuses regardless of artifacts', () => {
            const bare = evaluateMaterialArtifactKey({verdictValid: true, artifacts: []});
            expect(bare.accept).toBe(false);
            expect(bare.reason).toContain('that is the stop key');

            expect(evaluateMaterialArtifactKey({verdictValid: false, artifacts: [{class: 'pr-opened', ref: '#1'}]}).accept).toBe(false)
        });

        test('unrecognized artifact classes never key — rc-response is deliberately NOT a v1 class', () => {
            expect(evaluateMaterialArtifactKey({
                verdictValid: true,
                artifacts   : [{class: 'rc-response', ref: '#1'}, {class: 'claimed-in-prose'}]
            }).accept).toBe(false)
        });

        test('the empty call is safe and refusing (total)', () => {
            expect(evaluateMaterialArtifactKey().accept).toBe(false);
            expect(evaluateMaterialArtifactKey(undefined).accept).toBe(false)
        })
    })
});
