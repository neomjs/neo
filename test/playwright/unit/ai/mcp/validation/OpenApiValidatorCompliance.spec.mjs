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

test.describe('OpenApiValidator: strict JSON-Schema compliance for array types', () => {
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

    for (const server of servers) {
        test(`${server}: every emitted input/output schema has items on array nodes`, () => {
            const yamlPath = path.join(repoRoot, 'ai/mcp/server', server, 'openapi.yaml');
            expect(fs.existsSync(yamlPath), `${yamlPath} missing`).toBe(true);

            const doc     = yaml.load(fs.readFileSync(yamlPath, 'utf8'));
            const offenders = [];

            for (const [urlPath, pathItem] of Object.entries(doc.paths || {})) {
                for (const [method, op] of Object.entries(pathItem)) {
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
    }
});
