import {test, expect}      from '@playwright/test';
import {pickNextCandidate} from '../../../../../../../ai/daemons/orchestrator/scheduling/picker.mjs';

function makeCandidate(taskName, descriptorOverrides = {}) {
    return {
        taskName,
        trigger   : {reason: `${taskName}-test`},
        descriptor: {
            taskName,
            executionKind   : 'in-process-async',
            maintenanceClass: 'continuous',
            backpressure    : 'none',
            dependencies    : [],
            ...descriptorOverrides
        }
    };
}

test.describe('orchestrator/scheduling/picker (#11862 Sub 18)', () => {
    test('returns null when no candidates provided', () => {
        expect(pickNextCandidate({candidates: [], runningTasks: []})).toBeNull();
    });

    test('returns the first candidate when none are running and no conflicts', () => {
        const candidates = [makeCandidate('summary'), makeCandidate('backup')];
        const winner     = pickNextCandidate({candidates, runningTasks: []});
        expect(winner.taskName).toBe('summary');
    });

    test('filterAlreadyRunning: drops candidates whose task is already running', () => {
        const candidates = [makeCandidate('summary'), makeCandidate('backup')];
        const winner     = pickNextCandidate({candidates, runningTasks: ['summary']});
        expect(winner.taskName).toBe('backup');
    });

    test('filterAlreadyRunning: handles Set or Array for runningTasks', () => {
        const candidates = [makeCandidate('summary'), makeCandidate('backup')];
        const winnerArr  = pickNextCandidate({candidates, runningTasks: ['summary']});
        const winnerSet  = pickNextCandidate({candidates, runningTasks: new Set(['summary'])});
        expect(winnerArr.taskName).toBe('backup');
        expect(winnerSet.taskName).toBe('backup');
    });

    test('filterExclusiveHeavyConflict: drops heavy candidates when another heavy is running', () => {
        const candidates = [
            makeCandidate('backup', {maintenanceClass: 'heavy'}),    // heavy, also running
            makeCandidate('kbSync', {maintenanceClass: 'heavy'}),
            makeCandidate('summary', {maintenanceClass: 'continuous'})
        ];
        const winner = pickNextCandidate({
            candidates,
            runningTasks : ['backup'],
            policyContext: {runningHeavyTasks: new Set(['backup'])}
        });
        // backup filtered out by filterAlreadyRunning
        // kbSync filtered out by filterExclusiveHeavyConflict (backup heavy in runningHeavyTasks)
        // summary survives (continuous, not heavy)
        expect(winner.taskName).toBe('summary');
    });

    test('filterExclusiveHeavyConflict: keeps compatible miniSummary backfill behind kbSync (#13358)', () => {
        const candidates = [
            makeCandidate('memory-summary-backfill', {maintenanceClass: 'heavy'}),
            makeCandidate('summary', {maintenanceClass: 'continuous'})
        ];
        const winner = pickNextCandidate({
            candidates,
            runningTasks : ['kbSync'],
            policyContext: {
                runningHeavyTasks: new Set(['kbSync']),
                isHeavyMaintenanceConflict(candidateTaskName, runningTaskName) {
                    return !(candidateTaskName === 'memory-summary-backfill' && runningTaskName === 'kbSync');
                }
            }
        });

        expect(winner.taskName).toBe('memory-summary-backfill');
    });

    test('filterExclusiveHeavyConflict: keeps incompatible heavy task blocked when kbSync runs (#13358)', () => {
        const candidates = [
            makeCandidate('backup', {maintenanceClass: 'heavy'}),
            makeCandidate('summary', {maintenanceClass: 'continuous'})
        ];
        const winner = pickNextCandidate({
            candidates,
            runningTasks : ['kbSync'],
            policyContext: {
                runningHeavyTasks: new Set(['kbSync']),
                isHeavyMaintenanceConflict() {
                    return true;
                }
            }
        });

        expect(winner.taskName).toBe('summary');
    });

    test('filterExclusiveHeavyConflict: no-op when no heavy is running', () => {
        const candidates = [
            makeCandidate('backup', {maintenanceClass: 'heavy'}),
            makeCandidate('kbSync', {maintenanceClass: 'heavy'})
        ];
        const winner = pickNextCandidate({
            candidates,
            runningTasks : [],
            policyContext: {runningHeavyTasks: new Set()}
        });
        expect(winner.taskName).toBe('backup');
    });

    test('filterUnmetDependencies: drops golden-path when dream is running', () => {
        const candidates = [
            makeCandidate('golden-path', {dependencies: ['dream']}),
            makeCandidate('summary')
        ];
        const winner = pickNextCandidate({candidates, runningTasks: ['dream']});
        expect(winner.taskName).toBe('summary');
    });

    test('filterUnmetDependencies: passes golden-path when dream is NOT running', () => {
        const candidates = [
            makeCandidate('golden-path', {dependencies: ['dream']}),
            makeCandidate('summary')
        ];
        const winner = pickNextCandidate({candidates, runningTasks: []});
        expect(winner.taskName).toBe('golden-path');
    });

    test('returns null when all candidates filtered out', () => {
        const candidates = [
            makeCandidate('summary'),
            makeCandidate('backup')
        ];
        const winner = pickNextCandidate({candidates, runningTasks: ['summary', 'backup']});
        expect(winner).toBeNull();
    });

    test('NEGATIVE: picker causes no state mutation', () => {
        // Picker reads candidates + runningTasks; it must not mutate either.
        const candidates         = [makeCandidate('summary'), makeCandidate('backup')];
        const candidatesSnapshot = JSON.stringify(candidates);
        const runningTasks       = ['some-task'];
        const runningSnapshot    = JSON.stringify(runningTasks);

        pickNextCandidate({candidates, runningTasks});

        expect(JSON.stringify(candidates)).toBe(candidatesSnapshot);
        expect(JSON.stringify(runningTasks)).toBe(runningSnapshot);
    });

    test('selectFirstCandidate: registry-order priority preserved through pipeline', () => {
        const candidates = [
            makeCandidate('first'),
            makeCandidate('second'),
            makeCandidate('third')
        ];
        const winner = pickNextCandidate({candidates, runningTasks: []});
        expect(winner.taskName).toBe('first');
    });

    // --- priority-0 (backup) + staleness-ratio selector ---

    test('#13586 priority-0: backup wins unconditionally over a registry-earlier, fresher task', () => {
        const now        = 1_000_000;
        const candidates = [
            makeCandidate('summary', {maintenanceClass: 'heavy'}),
            makeCandidate('backup',  {maintenanceClass: 'heavy'})
        ];
        const winner = pickNextCandidate({
            candidates,
            runningTasks : [],
            policyContext: {
                now,
                priorityZeroTasks: ['backup'],
                taskMeta         : {
                    summary: {lastRunAt: now - 1_000, cadenceMs: 600_000},      // just ran
                    backup : {lastRunAt: now - 1_000, cadenceMs: 86_400_000}    // also fresh, but prio-0
                }
            }
        });
        expect(winner.taskName).toBe('backup');
    });

    test('#13586 priority-0 beats a hugely-stale non-prio-zero task', () => {
        const now        = 1_000_000_000;
        const candidates = [
            makeCandidate('memory-summary-backfill', {maintenanceClass: 'heavy'}),
            makeCandidate('backup',                   {maintenanceClass: 'heavy'})
        ];
        const winner = pickNextCandidate({
            candidates,
            runningTasks : [],
            policyContext: {
                now,
                priorityZeroTasks: ['backup'],
                taskMeta         : {
                    'memory-summary-backfill': {lastRunAt: 0,            cadenceMs: 600_000},     // never run, hugely stale
                    backup                   : {lastRunAt: now - 1_000,  cadenceMs: 86_400_000}   // fresh
                }
            }
        });
        expect(winner.taskName).toBe('backup');
    });

    test('#13586 staleness-ratio: a weeks-stale golden-path outranks a just-drained summary', () => {
        const WEEK       = 7 * 24 * 60 * 60 * 1000;
        const now        = 10 * WEEK;
        const candidates = [
            makeCandidate('summary',     {maintenanceClass: 'heavy'}),
            makeCandidate('golden-path', {maintenanceClass: 'graph-dependent'})
        ];
        const winner = pickNextCandidate({
            candidates,
            runningTasks : [],
            policyContext: {
                now,
                priorityZeroTasks: ['backup'],
                taskMeta         : {
                    summary      : {lastRunAt: now - 60_000,     cadenceMs: 600_000},        // ~0.1 overdue
                    'golden-path': {lastRunAt: now - 3 * WEEK,   cadenceMs: 60 * 60 * 1000}  // ~500 overdue
                }
            }
        });
        expect(winner.taskName).toBe('golden-path');
    });

    test('#13586 staleness-ratio: a starved (never-run) backfill outranks a just-drained summary', () => {
        const now        = 1_000_000_000;
        const candidates = [
            makeCandidate('summary',                  {maintenanceClass: 'heavy'}),
            makeCandidate('memory-summary-backfill',  {maintenanceClass: 'heavy'})
        ];
        const winner = pickNextCandidate({
            candidates,
            runningTasks : [],
            policyContext: {
                now,
                priorityZeroTasks: ['backup'],
                taskMeta         : {
                    summary                  : {lastRunAt: now - 60_000, cadenceMs: 600_000},
                    'memory-summary-backfill': {lastRunAt: 0,            cadenceMs: 600_000}   // never run → huge ratio
                }
            }
        });
        expect(winner.taskName).toBe('memory-summary-backfill');
    });

    test('#13586 staleness-ratio: registry order breaks ties on equal ratios (strict-greater)', () => {
        const now        = 1_000_000;
        const candidates = [
            makeCandidate('alpha', {maintenanceClass: 'heavy'}),
            makeCandidate('beta',  {maintenanceClass: 'heavy'})
        ];
        const winner = pickNextCandidate({
            candidates,
            runningTasks : [],
            policyContext: {
                now,
                priorityZeroTasks: [],
                taskMeta         : {
                    alpha: {lastRunAt: now - 300_000, cadenceMs: 600_000},  // identical ratio
                    beta : {lastRunAt: now - 300_000, cadenceMs: 600_000}
                }
            }
        });
        expect(winner.taskName).toBe('alpha');
    });

    test('#13586 backward-compat: policyContext without taskMeta falls back to registry-order', () => {
        const candidates = [
            makeCandidate('summary', {maintenanceClass: 'heavy'}),
            makeCandidate('backup',  {maintenanceClass: 'heavy'})
        ];
        // taskMeta absent → legacy registry-order (summary first) preserved even though backup exists.
        const winner = pickNextCandidate({candidates, runningTasks: [], policyContext: {now: 1_000_000}});
        expect(winner.taskName).toBe('summary');
    });

    test('#13586 cross-class: a registry-earlier non-heavy candidate beats an overdue heavy one', () => {
        // Review falsifier: a continuous task registry-earlier than an overdue heavy one keeps its
        // slot — non-heavy behavior is unchanged (staleness reorders only the eligible/heavy set).
        const now        = 1_000_000;
        const candidates = [
            makeCandidate('swarm-heartbeat', {maintenanceClass: 'continuous'}),
            makeCandidate('dream',           {maintenanceClass: 'heavy'})
        ];
        const winner = pickNextCandidate({
            candidates,
            runningTasks : [],
            policyContext: {
                now,
                priorityZeroTasks: ['backup'],
                taskMeta         : {dream: {lastRunAt: 0, cadenceMs: 600_000}}  // only dream eligible + overdue
            }
        });
        expect(winner.taskName).toBe('swarm-heartbeat');
    });

    test('#13586 cross-class: tenant-repo-sync now reorders among heavy with a registry-later non-heavy present (#14400)', () => {
        // summary + tenant-repo-sync + dream (all eligible heavy tasks) reorder; swarm-heartbeat
        // (non-eligible) is registry-later,
        // so the eligible representative (the staler dream) still wins.
        const now        = 1_000_000;
        const candidates = [
            makeCandidate('summary',          {maintenanceClass: 'heavy'}),
            makeCandidate('tenant-repo-sync', {maintenanceClass: 'heavy'}),
            makeCandidate('dream',            {maintenanceClass: 'heavy'}),
            makeCandidate('swarm-heartbeat',  {maintenanceClass: 'continuous'})
        ];
        const winner = pickNextCandidate({
            candidates,
            runningTasks : [],
            policyContext: {
                now,
                priorityZeroTasks: ['backup'],
                taskMeta         : {
                    summary           : {lastRunAt: now - 60_000,  cadenceMs: 600_000}, // fresh
                    'tenant-repo-sync': {lastRunAt: now - 120_000, cadenceMs: 60_000},  // due
                    dream             : {lastRunAt: 0,             cadenceMs: 60_000}   // stale → eligible rep
                }
            }
        });
        expect(winner.taskName).toBe('dream');
    });
});
