import {test, expect}  from '@playwright/test';
import fs              from 'fs';
import path            from 'path';
import {fileURLToPath} from 'url';
import yaml            from 'js-yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const repoRoot   = path.resolve(__dirname, '../../../../../..');

// Agent-consumed tool guides paired with their OpenAPI SSOT. A guide's curated domain tables are a
// human-readable overview; this guard asserts they stay in TOOL-COVERAGE parity with the generated
// operationId set, so a guide cannot silently drift from the surface it documents — the failure this
// guards: a guide claiming "33 tools" while the live surface exposed 41 (the entire mutation surface
// undocumented), caught only by a manual diff after it shipped. Per-tool DESCRIPTION prose stays
// free-form; only tool-NAME presence is
// checked. Extend the guard to another MCP-server guide by adding a {label, guide, openapi} row.
const guidePairs = [
    {label: 'neural-link', guide: 'learn/agentos/NeuralLink.md', openapi: 'ai/mcp/server/neural-link/openapi.yaml'}
];

/**
 * Extracts the documented tool names from a guide's markdown tool-tables — rows shaped ``| `tool_name` | … |``.
 * Assumes the tool tables are the guide's only backtick-first-column tables (true for the Neural Link guide);
 * a guide that ever violates this surfaces here as a drift mismatch, prompting either a guide fix or a scoped
 * extractor — the guard failing loud is the intended behavior, never a silent miss.
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

test.describe('Agent-guide ↔ OpenAPI tool-coverage parity', () => {
    for (const {label, guide, openapi} of guidePairs) {
        test(`${label}: ${guide} documents exactly the OpenAPI tool surface`, () => {
            const
                documented = documentedToolNames(fs.readFileSync(path.join(repoRoot, guide), 'utf8')),
                exposed    = openapiOperationIds(yaml.load(fs.readFileSync(path.join(repoRoot, openapi), 'utf8'))),
                missing    = [...exposed].filter(id => !documented.has(id)).sort(),   // exposed but undocumented
                extra      = [...documented].filter(id => !exposed.has(id)).sort();   // documented but not exposed

            expect(missing,
                `${guide} is missing tools the OpenAPI exposes (drift — add the rows): ${missing.join(', ') || '—'}`
            ).toEqual([]);

            expect(extra,
                `${guide} documents tools absent from the OpenAPI (drift — stale rows): ${extra.join(', ') || '—'}`
            ).toEqual([])
        })
    }
});
