import {Client}                        from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {readFileSync}                  from 'node:fs';

/**
 * Base URL of the Memory Core's MCP surface. On the containerized plane this is the ingress publish
 * address, not the service port: ingress routes `/mc/*` to `mc-server:3001`, so the seat talks to the
 * container through one published port rather than reaching a service directly.
 * @type {String}
 */
export const DEFAULT_MCP_URL = 'http://127.0.0.1:3102';

/**
 * @type {String}
 */
export const DEFAULT_MCP_PATH = '/mc/mcp';

/**
 * @type {Number}
 */
export const DEFAULT_TIMEOUT_MS = 8000;

/**
 * @summary Reads one bearer credential from a file, naming only the carrier on failure.
 * @param {String|null} tokenFile Absolute path to the secret file.
 * @param {Function} [readFile=readFileSync] Read seam.
 * @returns {String|null}
 */
export function resolveBearerToken(tokenFile, readFile = readFileSync) {
    const filePath = typeof tokenFile === 'string' && tokenFile.trim() ? tokenFile.trim() : null;

    if (!filePath) return null;

    let token;

    try {
        token = String(readFile(filePath, 'utf8')).trim()
    } catch {
        throw new Error('Cannot read the configured wake-arming bearer-token file')
    }

    if (!token) {
        throw new Error('The configured wake-arming bearer-token file contains no credential')
    }

    return token
}

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
 * @param {Object} [options]
 * @param {Object} [options.env=process.env] Environment source.
 * @param {String} [options.url] Base URL; defaults to `NEO_MEMORY_CORE_MCP_URL` then `DEFAULT_MCP_URL`.
 * @param {String} [options.mcpPath] Endpoint path below the base URL.
 * @param {String} [options.tokenFile] Bearer-token file; defaults to `NEO_MCP_AUTH_TOKEN_FILE`.
 * @param {Number} [options.timeoutMs=DEFAULT_TIMEOUT_MS] Per-operation budget.
 * @param {Function} [options.ClientClass=Client] Spec seam.
 * @param {Function} [options.TransportClass=StreamableHTTPClientTransport] Spec seam.
 * @returns {Promise<Object[]>} The subscription records, in the shape the manifest builder consumes.
 */
export async function readSubscriptionsOverMcp({
    env            = process.env,
    url            = env?.NEO_MEMORY_CORE_MCP_URL || DEFAULT_MCP_URL,
    mcpPath        = env?.NEO_WAKE_ARMING_MCP_PATH || DEFAULT_MCP_PATH,
    tokenFile      = env?.NEO_MCP_AUTH_TOKEN_FILE || null,
    timeoutMs      = DEFAULT_TIMEOUT_MS,
    ClientClass    = Client,
    TransportClass = StreamableHTTPClientTransport
} = {}) {
    const bearerToken     = resolveBearerToken(tokenFile),
          headers         = bearerToken ? {Authorization: `Bearer ${bearerToken}`} : {},
          abortController = new AbortController();

    const transport = new TransportClass(new URL(mcpPath, new URL(url)), {
        requestInit: {
            headers,
            signal: abortController.signal
        }
    });

    const client = new ClientClass({name: 'neo-wake-arming', version: '1.0.0'}, {capabilities: {}});

    const bound = (promise, label) => new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            abortController.abort();
            reject(new Error(`${label} timed out after ${timeoutMs}ms`))
        }, timeoutMs);

        promise.then(resolve, reject).finally(() => clearTimeout(timer));
    });

    try {
        await bound(client.connect(transport), 'wake-arming MCP connect');

        const result = await bound(
            client.callTool({name: 'manage_wake_subscription', arguments: {action: 'list'}}),
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
