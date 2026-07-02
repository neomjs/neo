import fs              from 'node:fs';
import os              from 'node:os';
import path            from 'node:path';
import {spawn}         from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {test, expect}  from '@playwright/test';
import {
    classifyForwardArtifacts,
    decideRefireAdmission,
    decideStopHookAction,
    FORWARD_ARTIFACT_RULES
}                       from '../../../../ai/scripts/lifecycle/stopHookDecision.mjs';
import {extractTurnToolEventsFromJsonl} from '../../../../.claude/hooks/laneStateStopHook.mjs';

/**
 * Re-fire axis — declining-yield admission over forward-artifact classes.
 *
 * The body-v2 cost-control contract: admission keys on the ABSENCE of new forward-artifact classes
 * across N consecutive hook-forced continuations (novelty, not presence — repeated same-class output is
 * padding, not yield); mandatory-gate artifacts (the per-turn memory save, the lane-state block) never
 * count; no visibility → fail closed. Admission additionally requires a VALID lane-state terminal at
 * the decision site, so L3's no-hold stance survives: this bounds the RE-FIRE, never the policy.
 * Pure functions — no hook, no I/O (the fixture read is test-input plumbing).
 */
test.describe('ai/scripts/lifecycle/stopHookDecision — declining-yield re-fire admission', () => {

    // ── classifyForwardArtifacts ────────────────────────────────────────────────────────────────
    test('classify: creation, comment, a2a, code-change, and graph-mutation classes map from tool events', () => {
        expect(classifyForwardArtifacts([
            {name: 'mcp__neo-mjs-github-workflow__create_issue', command: ''},
            {name: 'Bash', command: 'gh pr create --title x --base dev'},
            {name: 'mcp__neo-mjs-github-workflow__manage_issue_comment', command: ''},
            {name: 'mcp__neo-mjs-memory-core__add_message', command: ''},
            {name: 'Bash', command: 'git add a && git commit -m "x (#1)"'},
            {name: 'Edit', command: ''},
            {name: 'mcp__neo-mjs-github-workflow__update_issue_relationship', command: ''}
        ])).toEqual(['a2a-message', 'code-change', 'gh-comment', 'issue-graph-mutation', 'ticket-or-pr-created']);
    });

    test('classify: mandatory-gate + read-only + harness tools are NOT forward artifacts', () => {
        expect(classifyForwardArtifacts([
            {name: 'mcp__neo-mjs-memory-core__add_memory', command: ''},
            {name: 'mcp__neo-mjs-memory-core__list_messages', command: ''},
            {name: 'mcp__neo-mjs-memory-core__mark_read', command: ''},
            {name: 'TaskCreate', command: ''},
            {name: 'ToolSearch', command: ''},
            {name: 'Read', command: ''},
            {name: 'Bash', command: 'ls -la && git status'}
        ])).toEqual([]);
    });

    test('classify: total on malformed input — never throws, empty result', () => {
        expect(classifyForwardArtifacts(null)).toEqual([]);
        expect(classifyForwardArtifacts([null, 42, {}, {name: 7}, {name: 'Bash'}])).toEqual([]);
    });

    test('classify: the rule registry stays mandatory-gate-clean (no add_memory, no lane-state)', () => {
        const named = FORWARD_ARTIFACT_RULES.flatMap(rule => rule.names || []);
        expect(named.some(name => /add_memory/.test(name))).toBe(false);
    });

    // ── decideRefireAdmission ───────────────────────────────────────────────────────────────────
    test('admission: malformed input fails closed', () => {
        expect(decideRefireAdmission(null, []).admit).toBe(false);
        expect(decideRefireAdmission(null, []).reason).toContain('fail closed');
        expect(decideRefireAdmission([], null).admit).toBe(false);
        expect(decideRefireAdmission([], [], {n: 0}).admit).toBe(false);
    });

    test('admission: window not reached fails closed (first forced continuation never admits)', () => {
        const result = decideRefireAdmission([], [], {n: 2});
        expect(result.admit).toBe(false);
        expect(result.reason).toContain('window not reached');
    });

    test('admission: a new class keeps the chain yielding — refuse with the class named', () => {
        const result = decideRefireAdmission([['gh-comment']], ['ticket-or-pr-created'], {n: 2});
        expect(result.admit).toBe(false);
        expect(result.reason).toContain('still yielding');
        expect(result.summary.newClasses).toEqual(['ticket-or-pr-created']);
    });

    test('admission: N consecutive no-novelty continuations admit (artifact-empty chain)', () => {
        const result = decideRefireAdmission([['gh-comment'], []], [], {n: 2});
        expect(result.admit).toBe(true);
        expect(result.reason).toContain('declining-yield admission');
        expect(result.summary.consecutiveNoNovelty).toBe(2);
    });

    test('admission: same-class padding declines exactly like emptiness (anti-padding semantics)', () => {
        // One repeat is not yet the window; two repeats are.
        expect(decideRefireAdmission([['gh-comment']], ['gh-comment'], {n: 2}).admit).toBe(false);
        expect(decideRefireAdmission([['gh-comment'], ['gh-comment']], ['gh-comment'], {n: 2}).admit).toBe(true);
    });

    // ── CLI write fallbacks (review RA: gh writes must not look artifact-empty) ────────────────
    test('classify: sanctioned gh CLI write fallbacks are forward artifacts', () => {
        expect(classifyForwardArtifacts([{name: 'Bash', command: 'gh issue create --title x'}]))
            .toEqual(['ticket-or-pr-created']);
        expect(classifyForwardArtifacts([{name: 'Bash', command: 'gh pr review 14437 --approve'}]))
            .toEqual(['gh-comment']);
        expect(classifyForwardArtifacts([{name: 'Bash', command: 'gh issue comment 14420 --body hi'}]))
            .toEqual(['gh-comment']);
        expect(classifyForwardArtifacts([{name: 'Bash', command: 'gh pr comment 14439 --body hi'}]))
            .toEqual(['gh-comment']);
        expect(classifyForwardArtifacts([{name: 'Bash', command: 'gh issue edit 14420 --add-label ai'}]))
            .toEqual(['issue-graph-mutation']);
        expect(classifyForwardArtifacts([{name: 'Bash', command: "gh api -X POST repos/neomjs/neo/pulls/14439/requested_reviewers -f 'reviewers[]=neo-gpt'"}]))
            .toEqual(['issue-graph-mutation']);
    });

    test('classify: read-only gh stays non-artifact (view/list/checks and GET api)', () => {
        expect(classifyForwardArtifacts([
            {name: 'Bash', command: 'gh pr view 14439 --json state'},
            {name: 'Bash', command: 'gh issue list --state open --limit 10'},
            {name: 'Bash', command: 'gh pr checks 14439 --watch'},
            {name: 'Bash', command: 'gh api repos/neomjs/neo/pulls/14437/requested_reviewers'}
        ])).toEqual([]);
    });

    // ── decideStopHookAction integration — L3 guards ────────────────────────────────────────────
    test('decision: a VALID terminal + admitted refire allows with the declining-yield reason', () => {
        const refire = {admit: true, reason: 'declining-yield admission: 2 consecutive…'};
        expect(decideStopHookAction({valid: true, reason: 'valid lane-state terminal'}, {enforcing: true, refire}))
            .toEqual({action: 'allow', reason: refire.reason});
    });

    test('decision: an INVALID terminal is never admitted — refire cannot bypass the emission gate', () => {
        const refire = {admit: true, reason: 'declining-yield admission'};
        expect(decideStopHookAction({valid: false, reason: 'no lane-state block emitted at turn-terminal'}, {enforcing: true, refire}).action)
            .toBe('block');
    });

    test('decision: absent refire (no visibility) preserves today\'s fail-closed block', () => {
        expect(decideStopHookAction({valid: true, reason: 'valid lane-state terminal'}, {enforcing: true}).action)
            .toBe('block');
    });

    test('decision: operatorInLoop precedence is unchanged', () => {
        expect(decideStopHookAction({valid: false, reason: 'x'}, {enforcing: true, operatorInLoop: true, refire: {admit: true, reason: 'y'}}).action)
            .toBe('allow');
    });

    // ── Fixture-grounded chain replay (session 2251c81c, 2026-07-02) ────────────────────────────
    test('fixtures: the real four-instance chain never admits (each step yielded), then a no-novelty pair admits', () => {
        const dir     = path.dirname(fileURLToPath(import.meta.url)),
              fixture = JSON.parse(fs.readFileSync(path.join(dir, 'fixtures', 'refire-axis-instances.json'), 'utf8')),
              // Fixture inventory-class → implementation-class mapping.
              toImpl   = {
                  'issue-comment'       : 'gh-comment',
                  'issue-comment-update': 'gh-comment',
                  'a2a-broadcast'       : 'a2a-message',
                  'lane-claim'          : 'a2a-message',
                  'ticket-created'      : 'ticket-or-pr-created',
                  'native-sub-link'     : 'issue-graph-mutation',
                  'commit'              : 'code-change'
              },
              classSets = fixture.instances.map(instance =>
                  [...new Set(instance.sameTurnForwardArtifacts.map(artifact => toImpl[artifact.class]).filter(Boolean))].sort());

        // Replay: every real instance refused correctly under the novelty contract (chain kept yielding
        // through instance 3; instance 4 is the first no-novelty step — streak 1 of 2).
        const chain = [];
        fixture.instances.forEach((instance, i) => {
            const result = decideRefireAdmission(chain, classSets[i], {n: 2});
            expect(result.admit, `${instance.id} must not admit`).toBe(false);
            expect(instance.expectedAdmissibleUnderRefireFix === true).toBe(false);
            chain.push(classSets[i]);
        });

        // The defect case the axis fixes: continuing with no new classes must admit after the window.
        expect(decideRefireAdmission(chain, ['a2a-message'], {n: 2}).admit).toBe(true);
    });

    // ── Adapter-level wiring (review RA: JSONL extraction + spawned-hook chain) ─────────────────
    test('adapter: turn-scoped tool_use extraction is prompting-boundary-scoped and lifts Bash commands', () => {
        // Only tool_use blocks AFTER the last text-bearing user record count; the Bash `command`
        // input is lifted; tool_result-only user records do not move the boundary; malformed lines skip.
        const jsonl = [
            JSON.stringify({type: 'user',      message: {role: 'user',      content: [{type: 'text', text: 'old prompt'}]}}),
            JSON.stringify({type: 'assistant', message: {role: 'assistant', content: [{type: 'tool_use', name: 'mcp__neo-mjs-github-workflow__create_issue', input: {}}]}}),
            JSON.stringify({type: 'user',      message: {role: 'user',      content: [{type: 'text', text: '[WAKE] current prompt'}]}}),
            JSON.stringify({type: 'assistant', message: {role: 'assistant', content: [
                {type: 'tool_use', name: 'Bash', input: {command: 'git commit -m "x (#1)"'}},
                {type: 'text', text: 'working'}
            ]}}),
            JSON.stringify({type: 'user',      message: {role: 'user',      content: [{type: 'tool_result', content: 'ok'}]}}),
            JSON.stringify({type: 'assistant', message: {role: 'assistant', content: [{type: 'tool_use', name: 'mcp__neo-mjs-memory-core__add_memory', input: {}}]}}),
            'not json at all'
        ].join('\n');

        const events = extractTurnToolEventsFromJsonl(jsonl);
        expect(events).toEqual([
            {name: 'Bash', command: 'git commit -m "x (#1)"'},
            {name: 'mcp__neo-mjs-memory-core__add_memory', command: ''}
        ]);
        // With the classifier: the pre-boundary create_issue is excluded by the turn scope; add_memory
        // is mandatory-gate-excluded — only the commit counts.
        expect(classifyForwardArtifacts(events)).toEqual(['code-change']);
    });

    test('adapter e2e: a spawned forced-continuation chain refuses on turn 1, admits on turn 2, and resets the ledger', async () => {
        // Mirrors the sibling spec's spawn harness: env goes to the CHILD (never process.env mutation);
        // the SAME temp dir across spawns is the chain-persistence surface under test.
        const dir            = fs.mkdtempSync(path.join(os.tmpdir(), 'refire-e2e-')),
              transcriptPath = path.join(dir, 'transcript.jsonl'),
              finalText      = 'Continuing.\n\n```lane-state\n{"laneContinuation":"active-lane"}\n```';

        // An artifact-empty forced-continuation turn: [WAKE] prompt, one read-only tool, valid terminal.
        fs.writeFileSync(transcriptPath, [
            JSON.stringify({type: 'user',      message: {role: 'user',      content: [{type: 'text', text: '[WAKE][priority:normal] 1 events'}]}}),
            JSON.stringify({type: 'assistant', message: {role: 'assistant', content: [
                {type: 'tool_use', name: 'mcp__neo-mjs-memory-core__list_messages', input: {}},
                {type: 'text', text: finalText}
            ]}})
        ].join('\n') + '\n');

        const runHook = () => new Promise((resolve, reject) => {
            const proc = spawn('node', ['.claude/hooks/laneStateStopHook.mjs'], {
                stdio: ['pipe', 'pipe', 'pipe'],
                env  : {...process.env, NEO_AI_DAEMON_DIR: dir, NEO_LANE_STATE_ENFORCE: '1'}
            });
            let stdout = '';
            proc.stdout.on('data', chunk => stdout += chunk);
            proc.on('error', reject);
            proc.on('exit', () => {
                const logPath = path.join(dir, 'lane-state-stop-hook.log');
                resolve({stdout, log: fs.existsSync(logPath) ? fs.readFileSync(logPath, 'utf8') : ''});
            });
            proc.stdin.write(JSON.stringify({stop_hook_active: true, session_id: 'refire-e2e', transcript_path: transcriptPath}));
            proc.stdin.end();
        });

        // Continuation 1: window not reached (1/2) → BLOCK, artifact summary logged, chain persisted.
        const first = await runHook();
        expect(JSON.parse(first.stdout).decision).toBe('block');
        expect(first.log).toContain('[artifacts: classes=[none]');
        expect(JSON.parse(fs.readFileSync(path.join(dir, 'refire-chain-refire-e2e.json'), 'utf8'))).toEqual([[]]);

        // Continuation 2: two consecutive no-novelty continuations → declining-yield ALLOW; ledger resets.
        const second = await runHook();
        expect(second.stdout).toBe('');
        expect(second.log).toContain('ALLOW');
        expect(second.log).toContain('declining-yield admission');
        expect(JSON.parse(fs.readFileSync(path.join(dir, 'refire-chain-refire-e2e.json'), 'utf8'))).toEqual([]);
    });
});
