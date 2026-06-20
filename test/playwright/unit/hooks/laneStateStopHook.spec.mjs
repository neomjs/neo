import {test, expect}     from '@playwright/test';
import {decideHookAction} from '../../../../.claude/hooks/laneStateStopHook.mjs';

/**
 * Falsification test for the idle-out Stop-hook decision logic. `decideHookAction` is the pure
 * heart of the mechanism — it maps a terminal verdict + enforcement flag to allow / would-block /
 * block, independently of the I/O and the (stubbed) validator. The full end-to-end falsification
 * (spawn the hook + a real `validateLaneStateTerminal`) lands with the lane-state-terminal module;
 * this locks the decision logic now.
 */
test.describe('laneStateStopHook.decideHookAction — idle-out enforce/dry-run decision', () => {
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
