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
 * @summary Coverage for #10206 Memory Core harness-classified sibling diagnostics.
 *
 * Pins the extracted classifier used by both `diagnoseMcpConcurrency.mjs` and
 * `MemoryCoreServer.logSiblingConcurrency()`. The helper remains read-only and testable
 * through injected process-chain output rather than live host process state.
 *
 * @see ai.services.memory-core.helpers.HarnessClassifier#classifyHarness
 */
test.describe('Memory Core HarnessClassifier #10206', () => {
    let classifyHarness, groupProcessesByHarness, formatHarnessGroups;

    test.beforeAll(async () => {
        const mod = await import('../../../../../../ai/services/memory-core/helpers/harnessClassifier.mjs');
        classifyHarness        = mod.classifyHarness;
        groupProcessesByHarness = mod.groupProcessesByHarness;
        formatHarnessGroups     = mod.formatHarnessGroups;
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
});
