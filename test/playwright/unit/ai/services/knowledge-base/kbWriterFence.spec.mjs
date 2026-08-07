import {test, expect} from '@playwright/test';

import {
    buildImportLeaseHeldError,
    buildIngestLeaseHeldRefusal,
    describeHeldLease,
    KB_IMPORT_LEASE_HELD,
    KB_INGEST_LEASE_HELD,
    KB_WRITER_FENCE_OWNERS,
    KB_WRITER_FENCE_STATUS,
    withKbWriterFence
} from '../../../../../../ai/services/knowledge-base/helpers/kbWriterFence.mjs';

/**
 * The Knowledge Base writer fence: refusal contract + same-process re-entrancy.
 *
 * Scope note, stated because it is the honest boundary of this file: these tests prove the fence's
 * DECISION logic — who inherits, who is refused, what a refusal may carry. They do NOT prove that
 * the two boundaries reach the same lock. That is a deployment property: the lease is a file, so
 * two processes are mutually excluded only while both resolve the same path to the same filesystem.
 * A shared mount is what makes that true, and nothing in this file would notice its absence.
 *
 * Read a green run here as "the fence decides correctly", never as "the fence excludes". The
 * mount-coverage guard is the separate artifact that carries the second half.
 */

const lease = Object.freeze({
    owner     : 'kb-merge-import',
    pid       : 4242,
    token     : 'secret-capability-token',
    acquiredAt: '2026-08-07T06:00:00.000Z',
    expiresAt : '2026-08-07T12:00:00.000Z'
});

test.describe('describeHeldLease — bounded projection', () => {
    test('excludes the lease token, which is the capability to RELEASE the lease', () => {
        const described = describeHeldLease(lease);

        // A positive control FIRST: prove the projection carries the fields it is supposed to, so
        // the token assertion below cannot pass merely because the projection returned nothing.
        expect(described.leaseOwner).toBe('kb-merge-import');
        expect(described.leaseExpiresAt).toBe('2026-08-07T12:00:00.000Z');

        // Asserted over the SERIALIZED payload, not `described.token`. A field-absence check passes
        // while a nested copy still ships the value; what reaches the agent is the JSON.
        expect(JSON.stringify(described)).not.toContain('secret-capability-token');
        expect(Object.keys(described)).not.toContain('token');
    });

    test('an absent lease degrades to named unknowns rather than undefined leaking into prose', () => {
        expect(describeHeldLease(null)).toEqual({
            leaseOwner     : 'unknown',
            leaseAcquiredAt: null,
            leaseExpiresAt : null,
            leasePid       : null
        });
    });
});

test.describe('refusal contracts', () => {
    test('the ingest refusal is RETRYABLE and reports zero rows ingested', () => {
        const refusal = buildIngestLeaseHeldRefusal({lease});

        expect(refusal.code).toBe(KB_INGEST_LEASE_HELD);
        expect(refusal.retryable).toBe(true);
        // `ingested: 0` is load-bearing: a caller that reads only the row count must not read a
        // refusal as "nothing left to do".
        expect(refusal.ingested).toBe(0);
        expect(refusal.leaseOwner).toBe('kb-merge-import');
        expect(refusal.message).toContain('2026-08-07T12:00:00.000Z');
        expect(JSON.stringify(refusal)).not.toContain('secret-capability-token');
    });

    test('the import refusal preserves its CODE, not merely its message', () => {
        const error = buildImportLeaseHeldError({lease});

        // The code is the assertion that matters. A wrapper that interpolates `error.message` keeps
        // the prose intact while destroying the code, so matching the message would pass against a
        // refusal that had already been collapsed into a generic failure.
        expect(error.code).toBe(KB_IMPORT_LEASE_HELD);
        expect(error.retryable).toBe(true);
        expect(error.details.leaseOwner).toBe('kb-merge-import');
        expect(error).toBeInstanceOf(Error);
    });

    test('the two writers carry distinct owner strings, so a contention log names WHICH writer holds', () => {
        expect(KB_WRITER_FENCE_OWNERS.ingest).not.toBe(KB_WRITER_FENCE_OWNERS.import);
    });
});

test.describe('withKbWriterFence — same-process re-entrancy', () => {
    /**
     * Builds injectable seams that record what the fence actually called.
     * @param {Object} options
     * @param {Object|null} options.current The `inspect` result to serve.
     * @returns {Object} The seams plus the call log.
     */
    function seams({current}) {
        const calls = {inspect: 0, withLease: 0, task: 0};

        return {
            calls,
            inspect  : async () => { calls.inspect++;   return current },
            withLease: async (task, opts) => {
                calls.withLease++;
                return {status: KB_WRITER_FENCE_STATUS.completed, acquired: true, lease: opts, result: await task({})}
            },
            task: async () => { calls.task++; return 'task-ran' }
        };
    }

    test('a lease held by THIS process is inherited — the task runs and no reacquisition happens', async () => {
        const s       = seams({current: {active: true, lease: {...lease, pid: 777}}});
        const outcome = await withKbWriterFence(s.task, {leasePath: '/x', pid: 777, inspect: s.inspect, withLease: s.withLease});

        expect(outcome.status).toBe(KB_WRITER_FENCE_STATUS.inheritedInProcess);
        expect(outcome.result).toBe('task-ran');
        expect(s.calls.task).toBe(1);
        // The whole point: reacquiring would refuse against our own holder. `ingestTenant.mjs`
        // acquires the heavy lease and then calls the ingest service in the same process, so a
        // reacquisition here is a self-deadlock, not a redundant call.
        expect(s.calls.withLease).toBe(0);
    });

    test('a lease held by ANOTHER process is not inherited — it delegates and can refuse', async () => {
        const s = seams({current: {active: true, lease: {...lease, pid: 999}}});

        s.withLease = async () => ({status: KB_WRITER_FENCE_STATUS.held, acquired: false, lease});

        const outcome = await withKbWriterFence(s.task, {leasePath: '/x', pid: 777, inspect: s.inspect, withLease: s.withLease});

        expect(outcome.status).toBe(KB_WRITER_FENCE_STATUS.held);
        // The task must NOT have run. A fence that refuses but still writes is worse than no fence.
        expect(s.calls.task).toBe(0);
    });

    test('an INACTIVE lease owned by this pid is not inherited — expiry is not ownership', async () => {
        // The pid matches, so a pid-only check would inherit. `active` is what makes it a holder;
        // inheriting a dead lease would run the task with no lease held at all while reporting that
        // one was inherited.
        const s       = seams({current: {active: false, lease: {...lease, pid: 777}}});
        const outcome = await withKbWriterFence(s.task, {leasePath: '/x', pid: 777, inspect: s.inspect, withLease: s.withLease});

        expect(outcome.status).toBe(KB_WRITER_FENCE_STATUS.completed);
        expect(s.calls.withLease).toBe(1);
    });

    test('no lease at all delegates straight through, and forwards the lease options', async () => {
        const s       = seams({current: {active: false, lease: null}});
        const outcome = await withKbWriterFence(s.task, {
            leasePath: '/x', owner: 'kb-ingest', staleAfterMs: 5, pid: 777, inspect: s.inspect, withLease: s.withLease
        });

        expect(s.calls.withLease).toBe(1);
        expect(outcome.result).toBe('task-ran');
        // The seams must be stripped from what reaches the lease primitive, and the real options
        // must survive — `staleAfterMs` in particular, whose absence the primitive throws on.
        expect(outcome.lease).toEqual({leasePath: '/x', owner: 'kb-ingest', staleAfterMs: 5});
    });
});
