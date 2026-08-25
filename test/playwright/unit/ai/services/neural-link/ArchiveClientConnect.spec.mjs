import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';

import {
    resetArchiveClient,
    saveTransactionArchive,
    setArchiveConnect
} from '../../../../../../ai/services/neural-link/memoryCoreArchiveClient.mjs';

/**
 * @summary The archive client's CONNECT lifecycle: who owns a failure, how many clients a burst of callers
 * opens, and what happens to a handshake that finishes after nobody is waiting for it.
 *
 * These are the properties `setArchiveTransport` cannot reach. That seam replaces `call`, so every arm
 * below it observes a client that already exists — single-flight, deadline expiry and orphan cleanup are
 * only observable where the client is BUILT. `setArchiveConnect` names the constructor instead, which is
 * also why no arm here needs a Memory Core credential.
 *
 * The stand-in client is deliberately not a mock of `Client`: the contract this module depends on is three
 * members wide — `ready()` settles when the attempt finishes, `initError` says whether it worked, and
 * `close()` releases the transport. Anything richer would assert the MCP SDK rather than this lifecycle.
 */
test.describe('Neural Link archive client connect lifecycle', () => {
    /**
     * Builds a stand-in client that settles when told and reports the outcome it was given.
     * @param {Object} [options]
     * @param {Number} [options.settleAfter=0] Milliseconds until `ready()` settles.
     * @param {Error|null} [options.initError=null] The failure initialization captured, if any.
     * @returns {Object} The stand-in, carrying `closeCount` and `callCount`.
     */
    function makeClient({settleAfter = 0, initError = null} = {}) {
        const instance = {closeCount: 0, callCount: 0, initError: null};

        // Mirrors `ArchiveMcpClient`: the failure is a PROPERTY set before ready settles, never a throw —
        // a stand-in that rejected `ready()` would test a shape the framework cannot produce.
        instance.readyPromise = new Promise(resolve => setTimeout(() => {
            instance.initError = initError;
            resolve()
        }, settleAfter));

        instance.ready    = () => instance.readyPromise;
        instance.close    = async () => { instance.closeCount++ };
        instance.callTool = async operation => {
            instance.callCount++;

            return {content: [{text: JSON.stringify({saved: true, archiveId: `archive-for-${operation}`})}]}
        };

        return instance
    }

    test.afterEach(async () => {
        await resetArchiveClient()
    });

    test('a connect failure is reported as the failure it actually was', async () => {
        const created = [];

        setArchiveConnect({
            deadlineMs  : 500,
            createClient: () => {
                const next = makeClient({settleAfter: 5, initError: new Error('ingress refused the handshake')});

                created.push(next);

                return next
            }
        });

        const result = await saveTransactionArchive({transaction: {id: 't-refused'}});

        expect(result.saved).toBe(false);
        expect(result.reason).toContain('ingress refused the handshake');
        expect(created).toHaveLength(1);

        // This arm is the POSITIVE CONTROL for the one below it. A refusal reason that tracks the client's
        // OWN error proves the module can name a cause other than its deadline — without it, "the reason
        // was the deadline" would hold for a module that could only ever say that.
    });

    test('a handshake that never settles is refused by the deadline and by nothing else', async () => {
        setArchiveConnect({deadlineMs: 40, createClient: () => makeClient({settleAfter: 140})});

        const result = await saveTransactionArchive({transaction: {id: 't-stalled'}});

        expect(result.saved).toBe(false);
        expect(result.reason).toContain('did not settle within 40ms');
        expect(result.reason).toContain('unreachable ingress or a stalled handshake');

        // TOGETHER WITH THE ARM ABOVE this is the discrimination that matters: a client carrying its own
        // error is refused by THAT error, and one that simply never answers is refused by the deadline. So
        // the reason tracks the cause, and neither arm can be satisfied by a module with one fixed answer.
        //
        // The complementary property — that an UNRELATED subsystem's rejection is never reported here — is
        // pinned in `relocationInvariants.spec.mjs` as a source-shape zero rather than behaviourally. It is
        // the stronger form: claiming a rejection requires registering a process listener, so a directory
        // with no registration cannot claim one. It is also the only runnable form. The previous shape's
        // listener could only be exercised by an `unhandledRejection` reaching the process, and the test
        // harness installs its own listener for exactly that event — a real floating rejection and an
        // emitted one both fail the surrounding test before any assertion here runs. Measured, not assumed.
    });

    test('two simultaneous first callers share ONE client', async () => {
        let created = 0;

        const seam = () => setArchiveConnect({
            deadlineMs  : 500,
            createClient: () => {
                created++;

                return makeClient({settleAfter: 20})
            }
        });

        seam();

        const results = await Promise.all([
            saveTransactionArchive({transaction: {id: 'a'}}),
            saveTransactionArchive({transaction: {id: 'b'}}),
            saveTransactionArchive({transaction: {id: 'c'}})
        ]);

        expect(results.map(result => result.saved)).toEqual([true, true, true]);
        expect(created).toBe(1);

        // POSITIVE CONTROL: the counter is capable of moving. Without this, a factory that was never
        // called at all — a seam wired to the wrong slot, say — would satisfy `created === 1` never and
        // `created === 0` silently; and a counter stuck at 1 would satisfy the assertion above forever.
        await resetArchiveClient();
        seam();

        await saveTransactionArchive({transaction: {id: 'd'}});

        expect(created).toBe(2)
    });

    test('a late handshake is closed rather than left holding a transport', async () => {
        const created = [];

        setArchiveConnect({
            deadlineMs  : 30,
            createClient: () => {
                const next = makeClient({settleAfter: 120});

                created.push(next);

                return next
            }
        });

        const result = await saveTransactionArchive({transaction: {id: 't-late'}});

        expect(result.saved).toBe(false);
        expect(result.reason).toContain('did not settle within 30ms');
        expect(created).toHaveLength(1);

        // Not closed YET — at the moment the caller was answered the handshake was still in flight, which
        // is precisely the window in which the orphan is created.
        expect(created[0].closeCount).toBe(0);

        await created[0].ready();
        await new Promise(resolve => setTimeout(resolve, 10));

        // Closed once it finished. A client completing after its caller gave up would otherwise hold a
        // transport nothing can reach, because a timed-out attempt is never cached.
        expect(created[0].closeCount).toBe(1)
    });

    test('a timed-out attempt is retried rather than inherited', async () => {
        const created = [];

        setArchiveConnect({
            deadlineMs  : 40,
            createClient: () => {
                const next = makeClient({settleAfter: created.length === 0 ? 200 : 5});

                created.push(next);

                return next
            }
        });

        const first  = await saveTransactionArchive({transaction: {id: 'first'}}),
              second = await saveTransactionArchive({transaction: {id: 'second'}});

        expect(first.saved).toBe(false);
        expect(second.saved).toBe(true);

        // A second client, not the abandoned one: caching a failed attempt would make every later call
        // fail against a connection that never completed, and the failure would read as a server problem.
        expect(created).toHaveLength(2);
        expect(created[0].callCount).toBe(0);
        expect(created[1].callCount).toBe(1)
    })
});
