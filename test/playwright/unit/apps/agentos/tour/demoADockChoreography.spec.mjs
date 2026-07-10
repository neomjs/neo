import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';
import DockService    from '../../../../../../src/ai/client/DockService.mjs';
import DockZoneModel  from '../../../../../../src/dashboard/DockZoneModel.mjs';
import TourRunner     from '../../../../../../src/ai/client/TourRunner.mjs';

import {validateTourScript}               from '../../../../../../src/ai/client/tourScript.mjs';
import {demoATourScript, initialDocument} from '../../../../../../apps/agentos/tour/demoADockChoreography.mjs';

/**
 * @summary Verifies the Demo-A screenplay as reviewed content: it validates fail-closed
 * against the live executor vocabulary, plays start-to-finish on the real reducers from its
 * own opening document, replays deterministically (identical operation logs — which also
 * proves the reducer's seeded id minting is stable through prune/re-mint cycles), and keeps
 * scene-by-scene parity with the storyboard's operation budget.
 */
test.describe.serial('apps/agentos/tour/demoADockChoreography', () => {
    let originalGetComponent, runner, service;

    /**
     * Wires a fresh holder carrying the screenplay's own opening document.
     * @returns {Object}
     */
    function createHolder() {
        const holder = {dockZoneDocument: DockZoneModel.clone(initialDocument), id: 'demo-a-stage'};

        Neo.getComponent = () => holder;

        return holder
    }

    /**
     * @returns {Neo.ai.client.TourRunner} a spec-mode runner on a fresh stage
     */
    function createRunner() {
        createHolder();

        runner = Neo.create(TourRunner, {
            componentId: 'demo-a-stage',
            dockService: service,
            mode       : 'spec',
            script     : demoATourScript
        });

        return runner
    }

    test.beforeEach(() => {
        originalGetComponent = Neo.getComponent;
        service              = Neo.create(DockService, {})
    });

    test.afterEach(() => {
        Neo.getComponent = originalGetComponent;
        runner?.destroy?.();
        runner = null;
        service.destroy?.()
    });

    test('the screenplay validates fail-closed against the live executor vocabulary', () => {
        const {valid, errors} = validateTourScript(demoATourScript, {operations: DockZoneModel.operations});

        expect(errors).toEqual([]);
        expect(valid).toBe(true)
    });

    test('the full tour plays green on the real reducers from its own opening document', async () => {
        createRunner();

        const holder = Neo.getComponent('demo-a-stage');
        const result = await runner.start();

        expect(result.errors).toEqual([]);
        expect(result.completed).toBe(true);

        // finale document truth: the dense studio, wave rolled back
        const finale = holder.dockZoneDocument;

        expect(finale.nodes['tabs-preview-0'].items).toEqual(['preview', 'terminal', 'logs']);
        expect(finale.items.preview.autoHidden).toBe(false);
        expect(finale.items.terminal.autoHidden).toBe(false);
        expect(finale.items.logs.autoHidden).toBe(false)
    });

    test('two consecutive runs replay identically — id minting stays stable through prune/re-mint', async () => {
        createRunner();

        const first = await runner.start();

        expect(first.completed).toBe(true);

        runner.destroy();
        createRunner();

        const second = await runner.start();

        expect(second.completed).toBe(true);
        expect(second.log).toEqual(first.log)
    });

    test('storyboard parity: three scenes, operation budget S1:4 · S2:3 · S3:6', () => {
        const opCounts = demoATourScript.scenes.map(
            scene => scene.steps.filter(step => step.type === 'op').length
        );

        expect(demoATourScript.scenes.map(scene => scene.id)).toEqual(['s1', 's2', 's3']);
        expect(opCounts).toEqual([4, 3, 6]);

        // every op descriptor stays inside the executable vocabulary (no invented operations)
        demoATourScript.scenes.forEach(scene =>
            scene.steps.filter(step => step.type === 'op').forEach(step =>
                expect(DockZoneModel.operations).toContain(step.descriptor.operation)
            )
        )
    });

    test('the reveal-mode advisory rides the script: hover is an explicit workspace opt-in', () => {
        expect(demoATourScript.workspace).toEqual({autoHideRevealOnHover: true});

        // and the opt-in is narrated to the viewer, not hidden in config
        const s3Captions = demoATourScript.scenes[2].steps.map(step => step.caption || '').join(' ');

        expect(s3Captions).toContain('autoHideRevealOnHover')
    });
});
