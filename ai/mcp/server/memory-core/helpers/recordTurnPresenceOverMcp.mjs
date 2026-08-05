import {Client}                        from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';

/**
 * @module ai/mcp/server/memory-core/helpers/recordTurnPresenceOverMcp
 * @summary Records a turn-presence beacon through the Memory Core's MCP surface, so the write lands in
 * the store the deployment actually serves.
 *
 * Pure collaborator: every value it needs is INJECTED, nothing is resolved here. The entrypoint — the
 * harness hook adapter — reads the config leaves once and passes them in, mirroring
 * {@link module:ai/daemons/wake/readSubscriptionsOverMcp} and the `wakeArmingHook` entrypoint that
 * feeds it. Resolving a leaf at module scope here would re-derive config in a module that is not a
 * thread entrypoint — the exact shape that is not permitted to read the config singleton, and the one
 * that made the writer this replaces resolve a path of its own in the first place.
 */

/**
 * Budget for the whole exchange (connect + call), not per stage.
 * @type {Number}
 */
export const DEFAULT_TIMEOUT_MS = 8000;

/**
 * @summary Extracts the JSON payload an MCP tool returned in its text content block.
 * @param {Object} result A `callTool` result.
 * @returns {*}
 */
export function readToolJson(result) {
    const text = result?.content?.find(entry => entry?.type === 'text')?.text;

    if (typeof text !== 'string' || !text.trim()) {
        throw new Error('The MCP tool returned no text content to parse')
    }

    return JSON.parse(text)
}

/**
 * @summary Records one turn-presence event over MCP, targeting the served store rather than a path.
 *
 * This exists instead of a direct `better-sqlite3` handle because a host process cannot reach the
 * containerized Memory Core's SQLite at all: `shared-sqlite-data` is a Docker-managed **named volume**
 * (`ai/deploy/docker-compose.yml`), so on macOS it lives inside the Docker Desktop VM and there is no
 * host path to point an env var at. A path-based write therefore lands in the maintainer's *checkout*
 * and **succeeds** — which is the whole failure mode, because a successful write to an unread file is
 * indistinguishable from a working beacon until someone reads liveness and finds `turnPresence: null`.
 * Measured before this module existed: 7192 accumulated intervals from 9 distinct agents sitting in a
 * single maintainer checkout, none of them readable by `who_is_online`. Their newest timestamps land on
 * four different days, which is the tell that each seat writes its own checkout rather than one shared
 * wrong file — the store holds a frozen fragment of every seat that ever ran from it.
 *
 * ## Identity is required here, unlike in the read sibling
 *
 * The server resolves the beacon's owner from the request context, not from the payload. Without
 * `X-PREFERRED-USERNAME` the plane answers as the **credential's** owner, so a shared token would
 * record this turn's presence against somebody else's identity — publishing a peer as mid-turn when
 * they are not. For a read that mistake returns the wrong rows; for a write it corrupts a liveness
 * signal other agents route on. So identity is a hard precondition rather than an optional header, and
 * the caller still verifies agreement against the returned `agentIdentity` rather than trusting the
 * header to have been honoured.
 *
 * @param {Object} options
 * @param {String} options.baseUrl Fully-resolved MCP endpoint, injected by the entrypoint.
 * @param {String} options.identity Seat identity naming WHICH agent this beacon belongs to. Required.
 * @param {'start'|'progress'|'terminal'} [options.action='start'] Event kind.
 * @param {String} [options.credential=''] Bearer credential; empty means a tokenless plane, which
 * decides admission itself and fail-closed.
 * @param {String} [options.note] Bounded diagnostic note.
 * @param {String} [options.source] Hook source identifier.
 * @param {String} [options.terminalState] Terminal state, honoured only when `action` is `terminal`.
 * @param {String} [options.turnId] Explicit turn id; omitted lets the server resolve or mint one.
 * @param {Number} [options.deadlineMs=DEFAULT_TIMEOUT_MS] Budget for ALL stages COMBINED, not per
 * stage. Per-stage budgets do not compose: two 8s stages under one 15s caller deadline can consume 16s.
 * @param {Function} [options.ClientClass=Client] Spec seam.
 * @param {Function} [options.TransportClass=StreamableHTTPClientTransport] Spec seam.
 * @returns {Promise<Object>} The recorded beacon payload as the server persisted it.
 */
export async function recordTurnPresenceOverMcp({
    baseUrl,
    identity,
    action         = 'start',
    credential     = '',
    note,
    source,
    terminalState,
    turnId,
    deadlineMs     = DEFAULT_TIMEOUT_MS,
    ClientClass    = Client,
    TransportClass = StreamableHTTPClientTransport
} = {}) {
    if (!baseUrl) {
        throw new Error('recordTurnPresenceOverMcp requires an injected baseUrl — it resolves no config itself')
    }

    if (!identity) {
        throw new Error(
            'recordTurnPresenceOverMcp requires an identity: without it the plane records this beacon ' +
            'against the credential owner, publishing the wrong agent as mid-turn'
        )
    }

    const headers = {'X-PREFERRED-USERNAME': identity};

    if (credential) headers['Authorization'] = `Bearer ${credential}`;

    const abortController = new AbortController();

    const transport = new TransportClass(new URL(baseUrl), {
        requestInit: {
            headers,
            signal: abortController.signal
        }
    });

    const client = new ClientClass({name: 'neo-turn-presence', version: '1.0.0'}, {capabilities: {}});

    // One deadline for the whole exchange: each stage gets whatever is LEFT, so connect + call can never
    // exceed the caller's budget between them. Takes a THUNK, not a promise — passing an already-evaluated
    // promise starts the stage before the deadline is examined, so the guard would report "not started"
    // for work that demonstrably ran.
    const deadline = Date.now() + deadlineMs,
          bound    = (start, label) => {
              const remaining = deadline - Date.now();

              if (remaining <= 0) {
                  abortController.abort();
                  return Promise.reject(new Error(
                      `${label} not started: the ${deadlineMs}ms turn-presence deadline was already spent`
                  ))
              }

              return new Promise((resolve, reject) => {
                  const timer = setTimeout(() => {
                      abortController.abort();
                      reject(new Error(`${label} timed out with ${remaining}ms left of the ${deadlineMs}ms deadline`))
                  }, remaining);

                  start().then(resolve, reject).finally(() => clearTimeout(timer));
              })
          };

    try {
        await bound(() => client.connect(transport), 'turn-presence MCP connect');

        // Only send what the caller actually specified. Passing `undefined` through would override the
        // tool's own documented defaults with an explicit absence, which is a different contract.
        const args = {action};

        if (note          !== undefined) args.note          = note;
        if (source        !== undefined) args.source        = source;
        if (terminalState !== undefined) args.terminalState = terminalState;
        if (turnId        !== undefined) args.turnId        = turnId;

        const result = await bound(
            () => client.callTool({name: 'record_turn_presence', arguments: args}),
            `turn-presence record_turn_presence ${action}`
        );

        if (result?.isError) {
            throw new Error(`record_turn_presence ${action} returned isError=true`)
        }

        const payload = readToolJson(result);

        // The header names the seat; it does not guarantee the plane honoured it. A beacon persisted
        // under another identity is worse than no beacon — it publishes a peer as present — so this is
        // checked rather than assumed. `noop` carries no identity to disagree with and passes through.
        if (payload?.agentIdentity && payload.agentIdentity !== identity) {
            throw new Error(
                `record_turn_presence recorded presence for '${payload.agentIdentity}' but this seat is ` +
                `'${identity}' — refusing to report a beacon written against another agent`
            )
        }

        return payload
    } finally {
        await client.close().catch(() => {});
    }
}

export default recordTurnPresenceOverMcp;
