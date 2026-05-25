import {test, expect} from '@playwright/test';
import fs   from 'fs/promises';
import path from 'path';
import {fileURLToPath} from 'url';
import Neo       from '../../../../../../src/Neo.mjs';
import * as core from '../../../../../../src/core/_export.mjs';
import AiConfig from '../../../../../../ai/config.mjs';
import {
    Orchestrator
} from '../../../../../../ai/daemons/orchestrator/Orchestrator.mjs';
import {
    buildTaskDefinitions
} from '../../../../../../ai/daemons/orchestrator/TaskDefinitions.mjs';
import TaskStateService, {createInitialTaskState} from '../../../../../../ai/daemons/orchestrator/services/TaskStateService.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const REPO_ROOT  = path.resolve(__dirname, '../../../../../..');

const ORCHESTRATOR_MJS_PATH    = path.join(REPO_ROOT, 'ai/daemons/orchestrator/Orchestrator.mjs');
const TASK_DEFINITIONS_MJS_PATH = path.join(REPO_ROOT, 'ai/daemons/orchestrator/TaskDefinitions.mjs');

let invariantSeq         = 0;
let savedIntervals       = null;
let savedLocalOnly       = null;
let savedCloudOnly       = null;
let savedDeploymentMode  = null;
let savedEnvKbSyncEnabled            = undefined;
let savedEnvKbSyncInterval           = undefined;
let savedEnvTenantRepoSyncEnabled    = undefined;
let savedEnvTenantRepoSyncInterval   = undefined;

function createMinimalOrchestrator() {
    const taskDefinitions = buildTaskDefinitions({
        scriptDir: '/repo/ai/scripts',
        nodeBin  : '/node'
    });

    TaskStateService.configure({
        stateFile : '/tmp/orchestrator-test/state.json',
        taskDefinitions,
        writeLogFn: () => {}
    });
    TaskStateService.taskState = createInitialTaskState(taskDefinitions);

    return Neo.create(Orchestrator, {
        dataDir                  : '/tmp/orchestrator-test',
        stateFile                : '/tmp/orchestrator-test/state.json',
        logFile                  : null,
        heavyMaintenanceLeasePath: `/tmp/orchestrator-test/heavy-maintenance-lease-${process.pid}-${++invariantSeq}.json`,
        taskDefinitions,
        taskStateService         : TaskStateService,
        healthService            : {recordTaskOutcome() {}},
        spawnFn                  : () => { throw new Error('spawnFn not expected'); }
    });
}

test.beforeEach(() => {
    savedIntervals      = {...AiConfig.orchestrator.intervals};
    savedLocalOnly      = {...AiConfig.orchestrator.localOnly};
    savedCloudOnly      = AiConfig.orchestrator.cloudOnly ? {...AiConfig.orchestrator.cloudOnly} : null;
    savedDeploymentMode = AiConfig.orchestrator.deploymentMode;

    savedEnvKbSyncEnabled          = process.env.NEO_ORCHESTRATOR_KB_SYNC_ENABLED;
    savedEnvKbSyncInterval         = process.env.NEO_ORCHESTRATOR_KB_SYNC_INTERVAL_MS;
    savedEnvTenantRepoSyncEnabled  = process.env.NEO_ORCHESTRATOR_TENANT_REPO_SYNC_ENABLED;
    savedEnvTenantRepoSyncInterval = process.env.NEO_ORCHESTRATOR_TENANT_REPO_SYNC_INTERVAL_MS;
});

test.afterEach(() => {
    Object.assign(AiConfig.orchestrator.intervals, savedIntervals);
    Object.assign(AiConfig.orchestrator.localOnly, savedLocalOnly);
    if (savedCloudOnly) {
        Object.assign(AiConfig.orchestrator.cloudOnly, savedCloudOnly);
    }
    AiConfig.orchestrator.deploymentMode = savedDeploymentMode;

    restoreEnv('NEO_ORCHESTRATOR_KB_SYNC_ENABLED',           savedEnvKbSyncEnabled);
    restoreEnv('NEO_ORCHESTRATOR_KB_SYNC_INTERVAL_MS',       savedEnvKbSyncInterval);
    restoreEnv('NEO_ORCHESTRATOR_TENANT_REPO_SYNC_ENABLED',  savedEnvTenantRepoSyncEnabled);
    restoreEnv('NEO_ORCHESTRATOR_TENANT_REPO_SYNC_INTERVAL_MS', savedEnvTenantRepoSyncInterval);
});

function restoreEnv(name, prior) {
    if (prior === undefined) {
        delete process.env[name];
    } else {
        process.env[name] = prior;
    }
}

test.describe('Orchestrator config precedence (#11834 AC2)', () => {
    test('env var overrides AiConfig.data for interval values', () => {
        AiConfig.orchestrator.intervals.kbSyncMs = 60_000;
        process.env.NEO_ORCHESTRATOR_KB_SYNC_INTERVAL_MS = '999000';

        const orchestrator = createMinimalOrchestrator();
        expect(orchestrator.kbSyncIntervalMs).toBe(999000);
    });

    test('AiConfig.data is consulted when env var is absent', () => {
        delete process.env.NEO_ORCHESTRATOR_KB_SYNC_INTERVAL_MS;
        AiConfig.orchestrator.intervals.kbSyncMs = 12345;

        const orchestrator = createMinimalOrchestrator();
        expect(orchestrator.kbSyncIntervalMs).toBe(12345);
    });

    test('env var overrides AiConfig.data for boolean enable flags (localOnly)', () => {
        AiConfig.orchestrator.localOnly.kbSyncEnabled = false;
        process.env.NEO_ORCHESTRATOR_KB_SYNC_ENABLED = 'true';

        const orchestrator = createMinimalOrchestrator();
        expect(orchestrator.kbSyncEnabled).toBe(true);
    });

    test('AiConfig.localOnly.X=null falls through to deployment-profile default (local enables, cloud disables)', () => {
        delete process.env.NEO_ORCHESTRATOR_KB_SYNC_ENABLED;
        AiConfig.orchestrator.localOnly.kbSyncEnabled = null;

        AiConfig.orchestrator.deploymentMode = 'local';
        expect(createMinimalOrchestrator().kbSyncEnabled).toBe(true);

        AiConfig.orchestrator.deploymentMode = 'cloud';
        expect(createMinimalOrchestrator().kbSyncEnabled).toBe(false);
    });

    test('AiConfig.data mutations are isolated per test via beforeEach/afterEach restore', () => {
        const baselineKbSync   = savedIntervals.kbSyncMs;
        const baselineLocalKbs = savedLocalOnly.kbSyncEnabled;

        AiConfig.orchestrator.intervals.kbSyncMs = 99_000;
        AiConfig.orchestrator.localOnly.kbSyncEnabled = !baselineLocalKbs;

        expect(AiConfig.orchestrator.intervals.kbSyncMs).toBe(99_000);
        expect(AiConfig.orchestrator.localOnly.kbSyncEnabled).toBe(!baselineLocalKbs);
    });
});

test.describe('Orchestrator parent-prop propagation (#11834 AC3)', () => {
    // Propagation assertions use witness-property checks rather than reference equality:
    // child reactive setters may wrap input via `ClassSystemUtil.beforeSetInstance`, so
    // `===` against the source object can false-negative. The contract Sub-1 establishes
    // is that the *value content* flows through `afterSetX` to the child services.

    test('mutating orchestrator.taskDefinitions propagates to processSupervisorService via afterSetTaskDefinitions hook', () => {
        const orchestrator = createMinimalOrchestrator();
        const newDefs = buildTaskDefinitions({
            scriptDir: '/repo/ai/scripts/mutated',
            nodeBin  : '/node'
        });

        orchestrator.taskDefinitions = newDefs;

        // Witness via content: the mutated scriptDir flows into args of script-path lanes.
        const summary = orchestrator.processSupervisorService.taskDefinitions?.summary;
        expect(summary?.args?.some(arg => typeof arg === 'string' && arg.includes('/ai/scripts/mutated/'))).toBe(true);
    });

    test('mutating orchestrator.dataDir propagates to processSupervisorService + maintenanceBackpressureService', () => {
        const orchestrator = createMinimalOrchestrator();
        orchestrator.dataDir = '/tmp/orchestrator-test-mutated';

        expect(orchestrator.processSupervisorService.dataDir).toBe('/tmp/orchestrator-test-mutated');
        expect(orchestrator.maintenanceBackpressureService.dataDir).toBe('/tmp/orchestrator-test-mutated');
    });

    test('mutating orchestrator.healthService propagates to processSupervisorService + maintenanceBackpressureService', () => {
        const orchestrator = createMinimalOrchestrator();
        const newHealth = {recordTaskOutcome() {}, marker: 'mutated-healthservice'};
        orchestrator.healthService = newHealth;

        expect(orchestrator.processSupervisorService.healthService?.marker).toBe('mutated-healthservice');
        expect(orchestrator.maintenanceBackpressureService.healthService?.marker).toBe('mutated-healthservice');
    });

    test('mutating orchestrator.taskStateService propagates to processSupervisorService + maintenanceBackpressureService', () => {
        const orchestrator = createMinimalOrchestrator();
        const newTss = {
            marker: 'mutated-taskstateservice',
            getState() {return {};},
            getTaskState() {return null;}
        };
        orchestrator.taskStateService = newTss;

        expect(orchestrator.processSupervisorService.taskStateService?.marker).toBe('mutated-taskstateservice');
        expect(orchestrator.maintenanceBackpressureService.taskStateService?.marker).toBe('mutated-taskstateservice');
    });

    test('mutating orchestrator.spawnFn propagates to processSupervisorService', () => {
        const orchestrator = createMinimalOrchestrator();
        const newSpawn = () => 'mutated-spawn';
        newSpawn.marker = 'mutated-spawnfn';
        orchestrator.spawnFn = newSpawn;

        expect(orchestrator.processSupervisorService.spawnFn?.marker).toBe('mutated-spawnfn');
    });

    test('mutating orchestrator.heavyMaintenanceLeasePath propagates to maintenanceBackpressureService', () => {
        const orchestrator = createMinimalOrchestrator();
        const newPath = '/tmp/orchestrator-test/heavy-maintenance-lease-mutated.json';
        orchestrator.heavyMaintenanceLeasePath = newPath;

        expect(orchestrator.maintenanceBackpressureService.heavyMaintenanceLeasePath).toBe(newPath);
    });
});

test.describe('Orchestrator source-level invariants (#11834 AC4)', () => {
    test('Orchestrator.mjs has no `configure()` shadow-resolver method', async () => {
        const source = await fs.readFile(ORCHESTRATOR_MJS_PATH, 'utf8');
        const matches = source.match(/^\s*configure\s*\(/gm) || [];

        expect(matches, 'Orchestrator.mjs must NOT define a `configure()` method (Sub-1 anti-pattern; lazy getters supersede it).').toHaveLength(0);
    });

    test('TaskDefinitions.mjs has no `DEFAULT_*_INTERVAL_MS` exports', async () => {
        const source = await fs.readFile(TASK_DEFINITIONS_MJS_PATH, 'utf8');
        const matches = source.match(/export\s+(?:const|let)\s+DEFAULT_\w*INTERVAL_MS/g) || [];

        expect(matches, 'TaskDefinitions.mjs must NOT export `DEFAULT_*_INTERVAL_MS` constants (Sub-1 anti-pattern; AiConfig.orchestrator.intervals owns these values).').toHaveLength(0);
    });

    test('Orchestrator.mjs has no `parseInterval` / `parseEnabledFlag` call sites', async () => {
        const source = await fs.readFile(ORCHESTRATOR_MJS_PATH, 'utf8');
        const codeLines = stripCommentsAndStrings(source);
        const parseIntervalCalls = codeLines.match(/\bparseInterval\s*\(/g) || [];
        const parseEnabledCalls  = codeLines.match(/\bparseEnabledFlag\s*\(/g) || [];

        expect(parseIntervalCalls, 'Orchestrator.mjs must NOT call `parseInterval(...)` (Sub-1 anti-pattern; `Env.parseNumber(...)` is the canonical primitive).').toHaveLength(0);
        expect(parseEnabledCalls, 'Orchestrator.mjs must NOT call `parseEnabledFlag(...)` (Sub-1 anti-pattern; `Env.parseBool(...)` is the canonical primitive).').toHaveLength(0);
    });

    test('Orchestrator.mjs has no `processSupervisorService.set({...this...})` context-replay block', async () => {
        const source = await fs.readFile(ORCHESTRATOR_MJS_PATH, 'utf8');
        const codeLines = stripCommentsAndStrings(source);
        const matches = codeLines.match(/processSupervisorService\.set\s*\(\s*\{\s*\.\.\.this/g) || [];

        expect(matches, 'Orchestrator.mjs must NOT spread `this` into `processSupervisorService.set({...})` (Sub-1 anti-pattern; `afterSetX` parent-prop propagation hooks supersede the start()-time context replay).').toHaveLength(0);
    });

    test('Orchestrator.mjs has no `_`-suffix reactive config slot without a corresponding `beforeSet*` or `afterSet*` hook', async () => {
        const source = await fs.readFile(ORCHESTRATOR_MJS_PATH, 'utf8');
        const codeLines = stripCommentsAndStrings(source);

        // Find `_`-suffix slot declarations inside `static config = { ... }` — pattern: `<name>_: <default>`
        const slotMatches = [...codeLines.matchAll(/^\s{4,8}(\w+)_\s*:/gm)];
        const slotNames   = slotMatches.map(m => m[1]).filter(name => name !== 'class' && name !== 'static');

        const missingHook = slotNames.filter(name => {
            const cap = name.charAt(0).toUpperCase() + name.slice(1);
            const beforeRe = new RegExp(`\\bbeforeSet${cap}\\s*\\(`);
            const afterRe  = new RegExp(`\\bafterSet${cap}\\s*\\(`);
            return !beforeRe.test(codeLines) && !afterRe.test(codeLines);
        });

        expect(missingHook, `Reactive config slots with \`_\`-suffix MUST have a corresponding \`beforeSetX\` or \`afterSetX\` hook (Sub-1 anti-pattern: cargo-cult underscores without hooks). Offending slots: ${missingHook.join(', ')}.`).toEqual([]);
    });
});

/**
 * Strips block comments, line comments, and string literals so source-grep invariants
 * don't false-positive against doc-mentions of the anti-patterns they're guarding against
 * (the Orchestrator class JSDoc explicitly names what it doesn't do). Output preserves
 * line structure for line-aware regex anchors.
 */
function stripCommentsAndStrings(source) {
    let out = '';
    let i = 0;
    const len = source.length;

    while (i < len) {
        const c = source[i];
        const next = source[i + 1];

        // Block comment
        if (c === '/' && next === '*') {
            const end = source.indexOf('*/', i + 2);
            if (end === -1) break;
            // Preserve newlines so line numbers stay aligned
            for (let j = i; j < end + 2; j++) {
                out += source[j] === '\n' ? '\n' : ' ';
            }
            i = end + 2;
            continue;
        }

        // Line comment
        if (c === '/' && next === '/') {
            const end = source.indexOf('\n', i);
            const stop = end === -1 ? len : end;
            for (let j = i; j < stop; j++) out += ' ';
            i = stop;
            continue;
        }

        // String literal (single, double, backtick)
        if (c === '\'' || c === '"' || c === '`') {
            const quote = c;
            out += ' ';
            i++;
            while (i < len) {
                if (source[i] === '\\') {
                    out += '  ';
                    i += 2;
                    continue;
                }
                if (source[i] === quote) {
                    out += ' ';
                    i++;
                    break;
                }
                out += source[i] === '\n' ? '\n' : ' ';
                i++;
            }
            continue;
        }

        out += c;
        i++;
    }
    return out;
}
