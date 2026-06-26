import {test, expect}                                     from '@playwright/test';
import Neo                                                from '../../../../../../../src/Neo.mjs';
import * as core                                          from '../../../../../../../src/core/_export.mjs';
import {createAcceptedLossAckEntry}                       from '../../../../../../../ai/services/memory-core/helpers/acceptedLossAck.mjs';
import {classifyRepairResidue, computeResidueFingerprint, TERMINAL_REASONS} from '../../../../../../../ai/services/memory-core/helpers/classifyRepairResidue.mjs';

// Pure ack constructor. Packages the shared residue fingerprint + operator metadata into a durable
// accepted-loss-ack record — the suppression key the classifier reads. The round-trip test is the
// contract: an ack built here is accepted by the classifier iff the live residue still matches.

const CTX = {strategyVersion: 'v1', provider: 'openAiCompatible', contextBudget: 32768};

test.describe('createAcceptedLossAckEntry — durable accepted-loss acknowledgement', () => {
    test('ROUND-TRIP: an ack built here is accepted by the classifier as accepted-loss', () => {
        const residue = [{id: 'a', reason: 'embedding-context-exceeded'}, {id: 'b', reason: 'document-absent'}],
              ack     = createAcceptedLossAckEntry({residue, operatorId: '@tobiu', acknowledgedAt: 1000, ...CTX}),
              verdict = classifyRepairResidue({residue, ack, ...CTX});

        expect(verdict.outcome).toBe('accepted-loss');
        expect(verdict.reasonCode).toBe('terminal-residue-acknowledged');
    });

    test('the ack fingerprint equals computeResidueFingerprint over the same residue + context', () => {
        const residue = [{id: 'a', reason: 'embedding-context-exceeded'}],
              ack     = createAcceptedLossAckEntry({residue, operatorId: '@tobiu', acknowledgedAt: 1000, ...CTX});

        expect(ack.fingerprint).toBe(computeResidueFingerprint({residue, ...CTX, terminalReasons: TERMINAL_REASONS}));
    });

    test('the record is typed + carries sorted acknowledgedIds + operator provenance', () => {
        const residue = [{id: 'b', reason: 'document-absent'}, {id: 'a', reason: 'embedding-context-exceeded'}],
              ack     = createAcceptedLossAckEntry({residue, operatorId: '@tobiu', acknowledgedAt: 1750, recoveryRunId: 'run-7', ...CTX});

        expect(ack).toMatchObject({
            schemaVersion  : 1,
            type           : 'accepted-loss-ack',
            residueCount   : 2,
            acknowledgedIds: ['a', 'b'],   // sorted, order-independent of input
            operatorId     : '@tobiu',
            acknowledgedAt : 1750,
            recoveryRunId  : 'run-7',
            strategyVersion: 'v1'
        });
    });

    test('a residue change since the ack -> the classifier escalates (stale ack, the emergent-invalidation contract)', () => {
        const ackedResidue = [{id: 'a', reason: 'embedding-context-exceeded'}],
              ack          = createAcceptedLossAckEntry({residue: ackedResidue, operatorId: '@tobiu', acknowledgedAt: 1000, ...CTX}),
              // a new terminal row appeared after the ack
              liveResidue  = [{id: 'a', reason: 'embedding-context-exceeded'}, {id: 'c', reason: 'document-absent'}],
              verdict      = classifyRepairResidue({residue: liveResidue, ack, ...CTX});

        expect(verdict.outcome).toBe('escalate');
        expect(verdict.reasonCode).toBe('unacknowledged-or-stale-terminal-residue');
    });

    test('a strategy change since the ack -> the classifier escalates (re-ack needed)', () => {
        const residue = [{id: 'a', reason: 'embedding-context-exceeded'}],
              ack     = createAcceptedLossAckEntry({residue, operatorId: '@tobiu', acknowledgedAt: 1000, strategyVersion: 'v1', provider: 'openAiCompatible', contextBudget: 32768}),
              verdict = classifyRepairResidue({residue, ack, strategyVersion: 'v2-chunking', provider: 'openAiCompatible', contextBudget: 32768});

        expect(verdict.outcome).toBe('escalate');
    });

    test('the ack BINDS the terminality policy — a policy change since the ack -> the classifier escalates', () => {
        const residue = [{id: 'a', reason: 'document-absent'}],
              // ack minted under the broad default policy (both terminal reasons)
              ack     = createAcceptedLossAckEntry({residue, operatorId: '@tobiu', acknowledgedAt: 1000, ...CTX}),
              // classify under a NARROWED policy (still terminal for this residue) → the ack must not carry over
              verdict = classifyRepairResidue({residue, ack, ...CTX, terminalReasons: ['document-absent']});

        expect(verdict.outcome).toBe('escalate');
        expect(verdict.reasonCode).toBe('unacknowledged-or-stale-terminal-residue');
        // the record carries the policy set (sorted) for provenance
        expect(ack.terminalReasons).toEqual(['document-absent', 'embedding-context-exceeded']);
    });

    test('rejects missing operatorId / non-finite acknowledgedAt', () => {
        expect(() => createAcceptedLossAckEntry({residue: [], acknowledgedAt: 1})).toThrow('operatorId');
        expect(() => createAcceptedLossAckEntry({residue: [], operatorId: '@tobiu'})).toThrow('acknowledgedAt');
    });
});
