import {expect, test} from '@playwright/test';
import {spawnSync}    from 'node:child_process';
import fs             from 'node:fs';
import os             from 'node:os';
import path           from 'node:path';

import {
    GRANDFATHERED_MCP_TEST_FILES,
    lintMcpTestLocations,
    runLint
} from '../../../../../../ai/scripts/lint/lint-mcp-test-locations.mjs';

test.describe('ai/scripts/lint-mcp-test-locations (#10210)', () => {
    const scriptPath = path.resolve(process.cwd(), 'ai/scripts/lint/lint-mcp-test-locations.mjs');

    function makeTempDir() {
        return fs.mkdtempSync(path.join(os.tmpdir(), 'neo-mcp-test-locations-'));
    }

    function writeFixture(rootDir, relPath, content = 'test fixture') {
        const filePath = path.join(rootDir, ...relPath.split('/'));
        fs.mkdirSync(path.dirname(filePath), {recursive: true});
        fs.writeFileSync(filePath, content, 'utf8');
    }

    function captureConsole(callback) {
        const originalError = console.error;
        const originalLog   = console.log;

        try {
            console.error = () => {};
            console.log   = () => {};
            return callback();
        } finally {
            console.error = originalError;
            console.log   = originalLog;
        }
    }

    test('CLI: --help exits 0 with placement guidance', () => {
        const result = spawnSync('node', [scriptPath, '--help'], {
            cwd     : process.cwd(),
            encoding: 'utf8'
        });

        expect(result.status).toBe(0);
        expect(result.stdout).toContain('Usage: node ai/scripts/lint/lint-mcp-test-locations.mjs');
        expect(result.stdout).toContain('test/playwright/unit/ai/mcp/server/');
    });

    test('CLI: the repository deprecated MCP test tree contains only grandfathered files', () => {
        const result = spawnSync('node', [scriptPath], {
            cwd     : process.cwd(),
            encoding: 'utf8'
        });

        expect(result.status, result.stderr).toBe(0);
        expect(result.stdout).toContain('[lint-mcp-test-locations] OK');
    });

    test('pure lint: permits the current grandfathered file list', () => {
        const deprecatedDir = makeTempDir();

        try {
            writeFixture(deprecatedDir, GRANDFATHERED_MCP_TEST_FILES[0]);

            expect(lintMcpTestLocations({deprecatedDir}).violations).toEqual([]);
        } finally {
            fs.rmSync(deprecatedDir, {force: true, recursive: true});
        }
    });

    test('pure lint: flags any non-grandfathered file in the deprecated tree', () => {
        const deprecatedDir = makeTempDir();

        try {
            writeFixture(deprecatedDir, GRANDFATHERED_MCP_TEST_FILES[0]);
            writeFixture(deprecatedDir, 'memory-core/NewServer.spec.mjs');

            const result = lintMcpTestLocations({deprecatedDir});

            expect(result.files).toEqual([
                'github-workflow/OpenapiIssues.spec.mjs',
                'memory-core/NewServer.spec.mjs'
            ]);
            expect(result.violations).toEqual(['memory-core/NewServer.spec.mjs']);
        } finally {
            fs.rmSync(deprecatedDir, {force: true, recursive: true});
        }
    });

    test('runLint: missing deprecated tree passes so migration can remove it later', () => {
        const deprecatedDir = path.join(os.tmpdir(), `neo-missing-mcp-tree-${Date.now()}`);
        const result        = captureConsole(() => runLint({deprecatedDir}));

        expect(result.exitCode).toBe(0);
        expect(result.files).toEqual([]);
        expect(result.violations).toEqual([]);
    });

    test('runLint: returns exit code 1 for placement violations', () => {
        const deprecatedDir = makeTempDir();

        try {
            writeFixture(deprecatedDir, 'github-workflow/OpenapiIssues.spec.mjs');
            writeFixture(deprecatedDir, 'github-workflow/Another.spec.mjs');

            const result = captureConsole(() => runLint({deprecatedDir}));

            expect(result.exitCode).toBe(1);
            expect(result.violations).toEqual(['github-workflow/Another.spec.mjs']);
        } finally {
            fs.rmSync(deprecatedDir, {force: true, recursive: true});
        }
    });
});
