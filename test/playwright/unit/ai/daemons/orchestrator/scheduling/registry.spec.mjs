import {test, expect} from '@playwright/test';
import {TASK_REGISTRY} from '../../../../../../../ai/daemons/orchestrator/scheduling/registry.mjs';

const VALID_EXECUTION_KINDS = ['supervised-child-process', 'service-runner', 'in-process-async', 'local-only-service'];
const VALID_MAINTENANCE_CLASSES = ['continuous', 'heavy', 'graph-dependent', 'lightweight-signal', 'local-only'];
const VALID_BACKPRESSURE = ['none', 'exclusive-heavy', 'after-heavy'];

test.describe('orchestrator/scheduling/registry (#11862 Sub 18)', () => {
    test('TASK_REGISTRY is a frozen array (immutability invariant)', () => {
        expect(Array.isArray(TASK_REGISTRY)).toBe(true);
        expect(Object.isFrozen(TASK_REGISTRY)).toBe(true);
    });

    test('each descriptor has the required shape', () => {
        for (const descriptor of TASK_REGISTRY) {
            expect(typeof descriptor.taskName).toBe('string');
            expect(descriptor.taskName.length).toBeGreaterThan(0);
            expect(VALID_EXECUTION_KINDS).toContain(descriptor.executionKind);
            expect(VALID_MAINTENANCE_CLASSES).toContain(descriptor.maintenanceClass);
            expect(VALID_BACKPRESSURE).toContain(descriptor.backpressure);
            expect(Array.isArray(descriptor.dependencies)).toBe(true);
            expect(typeof descriptor.getDueTask).toBe('function');
        }
    });

    test('taskName is unique across descriptors (no collision)', () => {
        const names = TASK_REGISTRY.map(d => d.taskName);
        expect(new Set(names).size).toBe(names.length);
    });

    test('dependencies reference valid taskNames (no dangling references)', () => {
        const names = new Set(TASK_REGISTRY.map(d => d.taskName));
        for (const descriptor of TASK_REGISTRY) {
            for (const dep of descriptor.dependencies) {
                expect(names).toContain(dep);
            }
        }
    });

    test('expected scheduling lanes are registered (#11862 Prescription parity)', () => {
        const names = TASK_REGISTRY.map(d => d.taskName);
        expect(names).toEqual(expect.arrayContaining([
            'summary', 'kbSync', 'backup', 'primary-dev-sync',
            'dream', 'golden-path', 'swarm-heartbeat'
        ]));
    });

    test('graphlog-compaction stays out until collectDueCandidates is wired into Orchestrator.poll()', () => {
        const names = TASK_REGISTRY.map(d => d.taskName);
        expect(names).not.toContain('graphlog-compaction');
    });

    test('continuous tasks (chroma/bridgeDaemon/mlx) are intentionally NOT in registry', () => {
        const names = TASK_REGISTRY.map(d => d.taskName);
        expect(names).not.toContain('chroma');
        expect(names).not.toContain('bridgeDaemon');
        expect(names).not.toContain('mlx');
    });
});
