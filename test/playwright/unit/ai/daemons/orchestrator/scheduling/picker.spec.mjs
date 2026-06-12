import {test, expect} from '@playwright/test';
import {pickNextCandidate} from '../../../../../../../ai/daemons/orchestrator/scheduling/picker.mjs';

function makeCandidate(taskName, descriptorOverrides = {}) {
    return {
        taskName,
        trigger: {reason: `${taskName}-test`},
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
        const winner = pickNextCandidate({candidates, runningTasks: []});
        expect(winner.taskName).toBe('summary');
    });

    test('filterAlreadyRunning: drops candidates whose task is already running', () => {
        const candidates = [makeCandidate('summary'), makeCandidate('backup')];
        const winner = pickNextCandidate({candidates, runningTasks: ['summary']});
        expect(winner.taskName).toBe('backup');
    });

    test('filterAlreadyRunning: handles Set or Array for runningTasks', () => {
        const candidates = [makeCandidate('summary'), makeCandidate('backup')];
        const winnerArr = pickNextCandidate({candidates, runningTasks: ['summary']});
        const winnerSet = pickNextCandidate({candidates, runningTasks: new Set(['summary'])});
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
            runningTasks  : ['backup'],
            policyContext : {runningHeavyTasks: new Set(['backup'])}
        });
        // backup filtered out by filterAlreadyRunning
        // kbSync filtered out by filterExclusiveHeavyConflict (backup heavy in runningHeavyTasks)
        // summary survives (continuous, not heavy)
        expect(winner.taskName).toBe('summary');
    });

    test('filterExclusiveHeavyConflict: no-op when no heavy is running', () => {
        const candidates = [
            makeCandidate('backup', {maintenanceClass: 'heavy'}),
            makeCandidate('kbSync', {maintenanceClass: 'heavy'})
        ];
        const winner = pickNextCandidate({
            candidates,
            runningTasks  : [],
            policyContext : {runningHeavyTasks: new Set()}
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
        const candidates = [makeCandidate('summary'), makeCandidate('backup')];
        const candidatesSnapshot = JSON.stringify(candidates);
        const runningTasks = ['some-task'];
        const runningSnapshot = JSON.stringify(runningTasks);

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
});
