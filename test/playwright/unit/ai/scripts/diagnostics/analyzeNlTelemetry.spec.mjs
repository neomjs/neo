import {setup} from '../../../../setup.mjs';

const appName = 'AnalyzeNlTelemetryTest';

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';
import { execFileSync } from 'child_process';
import path           from 'path';
import fs             from 'fs';
import Database       from 'better-sqlite3';

test.describe('Neo.ai.scripts.analyzeNlTelemetry', () => {
    const testDbPath   = path.resolve(process.cwd(), `tmp/memory-core-test-${process.pid}.sqlite`);
    const testRlaifDir = path.resolve(process.cwd(), `tmp/rlaif-test-${process.pid}`);
    const testRlaifPath= path.join(testRlaifDir, 'trajectories.jsonl');
    const scriptPath   = path.resolve(process.cwd(), 'ai/scripts/diagnostics/analyzeNlTelemetry.mjs');

    test.beforeAll(() => {
        const tmpDir = path.dirname(testDbPath);
        if (!fs.existsSync(tmpDir)) {
            fs.mkdirSync(tmpDir, { recursive: true });
        }
        if (!fs.existsSync(testRlaifDir)) {
            fs.mkdirSync(testRlaifDir, { recursive: true });
        }
        if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
        if (fs.existsSync(testRlaifPath)) fs.unlinkSync(testRlaifPath);

        const db = new Database(testDbPath);
        db.exec(`
            CREATE TABLE IF NOT EXISTS neo_agent_memory_data (
                id TEXT PRIMARY KEY,
                metadata TEXT
            )
        `);

        // Insert mock data
        const stmt = db.prepare('INSERT INTO neo_agent_memory_data (id, metadata) VALUES (?, ?)');

        // Mock Session 1: Valid Neural Link trajectory
        stmt.run('mem-1', JSON.stringify({
            sessionId: 'test-session-1',
            timestamp: 1000,
            prompt: 'Navigate to user profile',
            thought: 'I will use neural-link to click the profile button',
            response: 'Navigated.',
            toolsUsed: ['neural-link_simulate_event']
        }));

        // Mock Session 1: Non-NL trajectory step (should break or ignore, but the logic includes it if contiguous)
        stmt.run('mem-2', JSON.stringify({
            sessionId: 'test-session-1',
            timestamp: 2000,
            prompt: 'What time is it?',
            thought: 'I think it is 5:00',
            response: 'It is 5:00',
            toolsUsed: [] // Notice: no NL tool used. However, due to logic, it breaks trajectory!
        }));

        // Mock Session 2: Empty, no NL tools
        stmt.run('mem-3', JSON.stringify({
            sessionId: 'test-session-2',
            timestamp: 1000,
            prompt: 'Say hello',
            thought: '...',
            response: 'Hello',
            toolsUsed: ['run_shell_command']
        }));

        db.close();
    });

    test.afterAll(() => {
        if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
        if (fs.existsSync(testRlaifPath)) fs.unlinkSync(testRlaifPath);
        if (fs.existsSync(testRlaifDir)) fs.rmdirSync(testRlaifDir);
    });

    test('should extract Neural Link trajectories without mutating physical databases', () => {
        const env = {
            ...process.env,
            NEO_MEMORY_DB_PATH_TEST: testDbPath,
            NEO_RLAIF_PATH: testRlaifPath
        };

        const output = execFileSync('node', [scriptPath, 'test-session-1'], { env, encoding: 'utf-8' });

        expect(output).toContain('Found 1 Neural Link trajectories for session test-session-1');
        expect(output).toContain('Preview of Trajectory [0]');
    });

    test('should gracefully exit if no trajectories are found', () => {
        const env = {
            ...process.env,
            NEO_MEMORY_DB_PATH_TEST: testDbPath,
            NEO_RLAIF_PATH: testRlaifPath
        };

        const output = execFileSync('node', [scriptPath, 'test-session-2'], { env, encoding: 'utf-8' });
        expect(output).toContain('No neural link trajectories found in session: test-session-2');
    });

    test('should save to custom RLAIF path when --save is provided', () => {
        const env = {
            ...process.env,
            NEO_MEMORY_DB_PATH_TEST: testDbPath,
            NEO_RLAIF_PATH: testRlaifPath
        };

        const output = execFileSync('node', [scriptPath, 'test-session-1', '--save'], { env, encoding: 'utf-8' });
        expect(output).toContain('Successfully appended 1 trajectories to');

        // Verify file was written
        expect(fs.existsSync(testRlaifPath)).toBe(true);
        const data = fs.readFileSync(testRlaifPath, 'utf8');
        expect(data).toContain('whitebox_e2e_introspection');
        expect(data).toContain('Navigate to user profile');
    });

    test('uses current storagePaths.graph config instead of retired graph-engine paths (#10126)', () => {
        const diagnosticsSource = fs.readFileSync(scriptPath, 'utf8');
        const maintenanceSource = fs.readFileSync(
            path.resolve(process.cwd(), 'ai/scripts/maintenance/recreateGraphDb.mjs'),
            'utf8'
        );
        const retiredPath = ['aiConfig', 'engines', 'neo'].join('.');

        expect(diagnosticsSource).toContain('aiConfig.storagePaths.graph');
        expect(maintenanceSource).toContain('aiConfig.storagePaths.graph');
        expect(diagnosticsSource).not.toContain(retiredPath);
        expect(maintenanceSource).not.toContain(retiredPath);
    });

    test('reads the resolved Memory Core graph leaf without a duplicate env fallback (#12438)', () => {
        const diagnosticsSource = fs.readFileSync(scriptPath, 'utf8');

        expect(diagnosticsSource).toContain('const DB_PATH = aiConfig.storagePaths.graph;');
        expect(diagnosticsSource).not.toContain('process.env.NEO_MEMORY_DB_PATH ||');
        expect(diagnosticsSource).not.toContain('process.env.NEO_MEMORY_DB_PATH ??');
    });
});
