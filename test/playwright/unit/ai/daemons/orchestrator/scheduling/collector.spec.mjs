import {test, expect} from '@playwright/test';
import fs from 'fs/promises';
import path from 'path';
import {fileURLToPath} from 'url';
import {collectDueCandidates} from '../../../../../../../ai/daemons/orchestrator/scheduling/collector.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const COLLECTOR_PATH = path.resolve(__dirname, '../../../../../../../ai/daemons/orchestrator/scheduling/collector.mjs');

function makeContext(overrides = {}) {
    return {
        db        : {},
        state     : {},
        now       : 1_000_000,
        intervals : {
            summarySweep   : 600_000,
            kbSync         : 600_000,
            backup         : 3_600_000,
            primaryDevSync : 600_000,
            dream          : 600_000,
            goldenPath     : 600_000,
            swarmHeartbeat : 600_000
        },
        enables   : {
            kbSync         : false,
            swarmHeartbeat : false,
            primaryDevSync : false
        },
        hooks     : {
            log                       : () => {},
            swarmHeartbeatInitFailed  : false
        },
        ...overrides
    };
}

test.describe('orchestrator/scheduling/collector (#11862 Sub 18)', () => {
    test('returns {candidates, errors} with empty registry → both empty', () => {
        const result = collectDueCandidates({registry: [], context: makeContext()});
        expect(result.candidates).toEqual([]);
        expect(result.errors).toEqual([]);
    });

    test('collects a single due candidate when descriptor returns a trigger', () => {
        const descriptor = {
            taskName        : 'fake-task',
            executionKind   : 'in-process-async',
            maintenanceClass: 'continuous',
            backpressure    : 'none',
            dependencies    : [],
            getDueTask      : () => ({taskName: 'fake-task', reason: 'test-trigger'})
        };
        const {candidates, errors} = collectDueCandidates({registry: [descriptor], context: makeContext()});
        expect(candidates).toHaveLength(1);
        expect(candidates[0].taskName).toBe('fake-task');
        expect(candidates[0].trigger.reason).toBe('test-trigger');
        expect(candidates[0].descriptor).toBe(descriptor);
        expect(errors).toEqual([]);
    });

    test('skips descriptors whose getDueTask returns null', () => {
        const descriptor = {
            taskName        : 'not-due',
            executionKind   : 'in-process-async',
            maintenanceClass: 'continuous',
            backpressure    : 'none',
            dependencies    : [],
            getDueTask      : () => null
        };
        const {candidates, errors} = collectDueCandidates({registry: [descriptor], context: makeContext()});
        expect(candidates).toEqual([]);
        expect(errors).toEqual([]);
    });

    test('captures errors per descriptor without throwing (failure isolation, #11862 AC4)', () => {
        const throwingDescriptor = {
            taskName        : 'broken',
            executionKind   : 'in-process-async',
            maintenanceClass: 'continuous',
            backpressure    : 'none',
            dependencies    : [],
            getDueTask      : () => { throw new Error('schedule failure'); }
        };
        const okDescriptor = {
            taskName        : 'works',
            executionKind   : 'in-process-async',
            maintenanceClass: 'continuous',
            backpressure    : 'none',
            dependencies    : [],
            getDueTask      : () => ({taskName: 'works', reason: 'ok'})
        };
        const {candidates, errors} = collectDueCandidates({
            registry: [throwingDescriptor, okDescriptor],
            context : makeContext()
        });
        expect(candidates).toHaveLength(1);
        expect(candidates[0].taskName).toBe('works');
        expect(errors).toHaveLength(1);
        expect(errors[0].taskName).toBe('broken');
        expect(errors[0].error.message).toBe('schedule failure');
    });

    test('NEGATIVE: collector causes no observable state mutation (#11862 AC4)', () => {
        // Spies on hooks that COULD be misused for state mutation. Collector must not call them.
        let logCallCount = 0;
        const log = () => { logCallCount++; };

        // Snapshot context before
        const context = makeContext({hooks: {log, swarmHeartbeatInitFailed: false}});
        const contextSnapshot = JSON.stringify({
            state    : context.state,
            intervals: context.intervals,
            enables  : context.enables
        });

        const descriptor = {
            taskName        : 'state-write-attempt',
            executionKind   : 'in-process-async',
            maintenanceClass: 'continuous',
            backpressure    : 'none',
            dependencies    : [],
            getDueTask      : () => ({taskName: 'state-write-attempt', reason: 'test'})
        };
        collectDueCandidates({registry: [descriptor], context});

        // Hook log NOT called (collector doesn't write to log)
        expect(logCallCount).toBe(0);
        // Context unchanged
        const after = JSON.stringify({state: context.state, intervals: context.intervals, enables: context.enables});
        expect(after).toBe(contextSnapshot);
    });

    test('HARD GUARDRAIL: source contains no executionKind/maintenanceClass/profile branching (#11862 AC5)', async () => {
        const source = await fs.readFile(COLLECTOR_PATH, 'utf8');
        // Strip comments (block + line) before matching so doc-comment text mentioning these
        // tokens doesn't false-positive the guardrail.
        const code = source
            .replace(/\/\*[\s\S]*?\*\//g, '')   // /* ... */ block comments
            .replace(/\/\/[^\n]*/g, '');         // // line comments
        expect(code).not.toMatch(/switch\s*\(/);
        expect(code).not.toMatch(/executionKind\s*===/);
        expect(code).not.toMatch(/maintenanceClass\s*===/);
        expect(code).not.toMatch(/if\s*\([^)]*profile/);
    });
});
