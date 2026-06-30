import {test, expect}  from '@playwright/test';
import fs              from 'fs';
import path            from 'path';
import {fileURLToPath} from 'url';
import * as yaml       from 'js-yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const repoRoot   = path.resolve(__dirname, '../../../../../..');

// Agent-consumed tool guides paired with their OpenAPI SSOT. Conceptual guides should not copy the
// generated operation catalog; duplicating it creates the same drift class as stale tables. This guard
// asserts the guide delegates the exact contract to OpenAPI and the lazy tool handbook, while any
// explicit operation-count claim stays anchored to the generated operationId set.
const guidePairs = [
    {label: 'neural-link', guide: 'learn/agentos/NeuralLink.md', openapi: 'ai/mcp/server/neural-link/openapi.yaml'}
];

/**
 * Extracts the documented tool names from a guide's markdown tool-tables — rows shaped ``| `tool_name` | … |``.
 * A conceptual guide that starts copying the generated catalog again surfaces here. That duplication
 * should either be removed from the guide or turned into a generated artifact, never hand-maintained.
 * @param {String} markdown
 * @returns {Set<String>}
 */
function documentedToolNames(markdown) {
    const names = new Set();

    for (const line of markdown.split('\n')) {
        const match = line.match(/^\|\s*`([a-z][a-z0-9_]*)`\s*\|/);

        if (match) {
            names.add(match[1])
        }
    }

    return names
}

/**
 * Extracts the `operationId` set (the canonical, generated tool surface) from a parsed OpenAPI document.
 * @param {Object} doc
 * @returns {Set<String>}
 */
function openapiOperationIds(doc) {
    const ids = new Set();

    for (const pathItem of Object.values(doc.paths || {})) {
        for (const operation of Object.values(pathItem)) {
            if (operation?.operationId) {
                ids.add(operation.operationId)
            }
        }
    }

    return ids
}

test.describe('Agent-guide ↔ OpenAPI tool-contract references', () => {
    for (const {label, guide, openapi} of guidePairs) {
        test(`${label}: ${guide} delegates the exact tool surface to OpenAPI`, () => {
            const
                markdown       = fs.readFileSync(path.join(repoRoot, guide), 'utf8'),
                documentedRows = [...documentedToolNames(markdown)].sort(),
                exposed        = openapiOperationIds(yaml.load(fs.readFileSync(path.join(repoRoot, openapi), 'utf8')));

            expect(exposed.size, `${openapi} should expose at least one operationId`).toBeGreaterThan(0);

            expect(documentedRows,
                `${guide} should not hand-maintain tool table rows; delegate exact coverage to ${openapi}: ${documentedRows.join(', ') || '—'}`
            ).toEqual([]);

            expect(markdown,
                `${guide} should link the OpenAPI SSOT for the exact Neural Link tool contract`
            ).toContain(openapi);

            expect(markdown,
                `${guide} should point agents to the lazy handbook for operation-level usage detail`
            ).toContain('get_mcp_tool_handbook');

            expect(markdown,
                `${guide} claims a Neural Link operation count; keep it anchored to ${openapi}`
            ).toContain(`${exposed.size} operation IDs`)
        })
    }
});
