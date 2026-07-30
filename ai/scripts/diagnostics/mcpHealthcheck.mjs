import 'dotenv/config';

import {Command}                       from 'commander';
import {Client}                        from '@modelcontextprotocol/sdk/client/index.js';
import {readFileSync}                  from 'fs';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {pathToFileURL}                 from 'url';

/**
 * @module ai/scripts/diagnostics/mcpHealthcheck
 * @summary Runs an MCP `healthcheck` tool call against a StreamableHTTP endpoint.
 *
 * Docker healthchecks need a small, deterministic process that proves more than
 * "the TCP port is open" without adding a parallel HTTP `/healthcheck` route to
 * each MCP server. This script connects to `/mcp`, invokes the existing
 * `healthcheck` tool, verifies the returned status, and exits non-zero on any
 * transport, tool, parse, or status failure.
 *
 * @see https://github.com/neomjs/neo/issues/11725
 */

export const DEFAULT_URL = 'http://127.0.0.1:3000';
export const DEFAULT_TIMEOUT_MS = 8000;

/**
 * @summary Bounds an MCP SDK operation and aborts the underlying HTTP transport on timeout.
 * @param {Promise} promise Operation promise returned by the SDK.
 * @param {Number} timeoutMs Maximum wait time before rejecting.
 * @param {String} label Human-readable operation label for the error message.
 * @param {AbortController} abortController Controller tied to the transport requestInit.
 * @returns {Promise<*>}
 */
function withAbortableTimeout(promise, timeoutMs, label, abortController) {
    let timer;
    const timeout = new Promise((resolve, reject) => {
        timer = setTimeout(() => {
            abortController?.abort?.();
            reject(new Error(`${label} timed out after ${timeoutMs}ms`));
        }, timeoutMs);
    });

    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * @summary Resolves one optional bearer credential from a direct env slot or secret file.
 *
 * The two carriers are mutually exclusive so a stale direct token cannot silently shadow a
 * rotated file. File errors name only the carrier and never include credential contents.
 * @param {Object} options
 * @param {Object} options.env Environment source
 * @param {String} options.bearerTokenEnv Direct-token env var name
 * @param {String|null} options.bearerTokenFile Secret file path
 * @returns {String|null}
 */
function resolveBearerToken({env, bearerTokenEnv, bearerTokenFile}) {
    const
        directToken = env[bearerTokenEnv] || null,
        filePath    = typeof bearerTokenFile === 'string' && bearerTokenFile.trim()
            ? bearerTokenFile.trim()
            : null;

    if (directToken && filePath) {
        throw new Error(
            `Configure exactly one healthcheck bearer carrier: ${bearerTokenEnv} or ` +
            'NEO_MCP_HEALTHCHECK_TOKEN_FILE/--bearer-token-file'
        )
    }

    if (!filePath) {
        return directToken
    }

    let token;

    try {
        token = readFileSync(filePath, 'utf8').trim()
    } catch {
        throw new Error('Cannot read the configured healthcheck bearer-token file')
    }

    if (!token) {
        throw new Error('The configured healthcheck bearer-token file contains no credential')
    }

    return token
}

/**
 * @summary Parses CLI arguments and dotenv-backed environment defaults.
 * @param {String[]} [argv=[]] CLI arguments without `node` / script path.
 * @param {Object} [env=process.env] Environment source.
 * @returns {Object}
 */
export function parseArgs(argv = [], env = process.env) {
    const program = new Command();

    program
        .name('mcpHealthcheck')
        .description('Call an MCP StreamableHTTP healthcheck tool and exit non-zero unless it is healthy.')
        .exitOverride()
        .allowExcessArguments(false)
        .option('--url <url>', 'Base URL of the MCP server.', env.NEO_MCP_HEALTHCHECK_URL || DEFAULT_URL)
        .option('--mcp-path <path>', 'MCP endpoint path below the base URL.', env.NEO_MCP_HEALTHCHECK_PATH || '/mcp')
        .option('--identity <identity>', 'Trusted proxy identity header value.', env.NEO_MCP_HEALTHCHECK_IDENTITY || 'neo-container-healthcheck')
        .option('--bearer-token-env <name>', 'Environment variable containing an OAuth bearer token.', env.NEO_MCP_HEALTHCHECK_TOKEN_ENV || 'NEO_MCP_HEALTHCHECK_TOKEN')
        .option('--bearer-token-file <path>', 'File containing an OAuth bearer token.', env.NEO_MCP_HEALTHCHECK_TOKEN_FILE || null)
        .option('--expected-status <status>', 'Expected healthcheck status value.', env.NEO_MCP_HEALTHCHECK_EXPECTED_STATUS || 'healthy')
        .option('--expected-plane-id <id>', 'Plane identity the served process MUST report.', env.NEO_MCP_HEALTHCHECK_EXPECTED_PLANE_ID || null)
        .option('--expected-plane-data-root <path>', 'Plane data root the served process MUST report.', env.NEO_MCP_HEALTHCHECK_EXPECTED_PLANE_DATA_ROOT || null)
        .option('--client-name <name>', 'MCP client name.', env.NEO_MCP_HEALTHCHECK_CLIENT_NAME || 'neo-container-healthcheck')
        .option('--timeout-ms <ms>', 'Maximum time to wait for MCP connect/tool-call operations.', env.NEO_MCP_HEALTHCHECK_TIMEOUT_MS || String(DEFAULT_TIMEOUT_MS));

    program.parse(argv, {from: 'user'});

    const options     = program.opts();
    const bearerToken = resolveBearerToken({
        env,
        bearerTokenEnv : options.bearerTokenEnv,
        bearerTokenFile: options.bearerTokenFile
    });

    return {
        url                  : options.url,
        mcpPath              : options.mcpPath,
        identity             : options.identity,
        bearerToken,
        bearerTokenEnv       : options.bearerTokenEnv,
        bearerTokenFile      : options.bearerTokenFile || null,
        expectedStatus       : options.expectedStatus,
        expectedPlaneId      : options.expectedPlaneId      || null,
        expectedPlaneDataRoot: options.expectedPlaneDataRoot || null,
        clientName           : options.clientName,
        timeoutMs            : Number(options.timeoutMs) || DEFAULT_TIMEOUT_MS
    };
}

/**
 * @summary Asserts the SERVED plane identity — the check that separates "something answered"
 * from "the process I meant answered".
 *
 * A port probe cannot make that distinction, and the distinction is not theoretical: the parity
 * profile's provisional 8100 slot collided with a host ssh listener, so a connectivity check
 * reported a healthy stack while nothing of ours was running there. Ports are a property of the
 * host; identity is a property of the process.
 *
 * Fails closed on an ABSENT `plane` block, not just a mismatched one. A responder that speaks MCP
 * yet reports no plane is precisely the "wrong process answered" case — treating absence as a pass
 * would restore the connectivity check under a different name.
 *
 * Expectations are opt-in: with neither expected value set this is a no-op, so existing callers
 * keep their current contract.
 * @param {Object} health The parsed healthcheck payload.
 * @param {Object} [options]
 * @param {String|null} [options.expectedPlaneId] Required identity, or null to skip.
 * @param {String|null} [options.expectedPlaneDataRoot] Required data root, or null to skip.
 * @returns {Object|null} The observed `{id, dataRoot}`, or null when no expectation was set.
 */
export function assertServedPlane(health, {expectedPlaneId = null, expectedPlaneDataRoot = null} = {}) {
    if (!expectedPlaneId && !expectedPlaneDataRoot) {
        return null;
    }

    const plane = health?.plane;

    if (!plane || typeof plane !== 'object') {
        throw new Error(
            'Healthcheck reported no `plane` block, so the responder never identified itself. ' +
            'A process answering on the expected port is not evidence it is the expected process.'
        );
    }

    if (expectedPlaneId && plane.id !== expectedPlaneId) {
        throw new Error(`Served plane id is '${plane.id || '<missing>'}', expected '${expectedPlaneId}' — a different plane is answering this endpoint.`);
    }

    if (expectedPlaneDataRoot && plane.dataRoot !== expectedPlaneDataRoot) {
        throw new Error(`Served plane dataRoot is '${plane.dataRoot || '<missing>'}', expected '${expectedPlaneDataRoot}' — same identity, different storage, which is identity without isolation.`);
    }

    return {id: plane.id, dataRoot: plane.dataRoot};
}

/**
 * @summary Builds request headers for the StreamableHTTP transport.
 * @param {Object} options
 * @param {String|null} [options.identity]
 * @param {String|null} [options.bearerToken]
 * @returns {Object}
 */
export function buildHeaders({identity = null, bearerToken = null} = {}) {
    const headers = {};

    if (identity) {
        headers['X-PREFERRED-USERNAME'] = identity;
    }
    if (bearerToken) {
        headers['Authorization'] = `Bearer ${bearerToken}`;
    }

    return headers;
}

/**
 * @summary Reads the JSON payload from an MCP SDK tool result.
 * @param {Object} result The SDK tool-call result.
 * @returns {Object}
 */
export function readToolJson(result) {
    if (result?.structuredContent) {
        return result.structuredContent;
    }

    const text = result?.content?.find(item => item.type === 'text')?.text;

    if (!text) {
        throw new Error('MCP healthcheck returned no JSON payload.');
    }

    return JSON.parse(text);
}

/**
 * @summary Calls the remote MCP `healthcheck` tool and validates the returned status.
 * @param {Object} options
 * @param {String|URL} options.url The MCP server base URL.
 * @param {String|null} [options.identity]
 * @param {String|null} [options.bearerToken]
 * @param {String} [options.expectedStatus='healthy']
 * @param {String} [options.clientName='neo-container-healthcheck']
 * @param {String} [options.mcpPath='/mcp'] MCP endpoint path below `url`.
 * @param {Number} [options.timeoutMs=DEFAULT_TIMEOUT_MS]
 * @param {Function} [options.ClientClass=Client] Injectable SDK client constructor for tests.
 * @param {Function} [options.TransportClass=StreamableHTTPClientTransport] Injectable transport constructor for tests.
 * @returns {Promise<Object>}
 */
export async function runHealthcheck({
    url,
    identity              = 'neo-container-healthcheck',
    bearerToken           = null,
    expectedStatus        = 'healthy',
    expectedPlaneId       = null,
    expectedPlaneDataRoot = null,
    clientName            = 'neo-container-healthcheck',
    mcpPath               = '/mcp',
    timeoutMs             = DEFAULT_TIMEOUT_MS,
    ClientClass           = Client,
    TransportClass        = StreamableHTTPClientTransport
}) {
    const baseUrl         = new URL(url);
    const headers         = buildHeaders({identity, bearerToken});
    const abortController = new AbortController();

    const transport = new TransportClass(new URL(mcpPath, baseUrl), {
        requestInit: {
            headers,
            signal: abortController.signal
        }
    });

    const client = new ClientClass({
        name   : clientName,
        version: '1.0.0'
    }, {
        capabilities: {}
    });

    try {
        await withAbortableTimeout(
            client.connect(transport),
            timeoutMs,
            'MCP healthcheck connect',
            abortController
        );

        const result = await withAbortableTimeout(
            client.callTool({name: 'healthcheck', arguments: {}}),
            timeoutMs,
            'MCP healthcheck tool call',
            abortController
        );

        if (result?.isError) {
            throw new Error('MCP healthcheck tool returned isError=true.');
        }

        const health = readToolJson(result);

        if (health.status !== expectedStatus) {
            throw new Error(`Expected healthcheck status '${expectedStatus}', got '${health.status || '<missing>'}'.`);
        }

        const plane = assertServedPlane(health, {expectedPlaneId, expectedPlaneDataRoot});

        return {
            status: health.status,
            url   : baseUrl.toString(),
            ...(plane ? {plane} : {})
        };
    } finally {
        await client.close?.();
    }
}

/**
 * @summary Augments a healthcheck failure message with an actionable bearer-token hint when
 * no token was configured. Under `NEO_AUTH_MODE=gitlab-pat` the in-container self-probe 401s
 * with an opaque transport error; this surfaces the likely cause at the failure site (visible
 * in `docker logs`) instead of leaving it only in the troubleshooting doc.
 * @param {Error} error The failure thrown by `runHealthcheck` / the transport.
 * @param {Object} [options]
 * @param {String|null} [options.bearerToken] The configured bearer token (`null` when unset).
 * @param {String} [options.bearerTokenEnv='NEO_MCP_HEALTHCHECK_TOKEN'] Direct-token env var name.
 * @param {String|null} [options.bearerTokenFile=null] Secret file path.
 * @returns {String} `error.message`, plus the hint when no bearer token was sent.
 */
export function formatHealthcheckError(error, {
    bearerToken = null,
    bearerTokenEnv = 'NEO_MCP_HEALTHCHECK_TOKEN',
    bearerTokenFile = null
} = {}) {
    const message = error?.message || String(error);

    if (bearerToken) {
        return message;
    }

    const carrier = bearerTokenFile
        ? `the configured bearer-token file (${bearerTokenFile})`
        : `${bearerTokenEnv} or NEO_MCP_HEALTHCHECK_TOKEN_FILE`;

    return `${message}\nNo bearer token was sent (${carrier} is unavailable). If the server runs a provider-PAT auth mode, that is the likely cause of a 401 — configure one direct env or file carrier with a token that validates at the provider user endpoint. See learn/agentos/cloud-deployment/Troubleshooting.md.`;
}

async function main() {
    let options;

    try {
        options = parseArgs(process.argv.slice(2));
    } catch (error) {
        if (error.code === 'commander.helpDisplayed') {
            return;
        }
        throw error;
    }

    try {
        const result = await runHealthcheck(options);
        console.log(JSON.stringify(result));
    } catch (error) {
        console.error(formatHealthcheckError(error, options));
        process.exitCode = 1;
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    await main();
}
