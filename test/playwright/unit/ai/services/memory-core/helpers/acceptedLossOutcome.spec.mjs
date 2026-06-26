import {test, expect}                from '@playwright/test';
import Neo                           from '../../../../../../../src/Neo.mjs';
import * as core                     from '../../../../../../../src/core/_export.mjs';
import {evaluateAcceptedLossOutcome} from '../../../../../../../ai/services/memory-core/helpers/acceptedLossOutcome.mjs';
import {createAcceptedLossAckEntry}  from '../../../../../../../ai/services/memory-core/helpers/acceptedLossAck.mjs';

// Pure decider that joins the classifier + an injected durable-ack lookup + the partial-promotion manifest
// into the single exit-0-vs-escalate decision. allAccepted iff there is >=1 partial collection AND every one
// classifies accepted-loss (all-terminal residue + a matching durable ack under the same recovery context).

const CTX = {strategyVersion: 'v1', provider: 'openAiCompatible', contextBudget: 32768};

// In-memory ack lookup keyed by fingerprint, built from REAL acks so the fingerprints match the helper's.
function ackStoreFrom(...residues) {
    const map = new Map();
    for (const residue of residues) {
        const ack = createAcceptedLossAckEntry({residue, operatorId: '@tobiu', acknowledgedAt: 1000, ...CTX});
        map.set(ack.fingerprint, ack);
    }
    return async fingerprint => map.get(fingerprint) ?? null;
}

const partial = (collectionName, unrecoverable) => ({collectionName, partialPromoted: true, unrecoverable});

test.describe('evaluateAcceptedLossOutcome — operator-acknowledged accepted-loss decider', () => {
    test('every partial collection terminal + acked -> allAccepted', async () => {
        const rA      = [{id: 'a', reason: 'embedding-context-exceeded'}],
              rB      = [{id: 'b', reason: 'document-absent'}],
              readAck = ackStoreFrom(rA, rB);

        const {allAccepted, perCollection} = await evaluateAcceptedLossOutcome({
            partialResults : [partial('mc-memory', rA), partial('neo-native-graph', rB)],
            recoveryContext: CTX,
            readAck
        });

        expect(allAccepted).toBe(true);
        expect(perCollection.every(c => c.outcome === 'accepted-loss')).toBe(true);
    });

    test('a transient reason in any collection -> NOT accepted (that collection escalates)', async () => {
        const rA      = [{id: 'a', reason: 'embedding-context-exceeded'}],
              rB      = [{id: 'b', reason: 'provider-timeout'}],   // transient
              readAck = ackStoreFrom(rA, rB);

        const {allAccepted, perCollection} = await evaluateAcceptedLossOutcome({
            partialResults : [partial('mc-memory', rA), partial('neo-native-graph', rB)],
            recoveryContext: CTX,
            readAck
        });

        expect(allAccepted).toBe(false);
        expect(perCollection.find(c => c.collection === 'neo-native-graph').outcome).toBe('escalate');
    });

    test('a missing ack for any collection -> NOT accepted', async () => {
        const rA      = [{id: 'a', reason: 'embedding-context-exceeded'}],
              rB      = [{id: 'b', reason: 'document-absent'}],
              readAck = ackStoreFrom(rA);   // only A is acknowledged

        const {allAccepted} = await evaluateAcceptedLossOutcome({
            partialResults : [partial('mc-memory', rA), partial('neo-native-graph', rB)],
            recoveryContext: CTX,
            readAck
        });

        expect(allAccepted).toBe(false);
    });

    test('zero partial-promoted collections -> NOT accepted (nothing was acknowledged)', async () => {
        const {allAccepted} = await evaluateAcceptedLossOutcome({
            partialResults: [], recoveryContext: CTX, readAck: async () => null
        });

        expect(allAccepted).toBe(false);
    });

    test('a recovery-context (policy) mismatch -> the acked fingerprint differs -> NOT accepted', async () => {
        const rA      = [{id: 'a', reason: 'document-absent'}],
              readAck = ackStoreFrom(rA);   // acked under the broad default terminality policy

        const {allAccepted} = await evaluateAcceptedLossOutcome({
            partialResults : [partial('mc-memory', rA)],
            recoveryContext: {...CTX, terminalReasons: ['document-absent']},   // narrowed policy → different fingerprint
            readAck
        });

        expect(allAccepted).toBe(false);
    });

    test('a single acked terminal collection -> allAccepted, with the per-collection fingerprint surfaced', async () => {
        const rA      = [{id: 'a', reason: 'document-absent'}],
              readAck = ackStoreFrom(rA);

        const {allAccepted, perCollection} = await evaluateAcceptedLossOutcome({
            partialResults: [partial('mc-memory', rA)], recoveryContext: CTX, readAck
        });

        expect(allAccepted).toBe(true);
        expect(perCollection[0]).toMatchObject({collection: 'mc-memory', outcome: 'accepted-loss'});
        expect(perCollection[0].fingerprint).toEqual(expect.any(String));
    });
});
