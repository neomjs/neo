import {Client}                        from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';

/**
 * @summary Creates an MCP client for identity-aware integration specs.
 * Creates an MCP client for identity-aware integration specs.
 * @param {Object}      options
 * @param {String|URL}  options.baseUrl                         The MCP server base URL.
 * @param {String|null} [options.identity=null]                 The proxy identity header value.
 * @param {String}      [options.clientName='neo-integration-spec'] The MCP client name.
 * @returns {Promise<Client>} A connected MCP client.
 */
export async function createIdentityClient({
    baseUrl,
    identity = null,
    clientName = 'neo-integration-spec'
}) {
    const headers = identity ? {'X-PREFERRED-USERNAME': identity} : {};
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
