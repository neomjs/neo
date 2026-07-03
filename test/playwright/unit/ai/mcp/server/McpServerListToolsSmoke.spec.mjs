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

import {test, expect} from '@playwright/test';
import {parse}        from 'acorn';
import fs             from 'fs';
import path           from 'path';
import {fileURLToPath,
        pathToFileURL}   from 'url';
import * as yaml   from 'js-yaml';
import Neo         from '../../../../../../src/Neo.mjs';
import * as core   from '../../../../../../src/core/_export.mjs';
import AiConfig    from '../../../../../../ai/config.mjs';
import ToolService from '../../../../../../ai/mcp/ToolService.mjs';
import {
    createDeploymentStateSnapshot,
    writeDeploymentStateSnapshot
} from '../../../../../../ai/services/memory-core/helpers/deploymentStateBridgeStore.mjs';

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
            name           : 'gitlab-workflow',
            guardedStartup : true,
            toolServicePath: 'ai/mcp/server/gitlab-workflow/toolService.mjs',
            openApiPath    : 'ai/mcp/server/gitlab-workflow/openapi.yaml',
            mcpServerPath  : 'ai/mcp/server/gitlab-workflow/mcp-server.mjs',
            stdioReason    : 'toolService smoke is CI-friendly; full stdio boot requires GitLab token/project env and remains bucket-D coverage.'
        },
        {
            name           : 'github-workflow',
            guardedStartup : true,
            toolServicePath: 'ai/mcp/server/github-workflow/toolService.mjs',
            openApiPath    : 'ai/mcp/server/github-workflow/openapi.yaml',
            mcpServerPath  : 'ai/mcp/server/github-workflow/mcp-server.mjs',
            stdioReason    : 'toolService smoke is CI-friendly; full stdio boot requires GitHub/gh/substrate env and remains bucket-D coverage.'
        },
        {
            name           : 'knowledge-base',
            guardedStartup : true,
            toolServicePath: 'ai/mcp/server/knowledge-base/toolService.mjs',
            openApiPath    : 'ai/mcp/server/knowledge-base/openapi.yaml',
            mcpServerPath  : 'ai/mcp/server/knowledge-base/mcp-server.mjs',
            stdioReason    : 'toolService smoke is CI-friendly; full stdio boot may need Chroma/KB substrate and remains bucket-D coverage.'
        },
        {
            name           : 'memory-core',
            guardedStartup : true,
            toolServicePath: 'ai/mcp/server/memory-core/toolService.mjs',
            openApiPath    : 'ai/mcp/server/memory-core/openapi.yaml',
            mcpServerPath  : 'ai/mcp/server/memory-core/mcp-server.mjs',
            stdioReason    : 'toolService smoke is CI-friendly; full stdio boot may need Memory Core substrate and remains bucket-D coverage.'
        },
        {
            name           : 'neural-link',
            guardedStartup : true,
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
        openApiFile  = path.join(repoRoot, server.openApiPath),
        doc          = yaml.load(fs.readFileSync(openApiFile, 'utf8')),
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
 * @summary Returns OpenAPI operations keyed by operationId.
 * @param {Object} server The server fixture.
 * @returns {Object}
 */
function getOperationsById(server) {
    const
        openApiFile = path.join(repoRoot, server.openApiPath),
        doc         = yaml.load(fs.readFileSync(openApiFile, 'utf8')),
        operations  = {};

    for (const pathItem of Object.values(doc.paths || {})) {
        for (const operation of Object.values(pathItem || {})) {
            if (operation && typeof operation === 'object' && operation.operationId) {
                operations[operation.operationId] = operation;
            }
        }
    }

    return operations;
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
 * @summary Resolves operation ids visible to the Neural Link embedded-harness projection.
 * @param {Object} server The Neural Link server fixture.
 * @returns {String[]} Expected embedded-harness operation ids.
 */
function getHarnessEmbeddedOperationIds(server) {
    const
        openApiFile  = path.join(repoRoot, server.openApiPath),
        doc          = yaml.load(fs.readFileSync(openApiFile, 'utf8')),
        visibleTiers = doc['x-neo-harness-tool-projection']?.defaultVisibleTiers || [],
        operations   = getOperationsById(server);

    return Object.entries(operations)
        .filter(([, operation]) => visibleTiers.includes(operation['x-neo-tool-tier']))
        .map(([operationId]) => operationId);
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
            'gitlab-workflow',
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

    test('guarded MCP entrypoints force fatal startup errors to stderr (#13877)', () => {
        for (const server of servers.filter(item => item.guardedStartup)) {
            const source = fs.readFileSync(path.join(repoRoot, server.mcpServerPath), 'utf8');

            expect(source, `${server.name} must keep the stale-config boot guard`).toContain('assertConfigFresh');
            expect(source, `${server.name} fatal startup errors must reach MCP-client stderr`).toContain('logger.fatalStartup');
            expect(source, `${server.name} must not regress to logger-only fatal exits`).not.toContain("logger.error('Fatal error during server initialization:'");
        }
    });

    test('file-system exposes compact list descriptions plus lazy-loaded handbook detail (#13268)', async () => {
        const
            server        = servers.find(item => item.name === 'file-system'),
            {tools}       = await listTools(server),
            byName        = Object.fromEntries(tools.map(tool => [tool.name, tool])),
            moduleUrl     = pathToFileURL(path.join(repoRoot, server.toolServicePath)).href,
            {callTool}    = await import(moduleUrl),
            handbook      = await callTool('get_mcp_tool_handbook', {toolId: 'read_file'}),
            missing       = await callTool('get_mcp_tool_handbook', {toolId: 'missing_tool'}),
            healthcheck   = byName.healthcheck,
            readFile      = byName.read_file,
            handbookTool  = byName.get_mcp_tool_handbook;

        expect(handbookTool.description.length).toBeLessThanOrEqual(120);
        expect(readFile.description).toBe('Read a workspace file by absolute path.');
        expect(readFile.description).not.toContain('directory traversal outside');
        expect(readFile.inputSchema.properties.absolutePath.type).toBe('string');
        expect(healthcheck.annotations.readOnlyHint).toBe(true);

        for (const tool of tools) {
            expect(tool.description.length, `file-system.${tool.name} description is not compact`).toBeLessThanOrEqual(120);
        }

        expect(handbook).toMatchObject({
            toolId: 'read_file',
            found : true,
            source: 'x-neo-tool-handbook'
        });
        expect(handbook.handbook.replace(/\s+/g, ' ')).toContain('directory traversal outside the permitted workspace');

        expect(missing).toEqual({
            toolId : 'missing_tool',
            found  : false,
            code   : 'TOOL_NOT_FOUND',
            message: 'Tool "missing_tool" does not exist in this MCP server.'
        });
    });

    test('knowledge-base exposes compact list descriptions plus lazy-loaded handbook detail (#9953)', async () => {
        const
            server        = servers.find(item => item.name === 'knowledge-base'),
            {tools}       = await listTools(server),
            byName        = Object.fromEntries(tools.map(tool => [tool.name, tool])),
            moduleUrl     = pathToFileURL(path.join(repoRoot, server.toolServicePath)).href,
            {callTool}    = await import(moduleUrl),
            handbook      = await callTool('get_mcp_tool_handbook', {toolId: 'query_documents'}),
            missing       = await callTool('get_mcp_tool_handbook', {toolId: 'missing_tool'}),
            queryDocs     = byName.query_documents,
            askKnowledge  = byName.ask_knowledge_base,
            handbookTool  = byName.get_mcp_tool_handbook;

        expect(handbookTool.description.length).toBeLessThanOrEqual(120);
        expect(queryDocs.description).toBe('Search the Knowledge Base and return ranked source references.');
        expect(queryDocs.description).not.toContain('Prefer `ask_knowledge_base`');
        expect(askKnowledge.description).toBe('Ask the Knowledge Base for a synthesized answer with cited references.');
        expect(askKnowledge.description).not.toContain('zero-cost RAG subagent');
        expect(handbookTool.annotations.readOnlyHint).toBe(true);

        for (const tool of tools) {
            expect(tool.description.length, `knowledge-base.${tool.name} description is not compact`).toBeLessThanOrEqual(120);
        }

        expect(handbook).toMatchObject({
            toolId: 'query_documents',
            found : true,
            source: 'description'
        });
        expect(handbook.handbook.replace(/\s+/g, ' ')).toContain('Prefer `ask_knowledge_base` for most queries');

        expect(missing).toEqual({
            toolId : 'missing_tool',
            found  : false,
            code   : 'TOOL_NOT_FOUND',
            message: 'Tool "missing_tool" does not exist in this MCP server.'
        });
    });

    test('memory-core exposes compact list descriptions plus lazy-loaded handbook detail (#13739)', async () => {
        const
            server        = servers.find(item => item.name === 'memory-core'),
            {tools}       = await listTools(server),
            byName        = Object.fromEntries(tools.map(tool => [tool.name, tool])),
            moduleUrl     = pathToFileURL(path.join(repoRoot, server.toolServicePath)).href,
            {callTool}    = await import(moduleUrl),
            handbook      = await callTool('get_mcp_tool_handbook', {toolId: 'resume_session'}),
            missing       = await callTool('get_mcp_tool_handbook', {toolId: 'missing_tool'}),
            addMemory     = byName.add_memory,
            resumeSession = byName.resume_session,
            handbookTool  = byName.get_mcp_tool_handbook;

        expect(handbookTool.annotations.readOnlyHint).toBe(true);
        expect(handbookTool.description.length).toBeLessThanOrEqual(120);
        expect(addMemory.description).toBe('Persist one consolidated turn memory for the active agent session.');
        expect(resumeSession.description).toBe('Validate whether a session id is safe to resume.');
        expect(resumeSession.description).not.toContain('SESSION_BUSY');
        expect(addMemory.inputSchema.properties.prompt.type).toBe('string');

        for (const tool of tools) {
            expect(tool.description.length, `memory-core.${tool.name} description is not compact`).toBeLessThanOrEqual(120);
        }

        expect(handbook).toMatchObject({
            toolId: 'resume_session',
            found : true,
            source: 'description'
        });
        expect(handbook.handbook).toContain('SESSION_BUSY');

        expect(missing).toEqual({
            toolId : 'missing_tool',
            found  : false,
            code   : 'TOOL_NOT_FOUND',
            message: 'Tool "missing_tool" does not exist in this MCP server.'
        });
    });

    test('knowledge-base and memory-core read deployment-state snapshots through public tools (#13926)', async () => {
        const snapshot = createDeploymentStateSnapshot({
            generatedAt : Date.now(),
            recoveryRuns: {
                status : 'available',
                source : 'orchestrator-recovery-run-ledger',
                limit  : 1,
                entries: [{recoveryRunId: 'recovery-1', diagnosisId: 'diagnosis-1'}],
                errors : []
            },
            services: [
                {
                    serviceKey: 'model',
                    status    : 'degraded',
                    diagnosis : {status: 'critical', reasons: ['cpu-saturation']}
                },
                {
                    serviceKey: 'memory',
                    status    : 'degraded',
                    diagnosis : {status: 'critical', reasons: ['unhealthy-container']}
                }
            ]
        });

        const
            snapshotPathConfig = AiConfig.orchestrator.deploymentStateBridge.snapshotPath,
            snapshotExists     = fs.existsSync(snapshotPathConfig),
            originalSnapshot   = snapshotExists ? fs.readFileSync(snapshotPathConfig) : null;

        try {
            await writeDeploymentStateSnapshot({filePath: snapshotPathConfig, snapshot});

            const
                args             = {staleAfterMs: 60_000},
                knowledgeBaseApi = await import(pathToFileURL(path.join(repoRoot, 'ai/mcp/server/knowledge-base/toolService.mjs')).href),
                memoryCoreApi    = await import(pathToFileURL(path.join(repoRoot, 'ai/mcp/server/memory-core/toolService.mjs')).href),
                kbSnapshot       = await knowledgeBaseApi.callTool('get_deployment_state_snapshot', args),
                mcSnapshot       = await memoryCoreApi.callTool('get_deployment_state_snapshot', args),
                kbInspection     = await knowledgeBaseApi.callTool('inspect_deployment', args),
                mcInspection     = await memoryCoreApi.callTool('inspect_deployment', args);

            for (const result of [kbSnapshot, mcSnapshot, kbInspection, mcInspection]) {
                expect(result).toMatchObject({
                    ok      : true,
                    status  : 'available',
                    snapshot: {
                        recordType  : 'deployment-state-snapshot',
                        recoveryRuns: {
                            status : 'available',
                            entries: [{recoveryRunId: 'recovery-1', diagnosisId: 'diagnosis-1'}]
                        },
                        services  : [
                            {
                                serviceKey: 'model',
                                status    : 'degraded',
                                diagnosis : {status: 'critical', reasons: ['cpu-saturation']}
                            },
                            {
                                serviceKey: 'memory',
                                status    : 'degraded',
                                diagnosis : {status: 'critical', reasons: ['unhealthy-container']}
                            }
                        ]
                    }
                });
            }
        } finally {
            if (snapshotExists) {
                fs.writeFileSync(snapshotPathConfig, originalSnapshot);
            } else {
                fs.rmSync(snapshotPathConfig, {force: true});
            }
        }
    });

    test('gitlab-workflow exposes compact list descriptions plus lazy-loaded handbook detail (#9953)', async () => {
        const
            server       = servers.find(item => item.name === 'gitlab-workflow'),
            {tools}      = await listTools(server),
            byName       = Object.fromEntries(tools.map(tool => [tool.name, tool])),
            moduleUrl    = pathToFileURL(path.join(repoRoot, server.toolServicePath)).href,
            {callTool}   = await import(moduleUrl),
            handbook     = await callTool('get_mcp_tool_handbook', {toolId: 'create_issue'}),
            missing      = await callTool('get_mcp_tool_handbook', {toolId: 'missing_tool'}),
            createIssue  = byName.create_issue,
            handbookTool = byName.get_mcp_tool_handbook;

        expect(handbookTool.description.length).toBeLessThanOrEqual(120);
        expect(handbookTool.annotations.readOnlyHint).toBe(true);
        expect(createIssue.description).toBe('Create a GitLab issue');
        expect(createIssue.description).not.toContain('GitLab GraphQL API');

        for (const tool of tools) {
            expect(tool.description.length, `gitlab-workflow.${tool.name} description is not compact`).toBeLessThanOrEqual(120);
        }

        expect(handbook).toMatchObject({
            toolId: 'create_issue',
            found : true,
            source: 'description'
        });
        expect(handbook.handbook).toContain('GitLab GraphQL API');

        expect(missing).toEqual({
            toolId : 'missing_tool',
            found  : false,
            code   : 'TOOL_NOT_FOUND',
            message: 'Tool "missing_tool" does not exist in this MCP server.'
        });
    });

    test('github-workflow exposes compact list descriptions plus lazy-loaded handbook detail (#13736)', async () => {
        const
            server        = servers.find(item => item.name === 'github-workflow'),
            {tools}       = await listTools(server),
            byName        = Object.fromEntries(tools.map(tool => [tool.name, tool])),
            moduleUrl     = pathToFileURL(path.join(repoRoot, server.toolServicePath)).href,
            {callTool}    = await import(moduleUrl),
            handbook      = await callTool('get_mcp_tool_handbook', {toolId: 'update_issue_relationship'}),
            missing       = await callTool('get_mcp_tool_handbook', {toolId: 'missing_tool'}),
            relationship  = byName.update_issue_relationship,
            conversation  = byName.get_conversation,
            review        = byName.manage_pr_review,
            handbookTool  = byName.get_mcp_tool_handbook;

        expect(handbookTool.description.length).toBeLessThanOrEqual(120);
        expect(handbookTool.annotations.readOnlyHint).toBe(true);
        expect(relationship.description).toBe('Create, replace, or remove issue parent-child and blocked-by relationships.');
        expect(relationship.description).not.toContain('Run `sync_all`');
        expect(conversation.description).toBe('Fetch a pull request or issue conversation with optional comment-window selectors.');
        expect(review.description).toBe('Create or update one formal PR review with body and review state validation.');

        for (const tool of tools) {
            expect(tool.description.length, `github-workflow.${tool.name} description is not compact`).toBeLessThanOrEqual(120);
        }

        expect(handbook).toMatchObject({
            toolId: 'update_issue_relationship',
            found : true,
            source: 'description'
        });
        expect(handbook.handbook.replace(/\s+/g, ' ')).toContain('Run `sync_all` to update local markdown files');

        expect(missing).toEqual({
            toolId : 'missing_tool',
            found  : false,
            code   : 'TOOL_NOT_FOUND',
            message: 'Tool "missing_tool" does not exist in this MCP server.'
        });
    });

    test('neural-link exposes compact list descriptions plus lazy-loaded handbook detail (#9953)', async () => {
        const
            server       = servers.find(item => item.name === 'neural-link'),
            {tools}      = await listTools(server),
            byName       = Object.fromEntries(tools.map(tool => [tool.name, tool])),
            moduleUrl    = pathToFileURL(path.join(repoRoot, server.toolServicePath)).href,
            {callTool}   = await import(moduleUrl),
            handbook     = await callTool('get_mcp_tool_handbook', {toolId: 'find_instances'}),
            missing       = await callTool('get_mcp_tool_handbook', {toolId: 'missing_tool'}),
            findInstances = byName.find_instances,
            handbookTool  = byName.get_mcp_tool_handbook;

        expect(handbookTool.description.length).toBeLessThanOrEqual(120);
        expect(handbookTool.annotations.readOnlyHint).toBe(true);
        expect(findInstances.description).toBe('Find Instances');
        expect(findInstances.description).not.toContain('StateProviders');

        for (const tool of tools) {
            expect(tool.description.length, `neural-link.${tool.name} description is not compact`).toBeLessThanOrEqual(120);
        }

        expect(handbook).toMatchObject({
            toolId: 'find_instances',
            found : true,
            source: 'description'
        });
        expect(handbook.handbook).toContain('StateProviders');

        expect(missing).toEqual({
            toolId : 'missing_tool',
            found  : false,
            code   : 'TOOL_NOT_FOUND',
            message: 'Tool "missing_tool" does not exist in this MCP server.'
        });
    });

    test('neural-link embedded-harness projection lists only default-visible tier tools (#13084)', async () => {
        const
            server           = servers.find(item => item.name === 'neural-link'),
            {tools: full}    = await listTools(server),
            moduleUrl        = pathToFileURL(path.join(repoRoot, server.toolServicePath)).href,
            {listTools: listNeuralLinkTools} = await import(moduleUrl),
            {tools: projected} = listNeuralLinkTools({toolProjection: {mode: 'harness-embedded'}}),
            projectedNames   = projected.map(tool => tool.name).sort(),
            expectedNames    = getHarnessEmbeddedOperationIds(server).sort(),
            operations       = getOperationsById(server);

        expect(projectedNames).toEqual(expectedNames);
        expect(projected.length).toBeLessThan(full.length);

        const nonReadProjected = projectedNames.filter(name => operations[name]['x-neo-tool-tier'] !== 'read');
        expect(nonReadProjected, `Embedded projection leaked non-read tools:\n${nonReadProjected.join('\n')}`).toEqual([]);
    });

    test('neural-link maps MCP request metadata to the embedded-harness projection context (#13084)', async () => {
        const
            server    = servers.find(item => item.name === 'neural-link'),
            moduleUrl = pathToFileURL(path.join(repoRoot, 'ai/mcp/server/neural-link/Server.mjs')).href,
            Server    = (await import(moduleUrl)).default;

        expect(Server.prototype.buildToolProjectionContext({request: {params: {}}})).toBeNull();
        expect(Server.prototype.buildToolProjectionContext({
            request: {params: {_meta: {neoToolProjection: 'harness-embedded'}}}
        })).toEqual({mode: 'harness-embedded'});
        expect(server.name).toBe('neural-link');
    });

    test('ToolService refuses embedded-harness calls outside the projected tier (#13084)', async () => {
        const
            server = servers.find(item => item.name === 'neural-link'),
            toolService   = Neo.create(ToolService, {
                openApiFilePath: path.join(repoRoot, server.openApiPath),
                serviceMapping : {
                    healthcheck: async () => ({status: 'ok'}),
                    patch_code : async () => ({patched: true})
                }
            }),
            toolProjection = {mode: 'harness-embedded'};

        await expect(toolService.callTool('healthcheck', {}, {toolProjection})).resolves.toEqual({status: 'ok'});
        await expect(toolService.callTool('patch_code', {}, {toolProjection})).rejects.toThrow(
            /Tool "patch_code" is not visible in the harness-embedded projection/
        );
    });

    test('neural-link server-instance forced mode is the ceiling — client cannot widen via _meta (#13106)', async () => {
        const
            moduleUrl = pathToFileURL(path.join(repoRoot, 'ai/mcp/server/neural-link/Server.mjs')).href,
            Server    = (await import(moduleUrl)).default,
            ctx       = Server.prototype.buildToolProjectionContext;

        // Unforced (default): client _meta selects the projection; absent → null (full surface, back-compat).
        expect(ctx.call({toolProjectionMode: null}, {request: {params: {}}})).toBeNull();
        expect(ctx.call({toolProjectionMode: null}, {request: {params: {_meta: {neoToolProjection: 'harness-embedded'}}}}))
            .toEqual({mode: 'harness-embedded'});

        // Forced: every request is pinned to the forced mode REGARDLESS of client _meta — omitting
        // _meta no longer escalates to the full surface, and a client cannot widen past the ceiling.
        expect(ctx.call({toolProjectionMode: 'harness-embedded'}, {request: {params: {}}}))
            .toEqual({mode: 'harness-embedded'});
        expect(ctx.call({toolProjectionMode: 'harness-embedded'}, {request: {params: {_meta: {}}}}))
            .toEqual({mode: 'harness-embedded'});
        expect(ctx.call({toolProjectionMode: 'harness-embedded'}, {request: {params: {_meta: {neoToolProjection: 'full'}}}}))
            .toEqual({mode: 'harness-embedded'});
    });

    test('BaseServer default buildToolProjectionContext honors the forced-mode ceiling (#13106)', async () => {
        const
            moduleUrl  = pathToFileURL(path.join(repoRoot, 'ai/mcp/server/BaseServer.mjs')).href,
            BaseServer = (await import(moduleUrl)).default,
            ctx        = BaseServer.prototype.buildToolProjectionContext;

        expect(ctx.call({toolProjectionMode: null},               {request: {params: {}}})).toBeNull();
        expect(ctx.call({toolProjectionMode: 'harness-embedded'}, {request: {params: {}}})).toEqual({mode: 'harness-embedded'});
    });

    test('forced harness-embedded mode lists only read-tier tools end-to-end, even with omitted _meta (#13106)', async () => {
        const
            server      = servers.find(item => item.name === 'neural-link'),
            nlModuleUrl = pathToFileURL(path.join(repoRoot, 'ai/mcp/server/neural-link/Server.mjs')).href,
            Server      = (await import(nlModuleUrl)).default,
            // server pinned to harness-embedded; client sends NO _meta (the omitted-_meta bypass path)
            forcedContext = Server.prototype.buildToolProjectionContext.call(
                {toolProjectionMode: 'harness-embedded'}, {request: {params: {}}}
            ),
            tsModuleUrl   = pathToFileURL(path.join(repoRoot, server.toolServicePath)).href,
            {listTools: listNL} = await import(tsModuleUrl),
            {tools}       = listNL({toolProjection: forcedContext}),
            operations    = getOperationsById(server),
            projectedNames = tools.map(tool => tool.name).sort(),
            nonRead       = projectedNames.filter(name => operations[name]['x-neo-tool-tier'] !== 'read');

        expect(forcedContext).toEqual({mode: 'harness-embedded'});
        expect(nonRead, `forced mode leaked non-read tools despite omitted _meta:\n${nonRead.join('\n')}`).toEqual([]);
        expect(projectedNames).toEqual(getHarnessEmbeddedOperationIds(server).sort());
    });

    test('SECURITY: an explicitly-configured empty/whitespace forced mode fails CLOSED, not full-surface (#13106 cross-family RA)', async () => {
        const
            nlCtx   = (await import(pathToFileURL(path.join(repoRoot, 'ai/mcp/server/neural-link/Server.mjs')).href)).default.prototype.buildToolProjectionContext,
            baseCtx = (await import(pathToFileURL(path.join(repoRoot, 'ai/mcp/server/BaseServer.mjs')).href)).default.prototype.buildToolProjectionContext;

        // Only null/undefined is "unset" (trusted full surface). A configured empty/whitespace string
        // is a forced mode → {mode: <value>} → ToolService fails closed (not 'harness-embedded'). A
        // truthiness check would erase '' into the unset/full-surface case — the fail-OPEN this guards.
        for (const ctx of [nlCtx, baseCtx]) {
            expect(ctx.call({toolProjectionMode: undefined}, {request: {params: {}}})).toBeNull();
            expect(ctx.call({toolProjectionMode: null},      {request: {params: {}}})).toBeNull();
            expect(ctx.call({toolProjectionMode: ''},        {request: {params: {}}})).toEqual({mode: ''});
            expect(ctx.call({toolProjectionMode: '   '},     {request: {params: {}}})).toEqual({mode: '   '});
        }

        // end-to-end: a server pinned to '' lists ZERO tools (fail-closed), never the full surface.
        const
            server            = servers.find(item => item.name === 'neural-link'),
            {listTools: listNL} = await import(pathToFileURL(path.join(repoRoot, server.toolServicePath)).href),
            {tools: full}        = listNL(),
            {tools: emptyForced} = listNL({toolProjection: {mode: ''}});

        expect(full.length).toBeGreaterThan(0);
        expect(emptyForced, 'empty configured forced-mode leaked tools (should fail closed)').toEqual([]);
    });

    test('resolveToolProjectionMode: CLI wins → NEO_NL_TOOL_PROJECTION_MODE env fallback → null (#13121)', async () => {
        const {resolveToolProjectionMode} = await import(pathToFileURL(path.join(repoRoot, 'ai/mcp/server/neural-link/Server.mjs')).href);

        // CLI flag wins over the env fallback
        expect(resolveToolProjectionMode('harness-embedded', {})).toBe('harness-embedded');
        expect(resolveToolProjectionMode('full', {NEO_NL_TOOL_PROJECTION_MODE: 'harness-embedded'})).toBe('full');
        // env fallback when the CLI flag is absent (the Fleet Manager spawn-injection channel)
        expect(resolveToolProjectionMode(null,      {NEO_NL_TOOL_PROJECTION_MODE: 'harness-embedded'})).toBe('harness-embedded');
        expect(resolveToolProjectionMode(undefined, {NEO_NL_TOOL_PROJECTION_MODE: 'harness-embedded'})).toBe('harness-embedded');
        // neither set → null (unforced → full developer/operator surface)
        expect(resolveToolProjectionMode(null,      {})).toBeNull();
        expect(resolveToolProjectionMode(undefined, {})).toBeNull();
    });
});
