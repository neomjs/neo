import {Client}                        from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';

/**
 * Pure collaborator: every value it needs is INJECTED, nothing is resolved here.
 *
 * The first version read `NEO_MEMORY_CORE_MCP_URL` with a hardcoded `http://127.0.0.1:3102` fallback
 * and its own bearer-token file vocabulary. That is module-level re-derivation of a
 * config leaf — and it also invented a second credential carrier alongside the one the plane already
 * has. `AiConfig.fleet.planeBase` / `fleet.planeBearer` are the SSOT, `devFleetServer.mjs` is the
 * precedent for reading them once at an entrypoint and injecting, and an entrypoint is exactly what
 * the arming hook is.
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
 * @summary Lists this seat's wake subscriptions over the Memory Core's MCP surface.
 *
 * This exists instead of a graph-database read because a host process cannot reach the containerized
 * Memory Core's SQLite: it is a Docker named volume whose data lives inside the Docker Desktop VM.
 * A path-based read therefore lands on a *different*, diverged store and succeeds while returning a
 * stale route set — the failure is invisible to a green test suite, because a stale file answers
 * reads correctly. Going through MCP means the reader sees exactly what the service serves.
 *
 * @param {Object} options
 * @param {String} options.baseUrl Fully-resolved MCP endpoint, injected by the entrypoint.
 * @param {String} [options.credential=''] Bearer credential; empty means a tokenless plane, which
 * decides admission itself and fail-closed — matching `createPlaneMailboxClient`'s contract.
 * @param {Number} [options.deadlineMs=DEFAULT_TIMEOUT_MS] Budget for ALL stages COMBINED, not per stage.
 * Per-stage budgets do not compose: two 8s stages under a 15s caller deadline can consume 16s and be
 * killed after the read but before publication, which is the one moment a half-finished run is worst.
 * One shared deadline means the caller's own limit is the only limit that has to hold.
 * @param {Function} [options.ClientClass=Client] Spec seam.
 * @param {Function} [options.TransportClass=StreamableHTTPClientTransport] Spec seam.
 * @returns {Promise<Object[]>} The subscription records, in the shape the manifest builder consumes.
 */
export async function readSubscriptionsOverMcp({
    baseUrl,
    credential     = '',
    identity       = '',
    deadlineMs     = DEFAULT_TIMEOUT_MS,
    ClientClass    = Client,
    TransportClass = StreamableHTTPClientTransport
} = {}) {
    if (!baseUrl) {
        throw new Error('readSubscriptionsOverMcp requires an injected baseUrl — it resolves no config itself')
    }

    // `X-PREFERRED-USERNAME` names WHICH seat is asking, the same header `mcpHealthcheck` sends. It is
    // not decoration: without it the plane answers as the credential's owner, so a shared token returns
    // that owner's subscriptions — measured, and the reason the caller must still verify identity
    // agreement rather than trusting this header to have been honoured.
    const headers = {};

    if (identity)   headers['X-PREFERRED-USERNAME'] = identity;
    if (credential) headers['Authorization']        = `Bearer ${credential}`;

    const abortController = new AbortController();

    const transport = new TransportClass(new URL(baseUrl), {
        requestInit: {
            headers,
            signal: abortController.signal
        }
    });

    const client = new ClientClass({name: 'neo-wake-arming', version: '1.0.0'}, {capabilities: {}});

    // One deadline for the whole exchange: each stage gets whatever is LEFT, so connect + list can never
    // exceed the caller's budget between them.
    //
    // Takes a THUNK, not a promise. Passing `bound(client.callTool(...), label)` evaluates the argument
    // first, so the stage is already in flight before the deadline is examined — the guard then rejects
    // saying "skipped" for work that demonstrably ran. Measured: `callTool === 1` while the result claimed
    // the list stage was skipped. A check that runs after the action cannot describe the action, and the
    // message asserting otherwise is the defect, not the wording.
    const deadline = Date.now() + deadlineMs,
          bound    = (start, label) => {
              const remaining = deadline - Date.now();

              if (remaining <= 0) {
                  abortController.abort();
                  return Promise.reject(new Error(
                      `${label} not started: the ${deadlineMs}ms wake-arming deadline was already spent`
                  ))
              }

              return new Promise((resolve, reject) => {
                  const timer = setTimeout(() => {
                      abortController.abort();
                      reject(new Error(`${label} timed out with ${remaining}ms left of the ${deadlineMs}ms deadline`))
                  }, remaining);

                  // Invoked only now, AFTER the deadline check.
                  start().then(resolve, reject).finally(() => clearTimeout(timer));
              })
          };

    try {
        await bound(() => client.connect(transport), 'wake-arming MCP connect');

        const result = await bound(
            () => client.callTool({name: 'manage_wake_subscription', arguments: {action: 'list'}}),
            'wake-arming manage_wake_subscription list'
        );

        if (result?.isError) {
            throw new Error('manage_wake_subscription list returned isError=true')
        }

        const payload = readToolJson(result);

        // Tolerate either a bare array or a wrapper, but never invent an empty set from a shape this
        // does not recognise: an unrecognised payload is unverifiable, and publishing from an empty
        // set would withdraw this seat's own route on an absence that was never established.
        if (Array.isArray(payload))              return payload;
        if (Array.isArray(payload?.subscriptions)) return payload.subscriptions;

        throw new Error('manage_wake_subscription list returned no recognisable subscription array')
    } finally {
        await client.close().catch(() => {});
    }
}
