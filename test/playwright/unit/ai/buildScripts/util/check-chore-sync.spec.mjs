import { test, expect } from '@playwright/test';
import { execSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const scriptPath = path.resolve(__dirname, '../../../../../../buildScripts/util/check-chore-sync.mjs');

test.describe('check-chore-sync.mjs', () => {
    let tempDir;
    let testScriptPath;

    test.beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-sync-test-'));
        execSync('git init', { cwd: tempDir, stdio: 'ignore' });
        execSync('git config user.email "test@example.com"', { cwd: tempDir, stdio: 'ignore' });
        execSync('git config user.name "Test User"', { cwd: tempDir, stdio: 'ignore' });
        execSync('git commit --allow-empty -m "Init"', { cwd: tempDir, stdio: 'ignore' });

        testScriptPath = path.join(tempDir, 'buildScripts/util/check-chore-sync.mjs');
        fs.mkdirSync(path.dirname(testScriptPath), {recursive: true});
        fs.copyFileSync(scriptPath, testScriptPath);

        // Ensure we're on a non-data branch like 'dev'
        execSync('git checkout -b dev', { cwd: tempDir, stdio: 'ignore' });
    });

    test.afterEach(() => {
        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    const runScript = (cwd, env = {}) => {
        try {
            const output = execSync(`node ${testScriptPath}`, {
                cwd,
                env: { ...process.env, ...env },
                encoding: 'utf-8',
                stdio: 'pipe'
            });
            return { status: 0, output };
        } catch (error) {
            return { status: error.status, output: error.stderr || error.stdout };
        }
    };

    const stageFile = (filePath) => {
        const fullPath = path.join(tempDir, filePath);
        fs.mkdirSync(path.dirname(fullPath), { recursive: true });
        fs.writeFileSync(fullPath, 'test content');
        execSync(`git add ${filePath}`, { cwd: tempDir, stdio: 'ignore' });
    };

    test('normal reject: staging a data file on dev branch fails', () => {
        stageFile('resources/content/issues/1.md');
        const result = runScript(tempDir);
        expect(result.status).toBe(1);
        expect(result.output).toContain('Error: Sync-data leakage detected');
        expect(result.output).toContain("Branch 'dev' (in root");
        expect(result.output).toContain('resources/content/issues/1.md');
    });

    test('sanctioned bypass: staging a data file on chore/sync- branch passes', () => {
        execSync('git checkout -b chore/sync-123', { cwd: tempDir, stdio: 'ignore' });
        stageFile('resources/content/issues/1.md');
        const result = runScript(tempDir);
        expect(result.status).toBe(0);
    });

    test('sanctioned bypass: staging a data file on agent/sync- branch passes', () => {
        execSync('git checkout -b agent/sync-123', { cwd: tempDir, stdio: 'ignore' });
        stageFile('resources/content/issues/1.md');
        const result = runScript(tempDir);
        expect(result.status).toBe(0);
    });

    test('valid sync-only staging with NEO_SYNC_AUTOCOMMIT=1 passes for generated workflow content', () => {
        [
            'resources/content/issues/chunk-1/issue-1.md',
            'resources/content/discussions/chunk-1/discussion-1.md',
            'resources/content/pulls/chunk-1/pr-1.md',
            'resources/content/release-notes/chunk-1/v1.0.0.md',
            'resources/content/archive/issues/v1.0.0/chunk-1/issue-2.md',
            'resources/content/_index.json',
            'resources/content/.sync-metadata.json'
        ].forEach(stageFile);

        const result = runScript(tempDir, { NEO_SYNC_AUTOCOMMIT: '1' });
        expect(result.status).toBe(0);
    });

    test('non-sync staged file rejection with env var: mixed files fails', () => {
        stageFile('resources/content/issues/1.md');
        stageFile('src/foo.js');
        const result = runScript(tempDir, { NEO_SYNC_AUTOCOMMIT: '1' });
        expect(result.status).toBe(1);
        expect(result.output).toContain('Error: NEO_SYNC_AUTOCOMMIT bypass rejected.');
        expect(result.output).toContain('Automated sync commits must ONLY contain data files.');
        expect(result.output).toContain('src/foo.js');
        // It shouldn't complain about the data file
        expect(result.output).not.toContain('resources/content/issues/1.md');
    });

    test('non-sync staged file rejection with env var: unowned resources content fails', () => {
        stageFile('resources/content/concepts/example.md');
        const result = runScript(tempDir, { NEO_SYNC_AUTOCOMMIT: '1' });
        expect(result.status).toBe(1);
        expect(result.output).toContain('Error: NEO_SYNC_AUTOCOMMIT bypass rejected.');
        expect(result.output).toContain('resources/content/concepts/example.md');
    });

    test('script root anchoring: running from a non-repo cwd checks the owning repo', () => {
        const otherDir = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-sync-foreign-'));

        try {
            stageFile('resources/content/issues/1.md');
            const result = runScript(otherDir);
            expect(result.status).toBe(1);
            expect(result.output).toContain('Error: Sync-data leakage detected');
            expect(result.output).toContain("Branch 'dev' (in root");
            expect(result.output).toContain(tempDir);
            expect(result.output).toContain('resources/content/issues/1.md');
        } finally {
            fs.rmSync(otherDir, {recursive: true, force: true});
        }
    });
});
