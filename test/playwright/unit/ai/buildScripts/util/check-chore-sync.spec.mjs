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

    test.beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-sync-test-'));
        execSync('git init', { cwd: tempDir, stdio: 'ignore' });
        execSync('git config user.email "test@example.com"', { cwd: tempDir, stdio: 'ignore' });
        execSync('git config user.name "Test User"', { cwd: tempDir, stdio: 'ignore' });
        execSync('git commit --allow-empty -m "Init"', { cwd: tempDir, stdio: 'ignore' });

        // Ensure we're on a non-data branch like 'dev'
        execSync('git checkout -b dev', { cwd: tempDir, stdio: 'ignore' });
    });

    test.afterEach(() => {
        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    const runScript = (cwd, env = {}) => {
        try {
            const output = execSync(`node ${scriptPath}`, {
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

    test('valid sync-only staging with NEO_SYNC_AUTOCOMMIT=1 passes', () => {
        stageFile('resources/content/issues/1.md');
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

    test('root diagnostics: running the script in a subdirectory fails', () => {
        const subDir = path.join(tempDir, 'subdir');
        fs.mkdirSync(subDir);
        const result = runScript(subDir);
        expect(result.status).toBe(1);
        expect(result.output).toContain('Error: Repository root mismatch');
        expect(result.output).toContain('check-chore-sync.mjs is running in');
    });
});
