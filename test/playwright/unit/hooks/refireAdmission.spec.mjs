import fs              from 'node:fs';
import path            from 'node:path';
import {fileURLToPath} from 'node:url';
import {test, expect}  from '@playwright/test';
import {
    classifyForwardArtifacts,
    decideRefireAdmission,
    decideStopHookAction,
    FORWARD_ARTIFACT_RULES
}                       from '../../../../ai/scripts/lifecycle/stopHookDecision.mjs';

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
});
