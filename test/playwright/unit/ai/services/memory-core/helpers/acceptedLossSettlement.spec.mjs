import {test, expect}                                               from '@playwright/test';
import Neo                                                          from '../../../../../../../src/Neo.mjs';
import * as core                                                    from '../../../../../../../src/core/_export.mjs';
import {decideAcceptedLossSettlement, DEFAULT_SYSTEMIC_FAULT_BOUND} from '../../../../../../../ai/services/memory-core/helpers/acceptedLossSettlement.mjs';
import {computeResidueFingerprint, TERMINAL_REASONS}                from '../../../../../../../ai/services/memory-core/helpers/classifyRepairResidue.mjs';

// Pure AUTONOMOUS decider (no operator, no runtime escalate). Decides clean / heal-path / systemic-fault /
// auto-settle for a repair's unrecoverable residue, bounded by a systemic-fault threshold.

const CTX = {strategyVersion: 'v1', provider: 'openAiCompatible', contextBudget: 32768};

test.describe('decideAcceptedLossSettlement — autonomous accepted-loss disposition', () => {
    test('no residue → clean (no settlement, no escalate)', () => {
        expect(decideAcceptedLossSettlement({residue: [], collectionSize: 1000, ...CTX}))
            .toMatchObject({disposition: 'clean', reasonCode: 'no-residue', auditRecord: null});
    });

    test('any transient/healable reason → heal-path (route to the actuator, never silent-accept)', () => {
        const residue = [{id: 'a', reason: 'embedding-context-exceeded'}, {id: 'b', reason: 'provider-timeout'}],
              result  = decideAcceptedLossSettlement({residue, collectionSize: 1000, ...CTX});

        expect(result.disposition).toBe('heal-path');
        expect(result.nonTerminalReasons).toEqual(['provider-timeout']);
        expect(result.auditRecord).toBeNull();
    });

    test('all-terminal + bounded → auto-settle with a durable audit record (no ack, no escalate)', () => {
        const residue = [{id: 'a', reason: 'embedding-context-exceeded'}, {id: 'b', reason: 'document-absent'}],
              result  = decideAcceptedLossSettlement({residue, collectionSize: 10000, ...CTX});

        expect(result.disposition).toBe('auto-settle');
        expect(result.reasonCode).toBe('bounded-terminal-residue-auto-accepted');
        expect(result.auditRecord).toMatchObject({
            schemaVersion : 1,
            type          : 'auto-accepted-loss',
            acceptedIds   : ['a', 'b'],
            residueCount  : 2,
            collectionSize: 10000
        });
        // the audit fingerprint is leaf-1's shared hash → auto-reopens on a capability change
        expect(result.auditRecord.fingerprint).toBe(
            computeResidueFingerprint({residue, ...CTX, terminalReasons: TERMINAL_REASONS})
        );
    });

    test('all-terminal but over the ratio bound → systemic-fault (freeze + record, never mass auto-settle)', () => {
        // 60 terminal rows in a 1000-row collection = 6% > the 5% default ratio bound.
        const residue = Array.from({length: 60}, (_, i) => ({id: `x${i}`, reason: 'document-absent'})),
              result  = decideAcceptedLossSettlement({residue, collectionSize: 1000, ...CTX});

        expect(result.disposition).toBe('systemic-fault');
        expect(result.reasonCode).toBe('terminal-residue-over-systemic-fault-bound');
        expect(result.auditRecord).toBeNull();
        expect(result.bound).toMatchObject({residueCount: 60, collectionSize: 1000, maxRatio: 0.05});
    });

    test('all-terminal but over the absolute bound → systemic-fault even when the ratio is tiny', () => {
        // 150 terminal rows but in a huge 1,000,000-row collection (0.015% ratio) → still systemic by maxAbsolute.
        const residue = Array.from({length: 150}, (_, i) => ({id: `x${i}`, reason: 'embedding-context-exceeded'})),
              result  = decideAcceptedLossSettlement({residue, collectionSize: 1_000_000, ...CTX});

        expect(result.disposition).toBe('systemic-fault');
        expect(result.bound.maxAbsolute).toBe(DEFAULT_SYSTEMIC_FAULT_BOUND.maxAbsolute);
    });

    test('a custom (tighter) systemic-fault bound flips a small terminal residue to systemic-fault', () => {
        const residue = [{id: 'a', reason: 'document-absent'}, {id: 'b', reason: 'document-absent'}],
              result  = decideAcceptedLossSettlement({residue, collectionSize: 1000, systemicFaultBound: {maxRatio: 0.001, maxAbsolute: 1}, ...CTX});

        expect(result.disposition).toBe('systemic-fault');
    });

    test('the audit record is order-independent (sorted acceptedIds + fingerprint)', () => {
        const ordered   = [{id: 'a', reason: 'document-absent'}, {id: 'b', reason: 'embedding-context-exceeded'}],
              reordered = [{id: 'b', reason: 'embedding-context-exceeded'}, {id: 'a', reason: 'document-absent'}],
              r1        = decideAcceptedLossSettlement({residue: ordered, collectionSize: 10000, ...CTX}),
              r2        = decideAcceptedLossSettlement({residue: reordered, collectionSize: 10000, ...CTX});

        expect(r1.auditRecord.acceptedIds).toEqual(['a', 'b']);
        expect(r1.auditRecord.fingerprint).toBe(r2.auditRecord.fingerprint);
    });
});
