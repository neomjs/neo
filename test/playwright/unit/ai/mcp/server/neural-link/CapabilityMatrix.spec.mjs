import {test, expect}  from '@playwright/test';
import fs              from 'fs';
import path            from 'path';
import {fileURLToPath} from 'url';
import * as yaml       from 'js-yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const repoRoot   = path.resolve(__dirname, '../../../../../../..');

const matrixPath  = path.join(repoRoot, 'learn/agentos/tooling/NeuralLinkCapabilityMatrix.md');
const openApiPath = path.join(repoRoot, 'ai/mcp/server/neural-link/openapi.yaml');

/**
 * Reads OpenAPI operations by operationId.
 * @param {object} doc Parsed OpenAPI document.
 * @returns {Object<string, object>} Operation map.
 */
function getOperationsById(doc) {
    const operations = {};

    for (const [, pathItem] of Object.entries(doc.paths || {})) {
        for (const [, op] of Object.entries(pathItem)) {
            if (op?.operationId) {
                operations[op.operationId] = op;
            }
        }
    }

    return operations;
}

/**
 * Parses the first-column operation ids from the capability matrix markdown table.
 * @param {string} markdown Matrix markdown.
 * @returns {Map<string, string[]>} Map of operation id to raw table cells.
 */
function getMatrixRows(markdown) {
    const section = markdown.match(/## Verb Matrix\n([\s\S]*?)\n## Gap Ledger/);

    expect(section, 'Missing Verb Matrix section').toBeTruthy();

    const rows = new Map();

    for (const line of section[1].split('\n')) {
        const match = line.match(/^\|\s*`([a-z0-9_]+)`\s*\|(.*)$/);

        if (!match) {
            continue
        }

        rows.set(match[1], match[2].split('|').map(cell => cell.trim()));
    }

    return rows
}

/**
 * Extracts the explicit never-direct operation list from the markdown marker block.
 * @param {string} markdown Matrix markdown.
 * @returns {string[]} Sorted operation ids.
 */
function getNeverModelDrivableSet(markdown) {
    const match = markdown.match(
        /<!-- nl-capability-matrix:never-model-drivable:start -->([\s\S]*?)<!-- nl-capability-matrix:never-model-drivable:end -->/
    );

    expect(match, 'Missing never-model-drivable marker block').toBeTruthy();

    return [...match[1].matchAll(/`([a-z0-9_]+)`/g)].map(item => item[1]).sort();
}

test.describe('Neural Link capability matrix (#14783)', () => {
    test('documents every registered Neural Link operation exactly once', () => {
        const
            markdown     = fs.readFileSync(matrixPath, 'utf8'),
            doc          = yaml.load(fs.readFileSync(openApiPath, 'utf8')),
            operationIds = Object.keys(getOperationsById(doc)).sort(),
            rowIds       = [...getMatrixRows(markdown).keys()].sort();

        expect(rowIds, 'Matrix rows must match OpenAPI operationIds').toEqual(operationIds);
    });

    test('keeps the explicit never-direct model set in sync with non-read tiers', () => {
        const
            markdown   = fs.readFileSync(matrixPath, 'utf8'),
            doc        = yaml.load(fs.readFileSync(openApiPath, 'utf8')),
            operations = getOperationsById(doc),
            nonReadIds = Object.entries(operations)
                .filter(([, op]) => op['x-neo-tool-tier'] !== 'read')
                .map(([id]) => id)
                .sort();

        expect(getNeverModelDrivableSet(markdown)).toEqual(nonReadIds);
    });

    test('requires complete firewall cells, with non-read rows denying direct generated payload execution', () => {
        const rows = getMatrixRows(fs.readFileSync(matrixPath, 'utf8'));

        for (const [operationId, cells] of rows.entries()) {
            const operationClass = cells[2],
                  firewall       = cells[5];

            expect(firewall, `${operationId} missing firewall cell`).toBeTruthy();

            if (operationClass !== '`read`') {
                expect(
                    firewall,
                    `${operationId} must deny direct model-generated payload execution`
                ).toContain('never direct from model-generated payload');
            }
        }
    });
});
