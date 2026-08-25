import logger from '../../mcp/server/neural-link/logger.mjs';

/**
 * @module ai/services/neural-link/memoryCoreArchiveClient
 * @summary The host side of the Neural Link data relocation: an outbound, authenticated Memory Core
 * client that replaces the SQLite file `RecorderService` used to open directly.
 *
 * **Direction is the security axis, not transport.** Every call here is host→container: the host asks,
 * the container answers. That is an ordinary authenticated client call. The inverse — container→host —
 * would be remote code execution on a developer machine, because Neural Link owns `patch_code`,
 * `create_component` and `simulate_event`. Nothing in this module opens a listener, and a response
 * carrying archive data is a reply rather than container-initiated access.
 *
 * **No host-local fallback, deliberately.** When Memory Core is unreachable, an archive write FAILS with
 * a named reason. Writing to a local file instead would be the friendlier-looking choice and would
 * re-create exactly the two realities this relocation removes: data accumulating somewhere nothing else
 * reads, with a replay whose success depends on which checkout happened to run it.
 *
 * **One client, reused.** The connection is created on first use and kept, because the archive path is
 * called once per committed transaction and a per-call connect would pay handshake cost on a hot path.
 * The IN-FLIGHT attempt is cached too, not just the finished client, so concurrent first callers share one
 * handshake. A failed connect is not cached — the next call retries rather than inheriting a dead client.
 *
 * **No `Neo` import, deliberately.** This module is a library, not a process entrypoint: it defines no
 * class of its own and nothing runs it directly. Entrypoints import `Neo` together with the core and boot
 * the framework; a non-entrypoint that imports the framework ROOT alone declares a dependency it does not
 * own and half-states one it does. The `Neo` referenced below is the framework global, and the dynamic
 * `ArchiveMcpClient` import is the edge that guarantees it — that class extends `Client`, which imports
 * `src/core/Base.mjs`. Every sibling service in this directory reaches `Neo.setupClass` the same way.
 */

/**
 * How long a connect attempt may stay unsettled before it is called a failure.
 *
 * `ready()` has no reject path of its own — it is settled by `afterSetIsReady`, so an unreachable ingress
 * or a stalled handshake produces a PENDING promise rather than an error. Without a deadline this module
 * would hang the caller instead of refusing it, which is the opposite of the ledger's requirement that an
 * unreachable Memory Core fail loud with a named reason. Overridable via `setArchiveConnect` for tests.
 * @type {Number}
 */
export const CONNECT_DEADLINE_MS = 5000;

/**
 * The Memory Core server key in `ai/mcp/client/config.mjs`, which owns both the endpoint and the list of
 * environment variables a client for it requires.
 * @type {String}
 */
const SERVER_NAME = 'memory-core';

/**
 * The live client, or `null` before the first successful connect / after a failure.
 * @type {Object|null}
 */
let client = null;

/**
 * The connect attempt currently in flight, or `null` when none is.
 *
 * Caching only the FINISHED client left the window that matters uncovered: every caller arriving during a
 * handshake started its own, so two committed transactions landing together opened two connections and
 * only the last one stayed reachable for `close()`.
 * @type {Promise<Object>|null}
 */
let pending = null;

/**
 * Injected transport, or `null` to use the real Memory Core client.
 *
 * The seam exists because a unit spec must never reach a transport: with a credential present the real
 * client waits on a live connection and the suite HANGS, and without one it fails on a missing variable —
 * neither of which is the behaviour under test. Injecting the caller makes every arm here assert the
 * contract instead of the network, which is the same reason `runFreezeReprobe` takes `probe`/`unfence`
 * and `createFreezeHealOperation` takes `fence`.
 * @type {Function|null}
 */
let injectedCall = null;

/**
 * @summary Injects the operation caller. Test seam — production passes nothing and gets the real client.
 * @param {Function|null} fn `async (operation, args) => payload`, or `null` to restore the real client.
 * @returns {void}
 */
export function setArchiveTransport(fn) {
    injectedCall = typeof fn === 'function' ? fn : null;
}

/**
 * Overrides for the CONNECT lifecycle, or `null` to use the real client and deadline.
 * @type {{createClient: Function|null, deadlineMs: Number|null}|null}
 */
let connectSeam = null;

/**
 * @summary Overrides how a client is constructed and how long it may take. Test seam.
 *
 * `setArchiveTransport` cannot reach these properties: it replaces `call`, so it bypasses the connect
 * lifecycle entirely and every arm below it observes a client that already exists. Single-flight, deadline
 * expiry and orphan cleanup are only observable where the client is BUILT, which is why this seam names
 * the constructor rather than the transport.
 * @param {Object} [options]
 * @param {Function|null} [options.createClient] `() => client`, called once per attempt.
 * @param {Number|null} [options.deadlineMs] Deadline override.
 * @returns {void}
 */
export function setArchiveConnect({createClient = null, deadlineMs = null} = {}) {
    connectSeam = createClient || deadlineMs ? {createClient, deadlineMs} : null;
}

/**
 * @summary Constructs the real archive client, refusing before construction when it cannot be configured.
 * @returns {Promise<Object>} An unsettled client whose `initAsync` is already running.
 * @throws {Error} when the credential the client requires is absent.
 */
async function createRealClient() {
    // DYNAMIC import, and it is load-bearing rather than stylistic. Importing the MCP client statically
    // pulls its transport stack in at module load, so merely importing `RecorderService` — which every
    // Neural Link unit spec does — starts connection machinery and hangs the suite before a single
    // assertion runs. Measured: two specs that pass on `dev` never terminated. The host's own SQLite
    // access was dynamic for the same class of reason.
    const {default: ArchiveMcpClient} = await import('./ArchiveMcpClient.mjs'),
          {default: ClientConfig}     = await import('../../mcp/client/config.mjs'),
          missingEnv                  = (ClientConfig.mcpServers?.[SERVER_NAME]?.requiredEnv ?? [])
              .filter(key => !process.env[key]);

    // PRE-FLIGHT THE CREDENTIAL, and this is not belt-and-braces for the guard below. `Client.initAsync`
    // throws on a missing required variable, and that throw lands on a promise nobody holds — so the only
    // way to report it as a REFUSAL rather than an unhandled rejection is to never construct the client.
    // Every observer sees an unhandled rejection, including a test harness that fails the surrounding test
    // whatever this module does about the default policy. An unconfigured Memory Core is exactly the
    // fail-by-name case the contract already describes, so it needs no rescuing — only naming.
    if (missingEnv.length > 0) {
        throw new Error(
            `Memory Core credential absent: ${missingEnv.join(', ')} not set, so no archive client can be created.`
        )
    }

    // THE FAILURE IS OWNED, not intercepted. `Base` builds its ready promise with a RESOLVER ONLY and
    // awaits `initAsync` in a detached chain, so a refused connection used to reject a promise nobody
    // held — which is why this module once installed a process-wide `unhandledRejection` listener and
    // decided, from the client's `connected` flag alone, whether an arriving rejection was its own. It
    // could not know: any unrelated subsystem failing during the handshake window was claimed as an
    // archive refusal. `ArchiveMcpClient` catches its own `initAsync` throw instead, so the outcome is a
    // property to READ and no other subsystem's failure is ever in scope.
    return Neo.create(ArchiveMcpClient, {
        clientName: 'Neo.ai.NeuralLink.ArchiveClient',
        serverName: SERVER_NAME,
        env       : process.env
    })
}

/**
 * @summary Opens ONE client and waits for it to settle, or fails with a named reason.
 * @param {Number} deadlineMs How long the attempt may stay unsettled.
 * @returns {Promise<Object>} A connected client.
 * @throws {Error} when the connection cannot be established — the caller turns this into a named refusal.
 */
async function connect(deadlineMs) {
    // An injected client short-circuits construction ENTIRELY rather than being substituted at the end:
    // a spec proving the lifecycle has no Memory Core credential, and the pre-flight above would refuse it
    // before its own client was ever built.
    const next = connectSeam?.createClient ? connectSeam.createClient() : await createRealClient();

    let timer;

    try {
        await Promise.race([
            // `ready()` settling means the attempt FINISHED, which is not the same as succeeded.
            next.ready().then(() => {
                if (next.initError) {
                    throw next.initError
                }
            }),
            new Promise((resolve, reject) => {
                timer = setTimeout(() => reject(new Error(
                    `Memory Core connection did not settle within ${deadlineMs}ms — unreachable ingress or a ` +
                    `stalled handshake.`
                )), deadlineMs);
            })
        ]);
    } catch (error) {
        // ORPHAN CLEANUP. A deadline can fire while the handshake is still in flight, and the client that
        // completes afterwards would hold a socket nothing will ever use or close, because the caller was
        // already answered with a refusal and this attempt is never cached. `ready()` always settles now,
        // so this always runs; closing a client that never connected is a no-op by contract.
        next.ready().then(() => next.close?.()).catch(reason => {
            logger.warn(`[NeuralLink] Abandoned archive client did not close: ${reason?.message ?? reason}`)
        });

        throw error
    } finally {
        clearTimeout(timer)
    }

    return next;
}

/**
 * @summary Resolves the shared Memory Core client, connecting on first use.
 * @returns {Promise<Object>} A ready client.
 * @throws {Error} when the connection cannot be established — the caller turns this into a named refusal.
 */
async function getClient() {
    if (client) {
        return client;
    }

    // SINGLE-FLIGHT. The in-flight attempt is the cache during the only window where callers can collide;
    // caching just the finished client left every caller arriving mid-handshake to start its own. The
    // client is published only once the attempt SUCCEEDS — a half-open one would make every later call
    // fail against a connection that never completed, and the failure would read as a server problem.
    // A settled attempt clears the slot, so a failure is retried rather than inherited.
    pending ??= connect(connectSeam?.deadlineMs ?? CONNECT_DEADLINE_MS)
        .then(next => {
            client = next;
            return next
        })
        .finally(() => {
            pending = null
        });

    return await pending;
}

/**
 * @summary Calls one Memory Core operation and unwraps its JSON payload.
 *
 * MCP has two success boundaries and only the first throws: the request resolving means the server
 * answered, while whether it ACCEPTED rides in `isError`. Treating a resolved call as success would
 * report a refused write as a completed one, so `isError` is checked before the payload is read.
 *
 * @param {String} operation Tool name.
 * @param {Object} args Tool arguments.
 * @returns {Promise<*>} The parsed payload.
 * @throws {Error} when the transport fails or the server refuses.
 */
async function call(operation, args) {
    if (injectedCall) {
        return await injectedCall(operation, args);
    }

    const mc     = await getClient(),
          result = await mc.callTool(operation, args);

    if (result?.isError) {
        const detail = result.content?.map(block => block?.text).filter(Boolean).join(' ') || 'no detail supplied';

        throw new Error(`Memory Core refused '${operation}': ${detail}`);
    }

    const text = result?.content?.map(block => block?.text).filter(Boolean).join('') || '';

    if (text === '') {
        return null;
    }

    try {
        return JSON.parse(text);
    } catch (error) {
        // A payload that is not JSON is a contract break, not a value — returning the raw string would
        // push the failure into the caller's field access, where it reads as missing data.
        throw new Error(`Memory Core returned a non-JSON payload for '${operation}'`);
    }
}

/**
 * @summary Archives one committed transaction in the container graph.
 * @param {Object} options
 * @param {String} [options.appSessionId]
 * @param {String} [options.name]
 * @param {Object} options.transaction
 * @returns {Promise<Object>} `{saved: true, archiveId}` or `{saved: false, reason}`.
 */
export async function saveTransactionArchive({appSessionId = null, name = null, transaction} = {}) {
    try {
        return await call('save_nl_transaction', {appSessionId, name, transaction});
    } catch (error) {
        return {saved: false, reason: `archive-store-unavailable: ${error.message}`};
    }
}

/**
 * @summary Reads one archived transaction back, preserving WHY a read produced no record.
 *
 * A transport failure is `unavailable`, never `not-found`. Collapsing the two made a replay report
 * `archive-not-found` for an archive that exists and is simply out of reach — the caller then believes a
 * durable fact is gone, which is the one wrong answer this path can give.
 * @param {Object} options
 * @param {String} options.archiveId
 * @returns {Promise<Object>} `{status: 'found', …record}`, `{status: 'not-found'}`, or
 * `{status: 'unavailable', reason}`.
 */
export async function getTransactionArchive({archiveId} = {}) {
    if (typeof archiveId !== 'string' || archiveId === '') {
        return {status: 'not-found'};
    }

    try {
        const payload = await call('get_nl_transaction', {archiveId});

        // A server that answered with no payload at all is not a server that reported absence. The
        // container always sends a status; a bare `null` here means the reply itself was empty.
        return payload ?? {status: 'unavailable', reason: 'archive-store-unavailable: empty reply'};
    } catch (error) {
        return {status: 'unavailable', reason: `archive-store-unavailable: ${error.message}`};
    }
}

/**
 * @summary Marks one archive as replayed, reporting WHY a mark did not land.
 *
 * The caller has already replayed by the time this runs, so a bare `{updated: false}` left it unable to
 * say whether the replay went unrecorded because the archive was gone or because the store was
 * unreachable — and unable to tell the user anything at all.
 * @param {Object} options
 * @param {String} options.archiveId
 * @returns {Promise<Object>} `{updated: true, replayCount, lastReplayedAt}`, or
 * `{updated: false, status, reason?}`.
 */
export async function recordTransactionReplay({archiveId} = {}) {
    if (typeof archiveId !== 'string' || archiveId === '') {
        return {updated: false, status: 'not-found'};
    }

    try {
        const payload = await call('mark_nl_transaction_replayed', {archiveId});

        return payload ?? {updated: false, status: 'unavailable', reason: 'archive-store-unavailable: empty reply'};
    } catch (error) {
        return {updated: false, status: 'unavailable', reason: `archive-store-unavailable: ${error.message}`};
    }
}

/**
 * @summary Admits a bounded batch of action telemetry. Write-only by contract.
 * @param {Object} options
 * @param {Object[]} options.actions
 * @returns {Promise<Object>} `{admitted, refused}`.
 */
export async function admitActions({actions = []} = {}) {
    try {
        return await call('admit_nl_actions', {actions});
    } catch (error) {
        // Telemetry is observability and must never take down a possession session: a failed admission
        // is counted as refused, never thrown at the caller that produced the action.
        return {admitted: 0, refused: Array.isArray(actions) ? actions.length : 0};
    }
}

/**
 * @summary Drops the cached client. Test seam — a suite must not inherit another arm's connection.
 * @returns {Promise<void>}
 */
export async function resetArchiveClient() {
    const current = client;

    client       = null;
    pending      = null;
    injectedCall = null;
    connectSeam  = null;

    await current?.close?.();
}
