import {setup} from '../../../../setup.mjs';

const appName = 'HarnessClassifierTest';

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

/**
 * @summary Coverage for Memory Core harness-classified sibling diagnostics.
 *
 * Pins the extracted classifier used by both `diagnoseMcpConcurrency.mjs` and
 * `MemoryCoreServer.logSiblingConcurrency()`. The helper remains read-only and testable
 * through injected process-chain output rather than live host process state.
 *
 * @see ai.services.memory-core.helpers.HarnessClassifier#classifyHarness
 */
test.describe('Memory Core HarnessClassifier #10206', () => {
    let buildSqliteHolderDiagnostics, classifyHarness, groupProcessesByHarness, formatHarnessGroups, parseLsofOutput;

    test.beforeAll(async () => {
        const mod = await import('../../../../../../ai/services/memory-core/helpers/harnessClassifier.mjs');
        buildSqliteHolderDiagnostics = mod.buildSqliteHolderDiagnostics;
        classifyHarness              = mod.classifyHarness;
        groupProcessesByHarness      = mod.groupProcessesByHarness;
        formatHarnessGroups          = mod.formatHarnessGroups;
        parseLsofOutput              = mod.parseLsofOutput;
    });

    function makeExecSync(responses) {
        return command => {
            const pid = Number(command.match(/-p\s+(\d+)/)?.[1]);
            if (!responses.has(pid)) throw new Error(`unexpected pid ${pid}`);
            return responses.get(pid);
        };
    }

    test('walks parent process chain and classifies Antigravity harness', () => {
        const execSync = makeExecSync(new Map([
            [101, '  202 node'],
            [202, '    1 /Applications/Antigravity.app/Contents/MacOS/Antigravity']
        ]));

        const result = classifyHarness(101, {execSync});

        expect(result.harness).toBe('antigravity');
        expect(result.chain).toEqual([
            {pid: 101, command: 'node'},
            {pid: 202, command: '/Applications/Antigravity.app/Contents/MacOS/Antigravity'}
        ]);
    });

    test('prefers Claude Code over generic Claude Desktop classification', () => {
        const execSync = makeExecSync(new Map([
            [301, '  302 node'],
            [302, '    1 /usr/local/bin/claude-code']
        ]));

        expect(classifyHarness(301, {execSync}).harness).toBe('claude-code');
    });

    test('classifies Codex desktop harnesses', () => {
        const execSync = makeExecSync(new Map([
            [351, '  352 node'],
            [352, '    1 /Applications/Codex.app/Contents/MacOS/Codex']
        ]));

        expect(classifyHarness(351, {execSync}).harness).toBe('codex');
    });

    test('classifies Neo orchestrator-owned processes', () => {
        const execSync = makeExecSync(new Map([
            [361, '  362 node'],
            [362, '    1 npm run ai:orchestrator']
        ]));

        expect(classifyHarness(361, {execSync}).harness).toBe('orchestrator');
    });

    test('falls back to unknown when no recognizable harness exists', () => {
        const execSync = makeExecSync(new Map([
            [401, '  402 node'],
            [402, '    1 /usr/bin/loginwindow']
        ]));

        const result = classifyHarness(401, {execSync});

        expect(result.harness).toBe('unknown');
        expect(result.chain).toHaveLength(2);
    });

    test('groups process records and preserves PID visibility in formatted output', () => {
        const groups = groupProcessesByHarness([
            {pid: 101, command: 'node'},
            {pid: 102, command: 'node'},
            {pid: 201, command: 'node'}
        ], {
            classifier(pid) {
                return {
                    harness: pid < 200 ? 'antigravity' : 'unknown',
                    chain  : [{pid, command: 'node'}]
                };
            }
        });

        expect(Object.fromEntries(groups.map(group => [group.harness, group.processes.length]))).toEqual({
            antigravity: 2,
            unknown    : 1
        });
        expect(formatHarnessGroups(groups)).toBe('2 Antigravity (PIDs: 101, 102) + 1 unknown (PID: 201)');
    });

    test('parses lsof records with held SQLite files', () => {
        const records = parseLsofOutput([
            'p101',
            'cnode',
            'n/tmp/memory-core-graph.sqlite',
            'n/tmp/memory-core-graph.sqlite-wal',
            'p202',
            'cClaude',
            'n/tmp/memory-core-graph.sqlite-shm'
        ].join('\n'));

        expect(records).toEqual([{
            pid    : 101,
            command: 'node',
            files  : [
                '/tmp/memory-core-graph.sqlite',
                '/tmp/memory-core-graph.sqlite-wal'
            ]
        }, {
            pid    : 202,
            command: 'Claude',
            files  : ['/tmp/memory-core-graph.sqlite-shm']
        }]);
    });

    test('builds grouped SQLite holder diagnostics and excludes the current process', () => {
        const dbPath     = '/tmp/memory-core-graph.sqlite';
        const existing   = new Set([dbPath, `${dbPath}-wal`, `${dbPath}-shm`]);
        const diagnostics = buildSqliteHolderDiagnostics({
            dbPath,
            currentPid: 999,
            measuredAt: '2026-06-19T00:00:00.000Z',
            existsSync: file => existing.has(file),
            execSync  : () => [
                'p101',
                'cnode',
                `n${dbPath}`,
                'p101',
                'cnode',
                `n${dbPath}-wal`,
                'p201',
                'cnode',
                `n${dbPath}-shm`,
                'p999',
                'cnode',
                `n${dbPath}`
            ].join('\n'),
            classifier(pid) {
                return {
                    harness: pid === 101 ? 'antigravity' : 'unknown',
                    chain  : [{pid, command: 'node'}]
                };
            }
        });

        expect(diagnostics.status).toBe('ok');
        expect(diagnostics.totalProcesses).toBe(2);
        expect(diagnostics.byHarness).toEqual({
            antigravity: 1,
            unknown    : 1
        });
        expect(diagnostics.processes.map(processRecord => processRecord.pid)).toEqual([101, 201]);
        expect(diagnostics.processes[0].files).toEqual([dbPath, `${dbPath}-wal`]);
        expect(diagnostics.processes[0].harness).toBe('antigravity');
        expect(diagnostics.processes[0].chain).toEqual([{pid: 101, command: 'node'}]);
        expect(diagnostics.groups.map(group => [group.harness, group.processes.length])).toEqual([
            ['antigravity', 1],
            ['unknown', 1]
        ]);
        expect(diagnostics.warnings).toEqual([{
            code   : 'unknown-harness',
            message: '1 SQLite holder process(es) could not be mapped to a known harness'
        }]);
    });

    test('returns degraded diagnostic data when process inspection is unavailable', () => {
        const dbPath = '/tmp/memory-core-graph.sqlite';
        const error  = new Error('spawn lsof ENOENT');
        error.code = 'ENOENT';

        const diagnostics = buildSqliteHolderDiagnostics({
            dbPath,
            existsSync: () => true,
            execSync  : () => {
                throw error;
            }
        });

        expect(diagnostics.status).toBe('degraded');
        expect(diagnostics.error).toContain('requires `lsof`');
        expect(diagnostics.totalProcesses).toBe(0);
        expect(diagnostics.groups).toEqual([]);
    });
});
