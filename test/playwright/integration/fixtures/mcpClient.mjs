import {expect}                        from '@playwright/test';
import {Client}                        from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';

export const DEFAULT_READY_URL = process.env.NEO_INTEGRATION_READY_URL || 'http://127.0.0.1:13090/ready';

/**
 * @summary Reads the Dockerized integration fixture readiness endpoint.
 * Reads the Dockerized integration fixture readiness endpoint.
 * @param {String} [readyUrl=DEFAULT_READY_URL] The readiness endpoint URL.
 * @returns {Promise<Object>} The readiness payload.
 */
export async function getReadiness(readyUrl = DEFAULT_READY_URL) {
    const response = await fetch(readyUrl);

    return response.json();
}

/**
 * @summary Creates an MCP client for identity-aware integration specs.
 * Creates an MCP client for identity-aware integration specs.
 * @param {Object}      options
 * @param {String|URL}  options.baseUrl                            The MCP server base URL.
 * @param {String|null} [options.identity=null]                    The proxy identity header value.
 * @param {String}      [options.clientName='neo-integration-spec'] The MCP client name.
 * @returns {Promise<Client>} A connected MCP client.
 */
export async function createIdentityClient({
    baseUrl,
    identity = null,
    bearerToken = null,
    clientName = 'neo-integration-spec'
}) {
    const headers = {};
    if (identity) {
        headers['X-PREFERRED-USERNAME'] = identity;
    }
    if (bearerToken) {
        headers['Authorization'] = `Bearer ${bearerToken}`;
    }

    const transport = new StreamableHTTPClientTransport(new URL('/mcp', baseUrl), {
        requestInit: {headers}
    });
    const client = new Client({
        name   : clientName,
        version: '1.0.0'
    }, {
        capabilities: {}
    });

    await client.connect(transport);

    return client;
}

/**
 * @summary Converts an MCP tool result into JSON for integration assertions.
 * Converts an MCP tool result into JSON for integration assertions.
 * @param {Object} result The MCP SDK tool result.
 * @param {String} [label='MCP tool'] The assertion label used for fallback text content.
 * @returns {Object} The structured or parsed JSON payload.
 */
export function readToolJson(result, label = 'MCP tool') {
    if (result.structuredContent) {
        return result.structuredContent;
    }

    const text = result.content?.find(item => item.type === 'text')?.text;
    expect(text, `${label} should return text content when structuredContent is absent`).toBeTruthy();

    return JSON.parse(text);
}

/**
 * @summary Formats diagnostic JSON for MCP assertion messages.
 * Formats diagnostic JSON for MCP assertion messages.
 * @param {*} value The value to serialize.
 * @returns {String} Pretty-printed JSON, or an unserializable-value marker.
 */
function formatDiagnosticJson(value) {
    try {
        return JSON.stringify(value, null, 2);
    } catch (error) {
        return `[unserializable value: ${error.message}]`;
    }
}

/**
 * @summary Builds an assertion message for MCP tool-level errors.
 * Builds an assertion message for MCP tool-level errors.
 * @param {String} name   The tool name.
 * @param {Object} result The MCP SDK tool result.
 * @param {Object} args   The tool arguments.
 * @returns {String} The formatted assertion message.
 */
function buildToolErrorMessage(name, result, args) {
    const textContent = result.content
        ?.filter(item => item.type === 'text')
        .map(item => item.text)
        .join('\n') || '<no text content>';

    return [
        `MCP tool ${name} should not return isError`,
        `content:\n${textContent}`,
        `structuredContent:\n${formatDiagnosticJson(result.structuredContent || null)}`,
        `arguments:\n${formatDiagnosticJson(args)}`
    ].join('\n\n');
}

/**
 * @summary Calls an MCP tool and returns its JSON payload.
 * Calls an MCP tool and returns its JSON payload.
 * @param {Client} client The connected MCP client.
 * @param {String} name   The tool name to call.
 * @param {Object} [args={}] The tool arguments.
 * @returns {Promise<Object>} The structured or parsed JSON payload.
 */
export async function callJsonTool(client, name, args = {}) {
    const result = await client.callTool({name, arguments: args});

    expect(result.isError, buildToolErrorMessage(name, result, args)).not.toBe(true);

    return readToolJson(result, `MCP tool ${name}`);
}

/**
 * @summary Calls the healthcheck tool with a trusted proxy identity.
 * Calls the healthcheck tool with a trusted proxy identity.
 * @param {String|URL} baseUrl The MCP server base URL.
 * @param {Object} [options]
 * @param {String} [options.clientName='neo-integration-healthcheck'] The MCP client name.
 * @param {String} [options.identity='neo-healthcheck'] The proxy identity header value.
 * @returns {Promise<Object>} The healthcheck payload.
 */
export async function callHealthcheck(baseUrl, {
    clientName = 'neo-integration-healthcheck',
    identity = 'neo-healthcheck'
} = {}) {
    const client = await createIdentityClient({baseUrl, clientName, identity});

    try {
        return await callJsonTool(client, 'healthcheck');
    } finally {
        await client.close();
    }
}
