import {setup} from '../../../setup.mjs';

const appName = 'McpSchemaCompactionTest';

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

import {test, expect}  from '@playwright/test';
import path            from 'path';
import {fileURLToPath} from 'url';
import Neo             from '../../../../../src/Neo.mjs';

/**
 * The `tools/list` schema-prose projection (`compactToolSchemas`).
 *
 * The description compaction (`compactToolDescriptions`) capped the operation line but shipped the
 * schemas beside it whole: every `description:` inside `inputSchema` / `outputSchema` rode the
 * listing in full — measured at ~49.8KB across 666 fields on five servers, ≥74% of the remaining
 * description payload. The projection here strips ONLY the `description` annotation key,
 * recursively, so shape (and therefore the accept/reject semantics MCP clients validate against)
 * is unchanged by construction; the fully-described schema relocates into the lazy handbook
 * payload — relocated, never deleted.
 *
 * The file-system server (7 operations, the smallest real contract) is the live witness; the
 * sibling advertisedSurfaceDigest.spec.mjs carries the digest-canary half (AC-5).
 */
test.describe('ToolService compactToolSchemas — the schema-prose projection (#16588)', () => {
    const
        __filename = fileURLToPath(import.meta.url),
        __dirname  = path.dirname(__filename),
        repoRoot   = path.resolve(__dirname, '../../../../..');

    let ToolService;

    test.beforeAll(async () => {
        ToolService = (await import('../../../../../ai/mcp/ToolService.mjs')).default
    });

    /**
     * @summary Collects every `description` value under a schema node, recursively.
     * @param {*} node
     * @param {String[]} [hits]
     * @returns {String[]}
     */
    function collectDescriptions(node, hits=[]) {
        if (Array.isArray(node)) {
            node.forEach(item => collectDescriptions(item, hits))
        } else if (node && typeof node === 'object') {
            Object.entries(node).forEach(([key, value]) => {
                if (key === 'description') {
                    hits.push(value)
                } else {
                    collectDescriptions(value, hits)
                }
            })
        }

        return hits
    }

    test.describe('stripSchemaDescriptions — the pure projection', () => {
        // Every shape-bearing keyword the contract uses today, with prose at every level.
        const DESCRIBED = Object.freeze({
            type       : 'object',
            description: 'root prose',
            properties : {
                name: {type: 'string', description: 'name prose'},
                tags: {type: 'array', description: 'tags prose', items: {type: 'string', description: 'item prose'}},
                mode: {enum: ['a', 'b'], description: 'mode prose', default: 'a'}
            },
            required            : ['name'],
            additionalProperties: {type: 'number', description: 'ap prose'},
            oneOf               : [{type: 'null', description: 'oneOf prose'}],
            $defs               : {entry: {type: 'string', description: 'def prose', format: 'uuid'}}
        });

        // The accept/reject proof: the projection must equal the fixture minus annotation keys
        // exactly — `description` is never asserted by JSON Schema, so this twin validates the
        // identical set. A whitelist slip (a dropped assertion keyword) fails this equality.
        const STRIPPED_TWIN = {
            type      : 'object',
            properties: {
                name: {type: 'string'},
                tags: {type: 'array', items: {type: 'string'}},
                mode: {enum: ['a', 'b'], default: 'a'}
            },
            required            : ['name'],
            additionalProperties: {type: 'number'},
            oneOf               : [{type: 'null'}],
            $defs               : {entry: {type: 'string', format: 'uuid'}}
        };

        test('drops every description key, recursively, and nothing else', () => {
            const service  = Object.create(ToolService.prototype),
                  stripped = service.stripSchemaDescriptions(DESCRIBED);

            expect(stripped).toEqual(STRIPPED_TWIN);
            expect(collectDescriptions(stripped)).toEqual([])
        });

        test('never mutates the described input — the handbook keeps the prose', () => {
            const service  = Object.create(ToolService.prototype),
                  stripped = service.stripSchemaDescriptions(DESCRIBED);

            expect(stripped).not.toBe(DESCRIBED);
            expect(collectDescriptions(DESCRIBED)).toHaveLength(8)
        });

        test('arrays and scalars pass through; null stays null', () => {
            const service = Object.create(ToolService.prototype);

            expect(service.stripSchemaDescriptions(null)).toBe(null);
            expect(service.stripSchemaDescriptions('description')).toBe('description');
            expect(service.stripSchemaDescriptions([{description: 'x', type: 'string'}])).toEqual([{type: 'string'}])
        })
    });

    test.describe('the real file-system contract — listing stripped, handbook described', () => {
        let fsService, tools;

        test.beforeAll(async () => {
            fsService      = await import('../../../../../ai/mcp/server/file-system/services/toolService.mjs');
            ({tools}       = await fsService.listTools())
        });

        test('AC-1: no description key survives anywhere in a listed schema', () => {
            expect(tools.length).toBeGreaterThan(0);

            for (const tool of tools) {
                expect(collectDescriptions(tool.inputSchema), `${tool.name}.inputSchema`).toEqual([]);

                if (tool.outputSchema) {
                    expect(collectDescriptions(tool.outputSchema), `${tool.name}.outputSchema`).toEqual([])
                }
            }
        });

        test('AC-3: the handbook payload carries the fully-described schema — relocated, not deleted', async () => {
            // The file-system contract authors 27 description fields; at least one tool must pair
            // a prose-free listing with a prose-carrying handbook entry.
            let paired = 0;

            for (const tool of tools) {
                const handbook  = await fsService.callTool('get_mcp_tool_handbook', {toolId: tool.name}),
                      inSchema  = collectDescriptions(handbook.inputSchema),
                      outSchema = handbook.outputSchema ? collectDescriptions(handbook.outputSchema) : [];

                if (inSchema.length + outSchema.length > 0) {
                    paired++;
                    expect(collectDescriptions(tool.inputSchema)).toEqual([])
                }
            }

            expect(paired, 'the authored prose must reach the handbook of at least one tool').toBeGreaterThan(0)
        })
    });

    test.describe('AC-4: default-off is byte-identical to the pre-flag behavior', () => {
        test('a fresh service without the flag lists described schemas and a schema-free handbook', async () => {
            const service = Neo.create(ToolService, {
                    openApiFilePath: path.join(repoRoot, 'ai/mcp/server/file-system/openapi.yaml'),
                    serviceMapping : {}
                }),
                {tools} = await service.listTools();

            expect(tools.length).toBeGreaterThan(0);
            expect(service.compactToolSchemas).toBe(false);

            // the listing still carries prose…
            const described = tools.filter(tool => collectDescriptions(tool.inputSchema).length > 0);
            expect(described.length, 'default-off keeps the descriptions on the listing').toBeGreaterThan(0);

            // …and the handbook entry shape is untouched — no relocated schema keys.
            const handbook = service.getToolHandbook(tools[0].name);
            expect(handbook.inputSchema).toBeUndefined();
            expect(handbook.outputSchema).toBeUndefined();
            expect(Object.keys(handbook).sort()).toEqual(['description', 'found', 'handbook', 'source', 'title', 'toolId'])
        })
    })
});
