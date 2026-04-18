import {test, expect}        from '@playwright/test';
import fs                    from 'fs';
import path                  from 'path';
import {fileURLToPath}       from 'url';
import yaml                  from 'js-yaml';
import {zodToJsonSchema}     from 'zod-to-json-schema';
import {buildZodSchema,
        buildOutputZodSchema} from '../../../../../../ai/mcp/validation/OpenApiValidator.mjs';

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

        test(`${server}: every emitted input schema stays strict (regression guard against #9837 overreach)`, () => {
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
