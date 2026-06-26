import {test, expect} from '@playwright/test';
import os             from 'os';
import fs             from 'fs/promises';
import path           from 'path';
import Neo            from '../../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../../src/core/_export.mjs';
import {
    appendAcceptedLossAck,
    getAcceptedLossAckFileName,
    readAcceptedLossAckByFingerprint
}                                  from '../../../../../../../ai/services/memory-core/helpers/acceptedLossAckStore.mjs';
import {createAcceptedLossAckEntry} from '../../../../../../../ai/services/memory-core/helpers/acceptedLossAck.mjs';
import {classifyRepairResidue}      from '../../../../../../../ai/services/memory-core/helpers/classifyRepairResidue.mjs';

// Durable per-fingerprint JSONL store for operator accepted-loss acks. The end-to-end test is the
// contract: an ack built (the ack constructor) + stored here is found by fingerprint and accepted by the
// classifier — closing the produce -> store -> classify loop; a missing/stale ack returns null -> escalate.

const CTX = {strategyVersion: 'v1', provider: 'openAiCompatible', contextBudget: 32768};

test.describe('acceptedLossAckStore — durable per-fingerprint ack persistence', () => {
    let dir;

    test.beforeEach(async () => {
        dir = await fs.mkdtemp(path.join(os.tmpdir(), 'neo-accepted-loss-ack-'));
    });

    test.afterEach(async () => {
        await fs.rm(dir, {recursive: true, force: true});
    });

    test('ROUND-TRIP: an ack stored here is retrieved by fingerprint', async () => {
        const residue = [{id: 'a', reason: 'embedding-context-exceeded'}],
              ack     = createAcceptedLossAckEntry({residue, operatorId: '@tobiu', acknowledgedAt: 1000, ...CTX});

        await appendAcceptedLossAck({entry: ack, dir});
        const found = await readAcceptedLossAckByFingerprint({fingerprint: ack.fingerprint, dir});

        expect(found).not.toBeNull();
        expect(found.fingerprint).toBe(ack.fingerprint);
        expect(found.operatorId).toBe('@tobiu');
    });

    test('END-TO-END: a stored ack lets the classifier settle the live residue as accepted-loss', async () => {
        const residue = [{id: 'a', reason: 'embedding-context-exceeded'}, {id: 'b', reason: 'document-absent'}],
              ack     = createAcceptedLossAckEntry({residue, operatorId: '@tobiu', acknowledgedAt: 1000, ...CTX});

        await appendAcceptedLossAck({entry: ack, dir});

        const stored  = await readAcceptedLossAckByFingerprint({fingerprint: ack.fingerprint, dir}),
              verdict = classifyRepairResidue({residue, ack: stored, ...CTX});

        expect(verdict.outcome).toBe('accepted-loss');
        expect(verdict.reasonCode).toBe('terminal-residue-acknowledged');
    });

    test('a re-acknowledgement supersedes: read returns the most-recent ack for the fingerprint', async () => {
        const residue = [{id: 'a', reason: 'document-absent'}],
              first   = createAcceptedLossAckEntry({residue, operatorId: '@tobiu', acknowledgedAt: 1000, recoveryRunId: 'run-1', ...CTX}),
              second  = createAcceptedLossAckEntry({residue, operatorId: '@tobiu', acknowledgedAt: 2000, recoveryRunId: 'run-2', ...CTX});

        await appendAcceptedLossAck({entry: first,  dir});
        await appendAcceptedLossAck({entry: second, dir});

        const found = await readAcceptedLossAckByFingerprint({fingerprint: first.fingerprint, dir});

        expect(found.recoveryRunId).toBe('run-2');     // newest line wins
        expect(found.acknowledgedAt).toBe(2000);
    });

    test('no stored ack for a fingerprint -> null (the classifier then escalates)', async () => {
        expect(await readAcceptedLossAckByFingerprint({fingerprint: 'deadbeef'.repeat(8), dir})).toBeNull();
    });

    test('a residue change yields a different fingerprint -> the old ledger is not found', async () => {
        const residue = [{id: 'a', reason: 'embedding-context-exceeded'}],
              ack     = createAcceptedLossAckEntry({residue, operatorId: '@tobiu', acknowledgedAt: 1000, ...CTX});

        await appendAcceptedLossAck({entry: ack, dir});

        const changedAck = createAcceptedLossAckEntry({
            residue   : [{id: 'a', reason: 'embedding-context-exceeded'}, {id: 'c', reason: 'document-absent'}],
            operatorId: '@tobiu', acknowledgedAt: 1000, ...CTX
        });

        expect(ack.fingerprint).not.toBe(changedAck.fingerprint);
        expect(await readAcceptedLossAckByFingerprint({fingerprint: changedAck.fingerprint, dir})).toBeNull();
    });

    test('the ledger file name is the sanitized fingerprint (path separators neutralized)', () => {
        expect(getAcceptedLossAckFileName('abc123')).toBe('abc123.jsonl');
        expect(getAcceptedLossAckFileName('a/b..c')).toBe('a_b..c.jsonl');
    });

    test('rejects missing dir / missing entry.fingerprint', async () => {
        await expect(appendAcceptedLossAck({entry: {fingerprint: 'x'}})).rejects.toThrow('dir');
        await expect(appendAcceptedLossAck({entry: {}, dir})).rejects.toThrow('fingerprint');
    });
});
