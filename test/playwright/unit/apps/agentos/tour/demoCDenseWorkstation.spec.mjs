import {setup} from '../../../../setup.mjs';

setup({
    appConfig: {
        name: 'DemoCDenseWorkstationTest'
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';
import DockService    from '../../../../../../src/ai/client/DockService.mjs';
import DockZoneModel  from '../../../../../../src/dashboard/DockZoneModel.mjs';
import TourRunner     from '../../../../../../src/ai/client/TourRunner.mjs';

import {validateTourScript}               from '../../../../../../src/ai/client/tourScript.mjs';
import {demoCTourScript, initialDocument} from '../../../../../../apps/agentos/tour/demoCDenseWorkstation.mjs';

/**
 * @summary Verifies Demo C as executable content: exact live-item density, only shipped
 * operation names, fail-closed validation, green real-reducer execution, and deterministic
 * document logs. Grid/overflow/Canvas runtime behavior remains the composed E2E's authority.
 */
test.describe.serial('apps/agentos/tour/demoCDenseWorkstation', () => {
    let originalGetComponent, runner, service;

    /**
     * @returns {Neo.ai.client.TourRunner}
     */
    function createRunner() {
        const holder = {dockZoneDocument: DockZoneModel.clone(initialDocument), id: 'demo-c-stage'};

        Neo.getComponent = () => holder;
        runner = Neo.create(TourRunner, {
            componentId: holder.id,
            dockService: service,
            mode       : 'spec',
            script     : demoCTourScript
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

    test('the body is self-contained: 20 placed items, reviewed cues, no invented operation', () => {
        const
            {valid, errors} = validateTourScript(demoCTourScript, {operations: DockZoneModel.operations}),
            placed          = Object.values(initialDocument.nodes)
                .filter(node => node.type === 'tabs')
                .flatMap(node => node.items),
            cues            = demoCTourScript.scenes.flatMap(scene => scene.steps)
                .filter(step => step.cue)
                .map(step => step.cue.type),
            operations      = demoCTourScript.scenes.flatMap(scene => scene.steps)
                .filter(step => step.type === 'op')
                .map(step => step.descriptor.operation);

        expect(valid).toBe(true);
        expect(errors).toEqual([]);
        expect(Object.keys(initialDocument.items)).toHaveLength(20);
        expect(new Set(placed).size).toBe(20);
        expect([...placed].sort()).toEqual(Object.keys(initialDocument.items).sort());
        expect(Object.entries(initialDocument.items)
            .filter(([, item]) => item.autoHidden === true)
            .map(([itemId]) => itemId)).toEqual(['graph', 'inspector']);
        expect(cues).toEqual(['overflow', 'scroll', 'canvas-update', 'theme', 'theme']);
        expect(demoCTourScript.scenes[0].steps[1].cue.itemId).toBe('security');
        expect(operations).toEqual(['splitNode', 'addTab']);
        operations.forEach(operation => expect(DockZoneModel.operations).toContain(operation));
        expect(operations).not.toContain('promote')
    });

    test('two real-reducer runs complete with identical logs and the promoted tab returned', async () => {
        createRunner();

        const first = await runner.start();

        expect(first.completed).toBe(true);
        expect(first.errors).toEqual([]);

        const firstDocument = Neo.getComponent('demo-c-stage').dockZoneDocument;

        expect(firstDocument.nodes['split-main'].children[0]).toBe('scale-tabs');
        expect(firstDocument.nodes['heavy-tabs'].activeItemId).toBe('security');
        expect(firstDocument.nodes['heavy-tabs'].items.at(-1)).toBe('security');

        runner.destroy();
        createRunner();

        const second = await runner.start();

        expect(second.completed).toBe(true);
        expect(second.errors).toEqual([]);
        expect(second.log).toEqual(first.log)
    })
});
