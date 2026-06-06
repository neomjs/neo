import {test, expect}        from '@playwright/test';
import fs                    from 'fs';
import path                  from 'path';
import {fileURLToPath}       from 'url';
import yaml                  from 'js-yaml';
import {zodToJsonSchema}     from 'zod-to-json-schema';
import {buildZodSchema,
        buildOutputZodSchema} from '../../../../../../ai/mcp/validation/openApiValidator.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const repoRoot   = path.resolve(__dirname, '../../../../../..');

const servers = ['file-system', 'github-workflow', 'knowledge-base', 'memory-core', 'neural-link'];

/**
 * Walks a JSON Schema node and returns every dotted path where a `type: "array"` node
 * lacks an `items` property. Strict JSON-Schema validators (e.g. GitHub Copilot's MCP
 * client) reject such schemas with "array type must have items".
 *
 * @param {object} node           The schema node to walk.
 * @param {string} pathLabel=''   Dotted path label for error reporting.
 * @returns {string[]}            Paths of non-compliant array nodes (empty when compliant).
 */
function findArraysWithoutItems(node, pathLabel = '') {
    const findings = [];
    const walk = (n, p) => {
        if (!n || typeof n !== 'object') return;
        if (!Array.isArray(n) && n.type === 'array' && !('items' in n)) findings.push(p);
        if (Array.isArray(n)) n.forEach((v, i) => walk(v, `${p}[${i}]`));
        else for (const k in n) walk(n[k], `${p}.${k}`);
    };
    walk(node, pathLabel);
    return findings;
}

/**
 * Walks a JSON Schema node and returns every dotted path where a `type: "object"` node
 * sets `additionalProperties: false`. For OUTPUT schemas this is the #9837 drift bug —
 * server implementations return fields the OpenAPI contract forgot to declare, and
 * strict MCP clients (GitHub Copilot) reject the payload with
 * "data/result/0 must NOT have additional properties". OUTPUT schemas should stay
 * lenient; INPUT schemas intentionally stay strict (this helper is only used against
 * output emissions).
 *
 * @param {object} node           The schema node to walk.
 * @param {string} pathLabel=''   Dotted path label for error reporting.
 * @returns {string[]}            Paths of strict object nodes (empty when lenient).
 */
function findStrictObjects(node, pathLabel = '') {
    const findings = [];
    const walk = (n, p) => {
        if (!n || typeof n !== 'object') return;
        if (!Array.isArray(n) && n.type === 'object' && n.additionalProperties === false) findings.push(p);
        if (Array.isArray(n)) n.forEach((v, i) => walk(v, `${p}[${i}]`));
        else for (const k in n) walk(n[k], `${p}.${k}`);
    };
    walk(node, pathLabel);
    return findings;
}

/**
 * Walks a JSON Schema node looking for INPUT "open-bag" objects that would silently
 * strip their payload to `{}` — the #10070 regression. An open-bag is a `type: "object"`
 * node that declares NO child `properties` (the author signaled "caller decides the
 * shape") AND strict `additionalProperties: false` (Zod then drops every unknown key).
 * The root of an input schema is excluded — top-level inputs with declared fields
 * legitimately stay strict; we only care about *nested* open-bag slots like
 * `properties`, `selector`, `data`, `config`.
 *
 * @param {object} node           The schema node to walk.
 * @param {string} pathLabel=''   Dotted path label for error reporting.
 * @returns {string[]}            Paths of silently-stripping open-bag nodes (empty when safe).
 */
function findSilentlyStrippingOpenBags(node, pathLabel = '') {
    const findings = [];
    const walk = (n, p, isRoot) => {
        if (!n || typeof n !== 'object') return;
        if (!isRoot && !Array.isArray(n) && n.type === 'object' && !n.properties && n.additionalProperties === false) {
            findings.push(p);
        }
        if (Array.isArray(n)) n.forEach((v, i) => walk(v, `${p}[${i}]`, false));
        else for (const k in n) walk(n[k], `${p}.${k}`, false);
    };
    walk(node, pathLabel, true);
    return findings;
}

test.describe('OpenApiValidator: strict-client JSON-Schema compliance', () => {
    /**
     * Direct regression for https://github.com/neomjs/neo/issues/10064. Prior to the fix,
     * `z.array(z.any())` emitted `{"type":"array"}` under `target:'openApi3'` — stripping
     * the `items` field entirely — which caused GitHub Copilot to reject `call_method`.
     * `z.unknown()` preserves `items: {}`, satisfying strict validators.
     */
    test('z.array(z.unknown()) emits items under openApi3 target', async () => {
        const {z} = await import('zod');
        const schema = zodToJsonSchema(z.array(z.unknown()), {target: 'openApi3', $refStrategy: 'none'});
        expect(schema.type).toBe('array');
        expect(schema).toHaveProperty('items');
    });

    /**
     * Direct regression for https://github.com/neomjs/neo/issues/9837 (re-purposed).
     * Confirms that `.passthrough()` on a `z.object(...)` flips the emission to
     * `additionalProperties: true`. This is the mechanism by which output schemas
     * tolerate server-side drift in returned fields.
     */
    test('z.object(...).passthrough() emits additionalProperties:true', async () => {
        const {z} = await import('zod');
        const strict  = zodToJsonSchema(z.object({a: z.string()}));
        const lenient = zodToJsonSchema(z.object({a: z.string()}).passthrough());
        expect(strict.additionalProperties).toBe(false);
        expect(lenient.additionalProperties).toBe(true);
    });

    /**
     * Direct regression for https://github.com/neomjs/neo/issues/10070. Prior to the fix,
     * `type: object` with no declared `properties` emitted strict `z.object({})` which
     * Zod parses by stripping every unknown key — silently nulling the entire payload
     * on open-bag inputs like `set_instance_properties.properties`. The fix emits
     * `z.object({}).passthrough()` in that case, preserving the caller's payload.
     */
    test('buildZodSchema preserves open-bag input payloads (set_instance_properties.properties)', async () => {
        const doc = yaml.load(fs.readFileSync(path.join(repoRoot, 'ai/mcp/server/neural-link/openapi.yaml'), 'utf8'));
        const op  = doc.paths['/instance/properties/set'].post;
        const parsed = buildZodSchema(doc, op).parse({
            id        : 'neo-button-1',
            properties: {text: 'KEEP_ME', arbitraryKey: 42}
        });
        expect(parsed.properties).toEqual({text: 'KEEP_ME', arbitraryKey: 42});
    });

    /**
     * Direct regression for https://github.com/neomjs/neo/issues/10527.
     * Prior to the fix, `buildZodSchemaFromNode` blindly converted string schemas
     * to `z.string()`, entirely dropping any `enum` constraint defined in OpenAPI.
     * This test confirms that string parameters with enums correctly generate `z.enum()`.
     */
    test('buildZodSchema preserves enum constraints for string inputs (#10527)', async () => {
        const doc = {
            paths: {
                '/test': {
                    post: {
                        operationId: 'test_enum',
                        requestBody: {
                            content: {
                                'application/json': {
                                    schema: {
                                        type: 'object',
                                        properties: {
                                            action: { type: 'string', enum: ['start', 'stop'] }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        };
        const op = doc.paths['/test'].post;
        const schema = zodToJsonSchema(buildZodSchema(doc, op), {target: 'openApi3', $refStrategy: 'none'});

        expect(schema.properties.action.type).toBe('string');
        expect(schema.properties.action.enum).toEqual(['start', 'stop']);
    });

    /**
     * Direct regression for https://github.com/neomjs/neo/issues/10531.
     * The MCP tool-shape compiler must preserve OpenAPI defaults, numeric bounds,
     * and native choice enums so agents learn valid calls from `tools/list`.
     */
    test('memory-core input schemas preserve defaults, bounds, and choice enums (#10531)', async () => {
        const doc                = yaml.load(fs.readFileSync(path.join(repoRoot, 'ai/mcp/server/memory-core/openapi.yaml'), 'utf8')),
              addMessageSchema   = zodToJsonSchema(buildZodSchema(doc, doc.paths['/mailbox/messages'].post), {target: 'openApi3', $refStrategy: 'none'}),
              listMessagesSchema = zodToJsonSchema(buildZodSchema(doc, doc.paths['/mailbox/messages'].get),  {target: 'openApi3', $refStrategy: 'none'}),
              wakeSchema         = zodToJsonSchema(buildZodSchema(doc, doc.paths['/wake-subscriptions/manage'].post), {target: 'openApi3', $refStrategy: 'none'}),
              coalesceWindow     = wakeSchema.properties.harnessTargetMetadata.properties.coalesceWindow;

        expect(addMessageSchema.properties.priority.enum).toEqual(['low', 'normal', 'high']);
        expect(addMessageSchema.properties.priority.default).toBe('normal');
        expect(addMessageSchema.properties.wakeSuppressed.default).toBe(false);

        expect(listMessagesSchema.properties.box.enum).toEqual(['inbox', 'outbox', 'all']);
        expect(listMessagesSchema.properties.box.default).toBe('inbox');
        expect(listMessagesSchema.properties.status.enum).toEqual(['all', 'read', 'unread']);
        expect(listMessagesSchema.properties.status.default).toBe('all');
        expect(listMessagesSchema.properties.limit.default).toBe(50);
        expect(listMessagesSchema.properties.offset.default).toBe(0);

        expect(coalesceWindow.type).toBe('integer');
        expect(coalesceWindow.minimum).toBe(0);
        expect(coalesceWindow.maximum).toBe(300);
    });

    test('knowledge-base query schemas expose skill, adr, and concept content types', async () => {
        const expectedTypes = ['all', 'blog', 'guide', 'src', 'example', 'ticket', 'release', 'test', 'skill', 'adr', 'concept'],
              doc           = yaml.load(fs.readFileSync(path.join(repoRoot, 'ai/mcp/server/knowledge-base/openapi.yaml'), 'utf8')),
              queryOp       = doc.paths['/documents/query'].post,
              askOp         = doc.paths['/knowledge/ask'].post,
              querySchema   = zodToJsonSchema(buildZodSchema(doc, queryOp), {target: 'openApi3', $refStrategy: 'none'}),
              askSchema     = zodToJsonSchema(buildZodSchema(doc, askOp), {target: 'openApi3', $refStrategy: 'none'}),
              queryType     = doc.components.schemas.QueryRequest.properties.type;

        expect(queryType.enum).toEqual(expectedTypes);
        expect(queryType.description).toContain('`test`');
        expect(queryType.description).toContain('`skill`');
        expect(queryType.description).toContain('`adr`');
        expect(queryType.description).toContain('`concept`');
        expect(querySchema.properties.type.enum).toEqual(expectedTypes);
        expect(askSchema.properties.type.enum).toEqual(expectedTypes);
    });

    for (const server of servers) {
        test(`${server}: every emitted input/output schema has items on array nodes (#10064)`, () => {
            const yamlPath = path.join(repoRoot, 'ai/mcp/server', server, 'openapi.yaml');
            expect(fs.existsSync(yamlPath), `${yamlPath} missing`).toBe(true);

            const doc     = yaml.load(fs.readFileSync(yamlPath, 'utf8'));
            const offenders = [];

            for (const [, pathItem] of Object.entries(doc.paths || {})) {
                for (const [, op] of Object.entries(pathItem)) {
                    if (!op?.operationId) continue;

                    const inputSchema  = zodToJsonSchema(buildZodSchema(doc, op), {target: 'openApi3', $refStrategy: 'none'}),
                          outputZod    = buildOutputZodSchema(doc, op),
                          outputSchema = outputZod ? zodToJsonSchema(outputZod) : null;

                    offenders.push(...findArraysWithoutItems(inputSchema,  `${op.operationId}.input`));
                    if (outputSchema) {
                        offenders.push(...findArraysWithoutItems(outputSchema, `${op.operationId}.output`));
                    }
                }
            }

            expect(offenders, `Non-compliant array nodes in ${server}:\n${offenders.join('\n')}`).toEqual([]);
        });

        test(`${server}: every emitted output schema tolerates extra properties (#9837)`, () => {
            const yamlPath = path.join(repoRoot, 'ai/mcp/server', server, 'openapi.yaml');
            const doc      = yaml.load(fs.readFileSync(yamlPath, 'utf8'));
            const offenders = [];

            for (const [, pathItem] of Object.entries(doc.paths || {})) {
                for (const [, op] of Object.entries(pathItem)) {
                    if (!op?.operationId) continue;

                    const outputZod = buildOutputZodSchema(doc, op);
                    if (!outputZod) continue;

                    offenders.push(...findStrictObjects(zodToJsonSchema(outputZod), `${op.operationId}.output`));
                }
            }

            expect(
                offenders,
                `Strict object nodes in ${server} output schemas (server drift will reject valid responses):\n${offenders.join('\n')}`
            ).toEqual([]);
        });

        test(`${server}: no nested open-bag input objects silently strip payloads (#10070)`, () => {
            const yamlPath = path.join(repoRoot, 'ai/mcp/server', server, 'openapi.yaml');
            const doc      = yaml.load(fs.readFileSync(yamlPath, 'utf8'));
            const offenders = [];

            for (const [, pathItem] of Object.entries(doc.paths || {})) {
                for (const [, op] of Object.entries(pathItem)) {
                    if (!op?.operationId) continue;

                    const inputSchema = zodToJsonSchema(buildZodSchema(doc, op), {target: 'openApi3', $refStrategy: 'none'});
                    offenders.push(...findSilentlyStrippingOpenBags(inputSchema, `${op.operationId}.input`));
                }
            }

            expect(
                offenders,
                `Nested open-bag input nodes in ${server} still strip payloads (Zod strict empty-object default):\n${offenders.join('\n')}`
            ).toEqual([]);
        });

        test(`${server}: every emitted input schema stays strict at the root (regression guard against #9837 overreach)`, () => {
            const yamlPath = path.join(repoRoot, 'ai/mcp/server', server, 'openapi.yaml');
            const doc      = yaml.load(fs.readFileSync(yamlPath, 'utf8'));
            let checkedOps = 0;
            let strictOps  = 0;

            for (const [, pathItem] of Object.entries(doc.paths || {})) {
                for (const [, op] of Object.entries(pathItem)) {
                    if (!op?.operationId) continue;

                    const inputSchema = zodToJsonSchema(buildZodSchema(doc, op), {target: 'openApi3', $refStrategy: 'none'});

                    // The root input schema is always `z.object(...)` — should NOT be passthrough.
                    // (Individual nested property objects may legitimately be lenient; we only
                    // guard the top-level contract surface here so agents passing unknown top-level
                    // fields fail fast.)
                    if (inputSchema.type === 'object') {
                        checkedOps++;
                        if (inputSchema.additionalProperties === false) strictOps++;
                    }
                }
            }

            expect(checkedOps, `${server} exposes no object-typed input schemas — audit needed`).toBeGreaterThan(0);
            expect(strictOps, `${server} input-schema strictness must match op count`).toBe(checkedOps);
        });
    }
});
