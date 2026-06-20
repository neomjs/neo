import {test, expect}                            from '@playwright/test';
import {decideHookAction, parseOutcomeToVerdict} from '../../../../.claude/hooks/laneStateStopHook.mjs';
import {spawn}                                   from 'node:child_process';
import fs                                        from 'node:fs';
import os                                        from 'node:os';
import path                                      from 'node:path';

/**
 * Falsification tests for the idle-out Stop-hook. The pure layer locks the decision logic in-process
 * (`parseOutcomeToVerdict` — the 3-bucket chain; `decideHookAction` — allow / would-block / block).
 * The end-to-end layer spawns the REAL hook with real ```lane-state emissions and asserts the wired
 * parser + validator (ai/scripts/lifecycle) fire through the hook I/O — the integrated seam.
 */
test.describe('laneStateStopHook — pure idle-out decision logic', () => {
    test.describe('parseOutcomeToVerdict — the 3-bucket chain', () => {
        const alwaysValid   = () => ({valid: true,  violations: []}),
              alwaysInvalid = () => ({valid: false, violations: ['Rule 4: verified-no-lane without a full-backlog survey']});

        test('MALFORMED emission (parseLaneState threw) → invalid, with the parse error in the reason', () => {
            const verdict = parseOutcomeToVerdict({descriptor: null, parseError: new Error('Unexpected token }')}, alwaysValid);
            expect(verdict.valid).toBe(false);
            expect(verdict.reason).toContain('malformed lane-state emission');
        });

        test('ABSENT emission (null, no error) → invalid, "no lane-state block emitted"', () => {
            const verdict = parseOutcomeToVerdict({descriptor: null, parseError: null}, alwaysValid);
            expect(verdict.valid).toBe(false);
            expect(verdict.reason).toBe('no lane-state block emitted at turn-terminal');
        });

        test('a parsed descriptor is delegated to the validator — VALID → valid verdict', () => {
            const verdict = parseOutcomeToVerdict({descriptor: {laneContinuation: 'active-lane'}, parseError: null}, alwaysValid);
            expect(verdict.valid).toBe(true);
        });

        test('a parsed descriptor — INVALID → invalid verdict carrying the validator violations', () => {
            const verdict = parseOutcomeToVerdict({descriptor: {laneContinuation: 'verified-no-lane'}, parseError: null}, alwaysInvalid);
            expect(verdict.valid).toBe(false);
            expect(verdict.reason).toContain('Rule 4');
        });
    });

    test.describe('decideHookAction — enforce / dry-run', () => {
        test('a VALID terminal always ALLOWS — dry-run AND enforcing (never traps a legit handoff)', () => {
            expect(decideHookAction({valid: true, reason: 'ok'}, false).action).toBe('allow');
            expect(decideHookAction({valid: true, reason: 'ok'}, true).action).toBe('allow');
        });

        test('an INVALID terminal WOULD-BLOCK in dry-run — logs the would-be block, never blocks', () => {
            const result = decideHookAction({valid: false, reason: 'no active lane'}, false);
            expect(result.action).toBe('would-block');
            expect(result.reason).toBe('no active lane');
        });

        test('an INVALID terminal BLOCKS when enforcing — the reason is carried through to inject', () => {
            const result = decideHookAction({valid: false, reason: 'no active lane — pick one or cite a survey'}, true);
            expect(result.action).toBe('block');
            expect(result.reason).toBe('no active lane — pick one or cite a survey');
        });
    });
});

test.describe('laneStateStopHook — end-to-end (spawned hook + real parser/validator)', () => {
    /**
     * @summary Spawns the real hook with a transcript fixture + a temp audit-log dir; returns
     * `{stdout, log}` once it exits. The hook reads `transcript_path` from the stdin payload, so the
     * real ai/scripts/lifecycle parser + validator fire through the actual hook I/O.
     * @param {String} transcriptText
     * @param {{enforce: Boolean}} [opts]
     * @returns {Promise<{stdout: String, log: String}>}
     */
    function runHook(transcriptText, {enforce = false} = {}) {
        return new Promise((resolve, reject) => {
            const dir            = fs.mkdtempSync(path.join(os.tmpdir(), 'lane-hook-e2e-')),
                  transcriptPath = path.join(dir, 'transcript.txt'),
                  env            = {...process.env, NEO_AI_DAEMON_DIR: dir};

            fs.writeFileSync(transcriptPath, transcriptText);
            if (enforce) env.NEO_LANE_STATE_ENFORCE = '1';

            const proc = spawn('node', ['.claude/hooks/laneStateStopHook.mjs'], {stdio: ['pipe', 'pipe', 'pipe'], env});
            let stdout = '';

            proc.stdout.on('data', chunk => stdout += chunk);
            proc.on('error', reject);
            proc.on('exit', () => {
                const logPath = path.join(dir, 'lane-state-stop-hook.log');
                resolve({stdout, log: fs.existsSync(logPath) ? fs.readFileSync(logPath, 'utf8') : ''});
            });

            proc.stdin.write(JSON.stringify({stop_hook_active: false, session_id: 'e2e', transcript_path: transcriptPath}));
            proc.stdin.end();
        });
    }

    const block = body => '```lane-state\n' + body + '\n```';

    test('a VALID emission (active-lane) → WOULD-ALLOW, no block on stdout', async () => {
        const {stdout, log} = await runHook(`On it.\n\n${block('{"laneContinuation":"active-lane"}')}`);
        expect(log).toContain('WOULD-ALLOW');
        expect(stdout).toBe('');
    });

    test('an INVALID emission (verified-no-lane, no full-backlog survey) → WOULD-BLOCK via Rule 4', async () => {
        const {stdout, log} = await runHook(block('{"laneContinuation":"verified-no-lane"}'));
        expect(log).toContain('WOULD-BLOCK');
        expect(log).toContain('full-backlog survey');
        expect(stdout).toBe('');
    });

    test('an ABSENT emission (no lane-state block) → WOULD-BLOCK', async () => {
        const {log} = await runHook('Just some prose, no lane-state block here.');
        expect(log).toContain('WOULD-BLOCK');
        expect(log).toContain('no lane-state block emitted');
    });

    test('a MALFORMED emission (block present, broken JSON) → WOULD-BLOCK, distinct from absent', async () => {
        const {log} = await runHook(block('{laneContinuation: not valid json}'));
        expect(log).toContain('WOULD-BLOCK');
        expect(log).toContain('malformed');
    });

    test('ENFORCING + invalid emission → blocks: {"decision":"block"} injected on stdout', async () => {
        const {stdout, log} = await runHook(block('{"laneContinuation":"verified-no-lane"}'), {enforce: true});
        expect(log).toContain('BLOCK');
        const decision = JSON.parse(stdout);
        expect(decision.decision).toBe('block');
        expect(decision.reason).toContain('full-backlog survey');
    });
});
