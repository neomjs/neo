#!/usr/bin/env node
/**
 * @summary Enforces canonical MCP server test placement.
 *
 * MCP server unit tests belong under `test/playwright/unit/ai/mcp/server/`.
 * The legacy `test/playwright/mcp/` tree is deprecated and may contain only
 * explicitly grandfathered files until they are migrated. This lint makes that
 * convention mechanical so new tests cannot silently land in the old tree.
 * @plane in-plane
 */
import fs              from 'node:fs';
import path            from 'node:path';
import process         from 'node:process';
import {fileURLToPath} from 'node:url';

const __filename                    = fileURLToPath(import.meta.url);
const __dirname                     = path.dirname(__filename);
const ROOT_DIR                      = path.resolve(__dirname, '../../..');
const DEPRECATED_MCP_TEST_DIR       = path.join(ROOT_DIR, 'test/playwright/mcp');
const CANONICAL_MCP_SERVER_TEST_DIR = path.join(ROOT_DIR, 'test/playwright/unit/ai/mcp/server');
const GRANDFATHERED_MCP_TEST_FILES  = Object.freeze([
    'github-workflow/OpenapiIssues.spec.mjs'
]);

// The workflow-parity SSOT: every glob a path-filtered workflow must watch for this lint's
// verdict to stay reproducible at PR time. Consumed by lintWorkflowScanRootParity.spec.mjs;
// derived from the scan directories above so the surface follows them.
export const SCAN_SURFACE = Object.freeze([DEPRECATED_MCP_TEST_DIR, CANONICAL_MCP_SERVER_TEST_DIR]
    .map(dir => `${toPosixRelative(ROOT_DIR, dir)}/**`));

function toPosixRelative(rootDir, filePath) {
    return path.relative(rootDir, filePath).split(path.sep).join('/');
}

function normalizeRelPath(relPath) {
    return relPath.split(path.sep).join('/');
}

function walkFiles(dir) {
    if (!fs.existsSync(dir)) return [];

    const entries = fs.readdirSync(dir, {withFileTypes: true});
    const files   = [];

    for (const entry of entries) {
        const filePath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
            files.push(...walkFiles(filePath));
        } else {
            files.push(filePath);
        }
    }

    return files.sort();
}

/**
 * Returns all files in the deprecated MCP test tree that are not grandfathered.
 * @param {Object} [options]
 * @param {String} [options.deprecatedDir]
 * @param {String[]} [options.grandfatheredFiles]
 * @returns {{files: String[], violations: String[]}}
 */
function lintMcpTestLocations({
    deprecatedDir      = DEPRECATED_MCP_TEST_DIR,
    grandfatheredFiles = GRANDFATHERED_MCP_TEST_FILES
} = {}) {
    const allowed = new Set(grandfatheredFiles.map(normalizeRelPath));
    const files   = walkFiles(deprecatedDir).map(filePath => toPosixRelative(deprecatedDir, filePath));

    return {
        files,
        violations: files.filter(file => !allowed.has(file))
    };
}

/**
 * CLI entry. Scans the deprecated tree and returns an exit code for tests.
 * @param {Object} [options]
 * @param {String} [options.deprecatedDir]
 * @param {String[]} [options.grandfatheredFiles]
 * @returns {{exitCode: Number, files: String[], violations: String[]}}
 */
function runLint(options = {}) {
    const result = lintMcpTestLocations(options);

    if (result.violations.length === 0) {
        console.log(`[lint-mcp-test-locations] OK - ${result.files.length} deprecated-tree file(s) are grandfathered or the tree is empty.`);
        return {exitCode: 0, ...result};
    }

    const deprecatedRel = toPosixRelative(ROOT_DIR, options.deprecatedDir || DEPRECATED_MCP_TEST_DIR);
    const canonicalRel  = toPosixRelative(ROOT_DIR, CANONICAL_MCP_SERVER_TEST_DIR);

    console.error(`[lint-mcp-test-locations] FAILED - ${result.violations.length} non-grandfathered file(s) found under ${deprecatedRel}:\n`);

    for (const file of result.violations) {
        console.error(`- ${deprecatedRel}/${file}`);
    }

    console.error(`\nNew MCP server tests must live under ${canonicalRel}/.`);
    console.error('Only these legacy files are currently grandfathered:');
    for (const file of GRANDFATHERED_MCP_TEST_FILES) {
        console.error(`- ${deprecatedRel}/${file}`);
    }

    return {exitCode: 1, ...result};
}

function main() {
    const arg = process.argv[2];

    if (arg === '--help' || arg === '-h') {
        console.log('Usage: node ai/scripts/lint/lint-mcp-test-locations.mjs');
        console.log('');
        console.log('Fails when non-grandfathered files exist under test/playwright/mcp/.');
        console.log('Place new MCP server tests under test/playwright/unit/ai/mcp/server/.');
        process.exit(0);
    }

    const {exitCode} = runLint();
    process.exit(exitCode);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
    main();
}

export {
    GRANDFATHERED_MCP_TEST_FILES,
    lintMcpTestLocations,
    runLint
};
