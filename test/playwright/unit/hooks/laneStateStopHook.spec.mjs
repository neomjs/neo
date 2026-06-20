import {test, expect}                            from '@playwright/test';
import {decideHookAction, parseOutcomeToVerdict} from '../../../../.claude/hooks/laneStateStopHook.mjs';

/**
 * Falsification tests for the idle-out Stop-hook pure logic. Two exported, I/O-free functions carry
 * the mechanism: `parseOutcomeToVerdict` (the 3-bucket chain — malformed / absent / validated) and
 * `decideHookAction` (verdict + enforcing → allow / would-block / block). The full end-to-end
 * falsification (spawn the hook + a real parser + validator) lands with the lane-state-terminal
 * module; these lock the decision logic now.
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
