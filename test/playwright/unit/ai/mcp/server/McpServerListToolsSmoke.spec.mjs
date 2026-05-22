import {setup} from '../../../../setup.mjs';

const appName = 'McpServerListToolsSmokeTest';

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect}    from '@playwright/test';
import {parse}           from 'acorn';
import fs                from 'fs';
import path              from 'path';
import {fileURLToPath,
        pathToFileURL}   from 'url';
import yaml              from 'js-yaml';
import Neo               from '../../../../../../src/Neo.mjs';
import * as core         from '../../../../../../src/core/_export.mjs';

const
    __filename = fileURLToPath(import.meta.url),
    __dirname  = path.dirname(__filename),
    repoRoot   = path.resolve(__dirname, '../../../../../..'),
    servers    = [
        {
            name           : 'file-system',
            toolServicePath: 'ai/mcp/server/file-system/services/toolService.mjs',
            openApiPath    : 'ai/mcp/server/file-system/openapi.yaml',
            mcpServerPath  : 'ai/mcp/server/file-system/mcp-server.mjs',
            stdioReason    : 'toolService smoke is CI-friendly; full stdio boot remains covered by bucket-D McpServersHealth.spec.mjs because process transport needs harness env.'
        },
        {
            name           : 'github-workflow',
            toolServicePath: 'ai/mcp/server/github-workflow/toolService.mjs',
            openApiPath    : 'ai/mcp/server/github-workflow/openapi.yaml',
            mcpServerPath  : 'ai/mcp/server/github-workflow/mcp-server.mjs',
            stdioReason    : 'toolService smoke is CI-friendly; full stdio boot requires GitHub/gh/substrate env and remains bucket-D coverage.'
        },
        {
            name           : 'knowledge-base',
            toolServicePath: 'ai/mcp/server/knowledge-base/toolService.mjs',
            openApiPath    : 'ai/mcp/server/knowledge-base/openapi.yaml',
            mcpServerPath  : 'ai/mcp/server/knowledge-base/mcp-server.mjs',
            stdioReason    : 'toolService smoke is CI-friendly; full stdio boot may need Chroma/KB substrate and remains bucket-D coverage.'
        },
        {
            name           : 'memory-core',
            toolServicePath: 'ai/mcp/server/memory-core/toolService.mjs',
            openApiPath    : 'ai/mcp/server/memory-core/openapi.yaml',
            mcpServerPath  : 'ai/mcp/server/memory-core/mcp-server.mjs',
            stdioReason    : 'toolService smoke is CI-friendly; full stdio boot may need Memory Core substrate and remains bucket-D coverage.'
        },
        {
            name           : 'neural-link',
            toolServicePath: 'ai/mcp/server/neural-link/toolService.mjs',
            openApiPath    : 'ai/mcp/server/neural-link/openapi.yaml',
            mcpServerPath  : 'ai/mcp/server/neural-link/mcp-server.mjs',
            stdioReason    : 'toolService smoke is CI-friendly; full stdio boot may need Neural Link bridge/runtime state and remains bucket-D coverage.'
        }
    ];

/**
 * @summary Returns OpenAPI operationIds in declaration order for one MCP server.
 * @param {Object} server The server fixture.
 * @returns {String[]} Operation ids declared by the server OpenAPI file.
 */
function getOperationIds(server) {
    const
        openApiFile = path.join(repoRoot, server.openApiPath),
        doc         = yaml.load(fs.readFileSync(openApiFile, 'utf8')),
        operationIds = [];

    for (const pathItem of Object.values(doc.paths || {})) {
        for (const operation of Object.values(pathItem || {})) {
            if (operation && typeof operation === 'object' && operation.operationId) {
                operationIds.push(operation.operationId);
            }
        }
    }

    return operationIds;
}

/**
 * @summary Resolves operation ids expected in default `tools/list` for a server.
 * @param {Object} server The server fixture.
 * @returns {String[]} Expected default-listed operation ids.
 */
function getDefaultListedOperationIds(server) {
    const operationIds = getOperationIds(server);

    if (server.name === 'knowledge-base') {
        return operationIds.filter(name => name !== 'ingest_source_files');
    }

    return operationIds;
}

/**
 * @summary Parses the real per-server `serviceMapping` object without invoking handlers.
 * This catches OpenAPI/toolService drift while avoiding tool side effects.
 *
 * @param {Object} server The server fixture.
 * @returns {String[]} Service mapping keys in source declaration order.
 */
function getServiceMappingKeys(server) {
    const
        toolServiceFile = path.join(repoRoot, server.toolServicePath),
        source          = fs.readFileSync(toolServiceFile, 'utf8'),
        ast             = parse(source, {ecmaVersion: 'latest', sourceType: 'module'});

    for (const node of ast.body) {
        if (node.type !== 'VariableDeclaration') continue;

        for (const declaration of node.declarations) {
            if (declaration.id?.name !== 'serviceMapping' || declaration.init?.type !== 'ObjectExpression') continue;

            return declaration.init.properties.map(property => {
                if (property.key.type === 'Identifier') return property.key.name;
                return property.key.value;
            });
        }
    }

    throw new Error(`serviceMapping object not found in ${server.toolServicePath}`);
}

/**
 * @summary Imports a real per-server `toolService.mjs` and returns its `listTools()` payload.
 *
 * Neural Link auto-connect is disabled before import so this CI-friendly smoke guard
 * exercises the tool-shape compiler without starting the browser bridge.
 *
 * @param {Object} server The server fixture.
 * @returns {Promise<Object>} The MCP `tools/list` payload.
 */
async function listTools(server) {
    if (server.name === 'neural-link') {
        const configUrl = pathToFileURL(path.join(repoRoot, 'ai/mcp/server/neural-link/config.mjs')).href;
        (await import(configUrl)).default.data.autoConnect = false;
    }

    const moduleUrl = pathToFileURL(path.join(repoRoot, server.toolServicePath)).href;
    return (await import(moduleUrl)).listTools();
}

test.describe('Neo MCP servers — cross-server listTools smoke (#11687)', () => {
    test.describe.configure({mode: 'serial'});

    test('fixture enumerates every active Neo MCP server entrypoint', () => {
        expect(servers.map(server => server.name).sort()).toEqual([
            'file-system',
            'github-workflow',
            'knowledge-base',
            'memory-core',
            'neural-link'
        ]);

        for (const server of servers) {
            expect(fs.existsSync(path.join(repoRoot, server.toolServicePath)), `${server.name} toolService missing`).toBe(true);
            expect(fs.existsSync(path.join(repoRoot, server.openApiPath)), `${server.name} openapi.yaml missing`).toBe(true);
            expect(fs.existsSync(path.join(repoRoot, server.mcpServerPath)), `${server.name} mcp-server.mjs missing`).toBe(true);
            expect(server.stdioReason.length, `${server.name} stdio fallback reason missing`).toBeGreaterThan(24);
        }
    });

    for (const server of servers) {
        test(`${server.name}: real toolService.listTools() returns well-formed unique tools`, async () => {
            const {tools} = await listTools(server);

            expect(tools.length, `${server.name} should expose at least one MCP tool`).toBeGreaterThan(0);
            expect(new Set(tools.map(tool => tool.name)).size, `${server.name} has duplicate tool names`).toBe(tools.length);

            for (const tool of tools) {
                expect(tool.name, `${server.name} tool name`).toEqual(expect.any(String));
                expect(tool.name.length, `${server.name} tool name length`).toBeGreaterThan(0);
                expect(tool.description, `${server.name}.${tool.name} description`).toEqual(expect.any(String));
                expect(tool.description.length, `${server.name}.${tool.name} description length`).toBeGreaterThan(0);
                expect(tool.inputSchema, `${server.name}.${tool.name} inputSchema`).toEqual(expect.any(Object));
                expect(Array.isArray(tool.inputSchema), `${server.name}.${tool.name} inputSchema must be object-shaped`).toBe(false);

                if (tool.outputSchema) {
                    expect(tool.outputSchema, `${server.name}.${tool.name} outputSchema`).toEqual(expect.any(Object));
                    expect(Array.isArray(tool.outputSchema), `${server.name}.${tool.name} outputSchema must be object-shaped`).toBe(false);
                }
            }
        });

        test(`${server.name}: listed tools align with openapi operationIds and serviceMapping keys`, async () => {
            const
                {tools}            = await listTools(server),
                listedNames        = tools.map(tool => tool.name).sort(),
                operationIds       = getOperationIds(server).sort(),
                defaultListedIds   = getDefaultListedOperationIds(server).sort(),
                serviceMappingKeys = getServiceMappingKeys(server).sort();

            expect(listedNames, `${server.name} listTools output drifted from default-visible operationIds`).toEqual(defaultListedIds);
            expect(serviceMappingKeys, `${server.name} serviceMapping drifted from openapi.yaml operationIds`).toEqual(operationIds);
        });
    }
});
