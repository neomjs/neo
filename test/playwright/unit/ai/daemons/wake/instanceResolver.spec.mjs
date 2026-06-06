import {test, expect} from '@playwright/test';
import {
    getDefaultInstancePid,
    getInstancePid,
    resolveDefaultInstancePid,
    resolveInstancePid
} from '../../../../../../ai/daemons/wake/instanceResolver.mjs';

/**
 * Self-test for the wake-daemon instance resolver: maps a harness instance's `--user-data-dir`
 * to its main app-process pid so the wake daemon can target the intended instance when two
 * same-bundle harnesses run in parallel. Fixtures model real macOS `ps axww -o pid=,ppid=,command=`
 * output for two Claude.app instances — a default one (only Electron helpers carry the dir) and a
 * second one launched via `open -n -a Claude.app --args --user-data-dir=...` (the main executable
 * carries the dir directly). The critical behaviors: pick the right instance's MAIN pid, and return
 * null (caller fails closed) when no instance matches.
 */

const DEFAULT_DIR = '/Users/tobiasuhlig/Library/Application Support/Claude';
const NEO_DIR      = '/Users/tobiasuhlig/.claude-instances/Neo';

// Default instance: main executable has NO --user-data-dir (launched via Finder/dock); only the
// Electron helper subprocesses carry it. Second (Neo) instance: main executable carries it (--args).
const PS_BOTH_INSTANCES = [
    `13106 1 /Applications/Claude.app/Contents/MacOS/Claude`,
    `13119 13106 /Applications/Claude.app/Contents/Frameworks/Claude Helper.app/Contents/MacOS/Claude Helper --type=gpu-process --user-data-dir=${DEFAULT_DIR} --gpu-preferences=xyz`,
    `13125 13106 /Applications/Claude.app/Contents/Frameworks/Claude Helper (Renderer).app/Contents/MacOS/Claude Helper (Renderer) --type=renderer --user-data-dir=${DEFAULT_DIR} --app-path=/x`,
    `20001 1 /Applications/Claude.app/Contents/MacOS/Claude --user-data-dir=${NEO_DIR}`,
    `20005 20001 /Applications/Claude.app/Contents/Frameworks/Claude Helper (Renderer).app/Contents/MacOS/Claude Helper (Renderer) --type=renderer --user-data-dir=${NEO_DIR} --app-path=/x`
].join('\n');

// Single default instance only (no sibling launched): main is arg-less; one helper carries the dir.
const PS_SINGLE_DEFAULT = [
    `13106 1 /Applications/Claude.app/Contents/MacOS/Claude`,
    `13119 13106 /Applications/Claude.app/Contents/Frameworks/Claude Helper.app/Contents/MacOS/Claude Helper --type=gpu-process --user-data-dir=${DEFAULT_DIR} --gpu-preferences=xyz`
].join('\n');

test.describe('wake-daemon instanceResolver', () => {
    test('resolves the second instance main pid directly when the main executable carries --user-data-dir', () => {
        // The Neo instance's main process carries the dir (open --args), and is preferred over its helper.
        expect(resolveInstancePid({userDataDir: NEO_DIR, psOutput: PS_BOTH_INSTANCES})).toBe(20001);
    });

    test('resolves to the main pid via the parent-pid chain when only helpers carry --user-data-dir', () => {
        // The default instance's main has no dir; resolution must walk a matching helper up to the main.
        expect(resolveInstancePid({userDataDir: DEFAULT_DIR, psOutput: PS_BOTH_INSTANCES})).toBe(13106);
    });

    test('distinguishes the two same-bundle instances (never cross-targets)', () => {
        const neo     = resolveInstancePid({userDataDir: NEO_DIR, psOutput: PS_BOTH_INSTANCES});
        const dflt    = resolveInstancePid({userDataDir: DEFAULT_DIR, psOutput: PS_BOTH_INSTANCES});
        expect(neo).toBe(20001);
        expect(dflt).toBe(13106);
        expect(neo).not.toBe(dflt);
    });

    test('returns null when no process matches the user-data-dir (caller fails closed)', () => {
        expect(resolveInstancePid({userDataDir: '/Users/x/.claude-instances/DoesNotExist', psOutput: PS_BOTH_INSTANCES})).toBeNull();
    });

    test('returns null on missing inputs', () => {
        expect(resolveInstancePid({userDataDir: NEO_DIR})).toBeNull();
        expect(resolveInstancePid({psOutput: PS_BOTH_INSTANCES})).toBeNull();
        expect(resolveInstancePid({})).toBeNull();
    });

    test('getInstancePid runs ps via the injected exec and resolves the pid', async () => {
        const exec = async (cmd, args) => {
            expect(cmd).toBe('ps');
            expect(args).toContain('axww');
            return {stdout: PS_BOTH_INSTANCES};
        };
        expect(await getInstancePid({userDataDir: NEO_DIR, exec})).toBe(20001);
    });

    test('getInstancePid fails closed (null) when ps errors or userDataDir is absent', async () => {
        const throwingExec = async () => { throw new Error('ps failed') };
        expect(await getInstancePid({userDataDir: NEO_DIR, exec: throwingExec})).toBeNull();
        expect(await getInstancePid({exec: async () => ({stdout: PS_BOTH_INSTANCES})})).toBeNull();
    });

    // --- default (arg-less) instance resolution: the complement of resolveInstancePid ---

    test('resolveDefaultInstancePid targets the arg-less main when a sibling instance is running', () => {
        // 13106 is the default (no --user-data-dir); 20001 is the sibling (carries the flag).
        expect(resolveDefaultInstancePid({appName: 'Claude', psOutput: PS_BOTH_INSTANCES})).toBe(13106);
    });

    test('default and sibling resolution never cross-target', () => {
        const dflt = resolveDefaultInstancePid({appName: 'Claude', psOutput: PS_BOTH_INSTANCES});
        const neo  = resolveInstancePid({userDataDir: NEO_DIR, psOutput: PS_BOTH_INSTANCES});
        expect(dflt).toBe(13106);
        expect(neo).toBe(20001);
        expect(dflt).not.toBe(neo);
    });

    test('resolveDefaultInstancePid returns null for a single instance (legacy activate kept)', () => {
        expect(resolveDefaultInstancePid({appName: 'Claude', psOutput: PS_SINGLE_DEFAULT})).toBeNull();
    });

    test('resolveDefaultInstancePid returns null when the default cannot be uniquely picked', () => {
        // Two arg-less mains -> ambiguous -> null (caller keeps legacy activate; never a wrong target).
        const twoArgless = [
            `13106 1 /Applications/Claude.app/Contents/MacOS/Claude`,
            `40001 1 /Applications/Claude.app/Contents/MacOS/Claude`
        ].join('\n');
        expect(resolveDefaultInstancePid({appName: 'Claude', psOutput: twoArgless})).toBeNull();
    });

    test('resolveDefaultInstancePid returns null on missing inputs', () => {
        expect(resolveDefaultInstancePid({appName: 'Claude'})).toBeNull();
        expect(resolveDefaultInstancePid({psOutput: PS_BOTH_INSTANCES})).toBeNull();
        expect(resolveDefaultInstancePid({})).toBeNull();
    });

    test('getDefaultInstancePid runs ps via the injected exec and resolves the default pid', async () => {
        const exec = async (cmd, args) => {
            expect(cmd).toBe('ps');
            expect(args).toContain('axww');
            return {stdout: PS_BOTH_INSTANCES};
        };
        expect(await getDefaultInstancePid({appName: 'Claude', exec})).toBe(13106);
    });

    test('getDefaultInstancePid fails closed (null) when ps errors or appName is absent', async () => {
        const throwingExec = async () => { throw new Error('ps failed') };
        expect(await getDefaultInstancePid({appName: 'Claude', exec: throwingExec})).toBeNull();
        expect(await getDefaultInstancePid({exec: async () => ({stdout: PS_BOTH_INSTANCES})})).toBeNull();
    });
});
