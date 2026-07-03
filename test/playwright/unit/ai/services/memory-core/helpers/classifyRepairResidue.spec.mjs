import {test, expect}                                                       from '@playwright/test';
import Neo                                                                  from '../../../../../../../src/Neo.mjs';
import * as core                                                            from '../../../../../../../src/core/_export.mjs';
import {classifyRepairResidue, computeResidueFingerprint, TERMINAL_REASONS} from '../../../../../../../ai/services/memory-core/helpers/classifyRepairResidue.mjs';

// Pure decider (no I/O). Given a repair's unrecoverable residue + a durable ack, classifies it
// accepted-loss (all-terminal + ack matches the live residue) vs escalate (any transient reason, or
// un-acknowledged / stale ack); empty residue → no-residue.

const CTX = {strategyVersion: 'v1', provider: 'openAiCompatible', contextBudget: 32768};

function ackFor(residue, ctx = CTX) {
    return {fingerprint: computeResidueFingerprint({residue, ...ctx, terminalReasons: TERMINAL_REASONS})};
}

test.describe('classifyRepairResidue — accepted-loss vs escalate decider', () => {
    test('all-terminal residue + a matching ack -> accepted-loss', () => {
        const residue = [{id: 'a', reason: 'embedding-context-exceeded'}, {id: 'b', reason: 'document-absent'}];
        const result  = classifyRepairResidue({residue, ack: ackFor(residue), ...CTX});

        expect(result.outcome).toBe('accepted-loss');
        expect(result.reasonCode).toBe('terminal-residue-acknowledged');
        expect(result.fingerprint).toBe(ackFor(residue).fingerprint);
    });

    test('any non-terminal (transient/unknown) reason -> escalate, even with a matching ack', () => {
        const residue = [{id: 'a', reason: 'embedding-context-exceeded'}, {id: 'b', reason: 'provider-timeout'}];
        // Even if the operator somehow acked this exact set, a transient reason must still escalate.
        const result = classifyRepairResidue({residue, ack: ackFor(residue), ...CTX});

        expect(result.outcome).toBe('escalate');
        expect(result.reasonCode).toBe('transient-or-unknown-unrecoverable');
        expect(result.nonTerminalReasons).toEqual(['provider-timeout']);
    });

    test('all-terminal but NO ack -> escalate (unacknowledged)', () => {
        const residue = [{id: 'a', reason: 'document-absent'}];
        const result  = classifyRepairResidue({residue, ...CTX});  // no ack

        expect(result.outcome).toBe('escalate');
        expect(result.reasonCode).toBe('unacknowledged-or-stale-terminal-residue');
        expect(result.fingerprint).toEqual(expect.any(String));
    });

    test('all-terminal but a STALE ack (residue changed since the ack) -> escalate', () => {
        const ackedResidue = [{id: 'a', reason: 'embedding-context-exceeded'}],
              ack          = ackFor(ackedResidue),
              // a new terminal row appeared since the ack → fingerprint no longer matches
              liveResidue  = [{id: 'a', reason: 'embedding-context-exceeded'}, {id: 'c', reason: 'document-absent'}],
              result       = classifyRepairResidue({residue: liveResidue, ack, ...CTX});

        expect(result.outcome).toBe('escalate');
        expect(result.reasonCode).toBe('unacknowledged-or-stale-terminal-residue');
    });

    test('the fingerprint is order-independent — a re-ordered residue still matches the ack', () => {
        const ordered   = [{id: 'a', reason: 'document-absent'}, {id: 'b', reason: 'embedding-context-exceeded'}],
              reordered = [{id: 'b', reason: 'embedding-context-exceeded'}, {id: 'a', reason: 'document-absent'}],
              result    = classifyRepairResidue({residue: reordered, ack: ackFor(ordered), ...CTX});

        expect(result.outcome).toBe('accepted-loss');
    });

    test('a strategy/provider/context change invalidates the ack (the emergent-invalidation rule)', () => {
        const residue = [{id: 'a', reason: 'embedding-context-exceeded'}],
              ack     = ackFor(residue, {strategyVersion: 'v1', provider: 'openAiCompatible', contextBudget: 32768});

        // oversized-doc chunking ships → strategyVersion bumps → the old ack no longer matches → escalate (re-ack needed).
        const result = classifyRepairResidue({residue, ack, strategyVersion: 'v2-chunking', provider: 'openAiCompatible', contextBudget: 32768});

        expect(result.outcome).toBe('escalate');
        expect(result.reasonCode).toBe('unacknowledged-or-stale-terminal-residue');
    });

    test('a terminality-POLICY change since the ack -> escalate (the fingerprint binds the policy, not just residue+strategy)', () => {
        // Residue is terminal under BOTH policies, but the ack was minted under the broader policy.
        const residue = [{id: 'a', reason: 'document-absent'}],
              ack     = {fingerprint: computeResidueFingerprint({residue, ...CTX, terminalReasons: ['embedding-context-exceeded', 'document-absent']})},
              // policy narrowed to {document-absent} (still terminal for this residue) → the old ack must NOT carry over
              result  = classifyRepairResidue({residue, ack, ...CTX, terminalReasons: ['document-absent']});

        expect(result.outcome).toBe('escalate');
        expect(result.reasonCode).toBe('unacknowledged-or-stale-terminal-residue');
    });

    test('empty residue -> no-residue (the caller treats it as clean, not an escalation)', () => {
        const result = classifyRepairResidue({residue: [], ack: null, ...CTX});

        expect(result.outcome).toBe('no-residue');
        expect(result.reasonCode).toBe('no-residue');
        expect(result.fingerprint).toBeNull();
    });

    test('TERMINAL_REASONS is frozen + a custom terminalReasons whitelist is respected', () => {
        expect(Object.isFrozen(TERMINAL_REASONS)).toBe(true);
        expect(TERMINAL_REASONS).toContain('embedding-context-exceeded');

        // A caller can narrow the whitelist; a previously-terminal reason then escalates.
        const residue = [{id: 'a', reason: 'document-absent'}],
              result  = classifyRepairResidue({residue, ack: ackFor(residue), terminalReasons: ['embedding-context-exceeded'], ...CTX});

        expect(result.outcome).toBe('escalate');
        expect(result.nonTerminalReasons).toEqual(['document-absent']);
    });
});
