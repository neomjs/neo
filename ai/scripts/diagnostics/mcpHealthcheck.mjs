import 'dotenv/config';

import {Command}                       from 'commander';
import {Client}                        from '@modelcontextprotocol/sdk/client/index.js';
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
        .option('--identity <identity>', 'Trusted proxy identity header value.', env.NEO_MCP_HEALTHCHECK_IDENTITY || 'neo-container-healthcheck')
        .option('--bearer-token-env <name>', 'Environment variable containing an OAuth bearer token.', env.NEO_MCP_HEALTHCHECK_TOKEN_ENV || 'NEO_MCP_HEALTHCHECK_TOKEN')
        .option('--expected-status <status>', 'Expected healthcheck status value.', env.NEO_MCP_HEALTHCHECK_EXPECTED_STATUS || 'healthy')
        .option('--client-name <name>', 'MCP client name.', env.NEO_MCP_HEALTHCHECK_CLIENT_NAME || 'neo-container-healthcheck');

    program.parse(argv, {from: 'user'});

    const options = program.opts();

    return {
        url           : options.url,
        identity      : options.identity,
        bearerToken   : env[options.bearerTokenEnv] || null,
        bearerTokenEnv: options.bearerTokenEnv,
        expectedStatus: options.expectedStatus,
        clientName    : options.clientName
    };
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
 * @param {Function} [options.ClientClass=Client] Injectable SDK client constructor for tests.
 * @param {Function} [options.TransportClass=StreamableHTTPClientTransport] Injectable transport constructor for tests.
 * @returns {Promise<Object>}
 */
export async function runHealthcheck({
    url,
    identity       = 'neo-container-healthcheck',
    bearerToken    = null,
    expectedStatus = 'healthy',
    clientName     = 'neo-container-healthcheck',
    ClientClass    = Client,
    TransportClass = StreamableHTTPClientTransport
}) {
    const baseUrl = new URL(url);
    const headers = buildHeaders({identity, bearerToken});

    const transport = new TransportClass(new URL('/mcp', baseUrl), {
        requestInit: {headers}
    });

    const client = new ClientClass({
        name   : clientName,
        version: '1.0.0'
    }, {
        capabilities: {}
    });

    await client.connect(transport);

    try {
        const result = await client.callTool({name: 'healthcheck', arguments: {}});

        if (result?.isError) {
            throw new Error('MCP healthcheck tool returned isError=true.');
        }

        const health = readToolJson(result);

        if (health.status !== expectedStatus) {
            throw new Error(`Expected healthcheck status '${expectedStatus}', got '${health.status || '<missing>'}'.`);
        }

        return {
            status: health.status,
            url   : baseUrl.toString()
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
 * @param {String} [options.bearerTokenEnv='NEO_MCP_HEALTHCHECK_TOKEN'] The env var the token reads from.
 * @returns {String} `error.message`, plus the hint when no bearer token was sent.
 */
export function formatHealthcheckError(error, {bearerToken = null, bearerTokenEnv = 'NEO_MCP_HEALTHCHECK_TOKEN'} = {}) {
    const message = error?.message || String(error);

    if (bearerToken) {
        return message;
    }

    return `${message}\nNo bearer token was sent (${bearerTokenEnv} is unset). If the server runs NEO_AUTH_MODE=gitlab-pat, that is the likely cause of a 401 — set ${bearerTokenEnv} to a GitLab token that validates at /api/v4/user (a read_user PAT, or a read_api OAuth-app / group token). See learn/agentos/cloud-deployment/Troubleshooting.md.`;
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
