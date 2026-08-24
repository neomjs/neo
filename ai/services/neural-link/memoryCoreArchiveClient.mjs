import Neo from '../../../src/Neo.mjs';

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
 * A failed connect is not cached — the next call retries rather than inheriting a dead client.
 */

/**
 * How long a connect attempt may stay unsettled before it is called a failure.
 *
 * `ready()` has no reject path of its own — it is settled by `afterSetIsReady`, so an unreachable ingress
 * or a stalled handshake produces a PENDING promise rather than an error. Without a deadline this module
 * would hang the caller instead of refusing it, which is the opposite of the ledger's requirement that an
 * unreachable Memory Core fail loud with a named reason. Overridable per call for tests.
 * @type {Number}
 */
export const CONNECT_DEADLINE_MS = 5000;

/**
 * The live client, or `null` before the first successful connect / after a failure.
 * @type {Object|null}
 */
let client = null;

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
 * @summary Resolves the shared Memory Core client, connecting on first use.
 * @returns {Promise<Object>} A ready client.
 * @throws {Error} when the connection cannot be established — the caller turns this into a named refusal.
 */
async function getClient({deadlineMs = CONNECT_DEADLINE_MS} = {}) {
    if (client) {
        return client;
    }

    // DYNAMIC import, and it is load-bearing rather than stylistic. Importing the MCP client statically
    // pulls its transport stack in at module load, so merely importing `RecorderService` — which every
    // Neural Link unit spec does — starts connection machinery and hangs the suite before a single
    // assertion runs. Measured: two specs that pass on `dev` never terminated. The host's own SQLite
    // access was dynamic for the same class of reason.
    const {default: Client} = await import('../../mcp/client/Client.mjs'),
          next              = Neo.create(Client, {
              clientName: 'Neo.ai.NeuralLink.ArchiveClient',
              serverName: 'memory-core',
              env       : process.env
          }),
          ready = next.ready();

    // `Neo.create` runs `initAsync` DETACHED, so a rejected credential or handshake surfaces as an
    // unhandled rejection — fatal under Node's default policy. Attaching a no-op handler keeps the
    // rejection observable to the race below without letting it take down a long-lived host process that
    // was only trying to archive a transaction.
    ready.catch(() => {});

    let timer;

    try {
        await Promise.race([
            ready,
            new Promise((resolve, reject) => {
                timer = setTimeout(() => reject(new Error(
                    `Memory Core connection did not settle within ${deadlineMs}ms — unreachable ingress or a ` +
                    `stalled handshake. Framework readiness cannot report which, because initialization ` +
                    `rejection is not wired into it.`
                )), deadlineMs);
            })
        ]);
    } finally {
        clearTimeout(timer);
    }

    // Assigned only after `ready()` settles: caching a half-open client would make every later call fail
    // against a connection that never completed, and the failure would look like a server problem. A
    // timed-out attempt is deliberately NOT cached, so the next call retries rather than inheriting it.
    client = next;

    return client;
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
 * @summary Reads one archived transaction back.
 * @param {Object} options
 * @param {String} options.archiveId
 * @returns {Promise<Object|null>} The archive record, or `null` when unknown or unreachable.
 */
export async function getTransactionArchive({archiveId} = {}) {
    if (typeof archiveId !== 'string' || archiveId === '') {
        return null;
    }

    try {
        return await call('get_nl_transaction', {archiveId});
    } catch (error) {
        // `null` is the contract's "no archive" answer and an unreachable store cannot produce one, so
        // the caller correctly refuses the replay with `archive-not-found` rather than replaying nothing.
        return null;
    }
}

/**
 * @summary Marks one archive as replayed.
 * @param {Object} options
 * @param {String} options.archiveId
 * @returns {Promise<Object>} `{updated: Boolean}`.
 */
export async function recordTransactionReplay({archiveId} = {}) {
    if (typeof archiveId !== 'string' || archiveId === '') {
        return {updated: false};
    }

    try {
        return await call('mark_nl_transaction_replayed', {archiveId});
    } catch (error) {
        return {updated: false};
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
    injectedCall = null;

    await current?.close?.();
}
