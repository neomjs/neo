import {setup} from '../../../../setup.mjs';

setup({
    appConfig: {
        name: 'WorkstationTourTest'
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';
import DockService    from '../../../../../../src/ai/client/DockService.mjs';
import Document       from '../../../../../../src/dashboard/dock/model/Document.mjs';
import Operations     from '../../../../../../src/dashboard/dock/model/Operations.mjs';
import TourRunner     from '../../../../../../src/ai/client/TourRunner.mjs';

import {validateTourScript}                     from '../../../../../../src/ai/client/tourScript.mjs';
import {workstationTourScript, initialDocument} from '../../../../../../apps/workstation/tour/denseWorkstation.mjs';

/**
 * @summary Verifies Workstation as executable content: exact live-item density, only shipped
 * operation names, fail-closed validation, green real-reducer execution, and deterministic
 * document logs. Grid/overflow/Canvas runtime behavior remains the composed E2E's authority.
 */
test.describe.serial('apps/workstation/tour/denseWorkstation', () => {
    let originalGetComponent, runner, service;

    /**
     * @returns {Neo.ai.client.TourRunner}
     */
    function createRunner() {
        const holder = {dockZoneDocument: Document.clone(initialDocument), id: 'workstation-stage'};

        Neo.getComponent = () => holder;
        runner = Neo.create(TourRunner, {
            componentId: holder.id,
            dockService: service,
            mode       : 'spec',
            script     : workstationTourScript
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
            {valid, errors} = validateTourScript(workstationTourScript, {operations: Operations.operations}),
            placed          = Object.values(initialDocument.nodes)
                .filter(node => node.type === 'tabs')
                .flatMap(node => node.items),
            cues            = workstationTourScript.scenes.flatMap(scene => scene.steps)
                .filter(step => step.cue)
                .map(step => step.cue.type),
            operations      = workstationTourScript.scenes.flatMap(scene => scene.steps)
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
        expect(cues).toEqual([
            'overflow',
            'scroll',
            'cross-zone-showcase',
            'canvas-update',
            'theme',
            'theme'
        ]);
        expect(workstationTourScript.scenes.flatMap(scene => scene.steps)
            .find(step => step.cue?.type === 'overflow').cue.itemId).toBe('security');
        expect(workstationTourScript.scenes.flatMap(scene => scene.steps)
            .find(step => step.cue?.type === 'cross-zone-showcase').cue.dwells)
            .toEqual([{
                targetNodeId : 'scale-tabs',
                placementKind: 'edge-bottom'
            }, {
                targetNodeId : 'right-bottom-tabs',
                placementKind: 'tab-into'
            }]);
        expect(operations).toEqual(['resizeSplit', 'splitNode', 'addTab']);
        operations.forEach(operation => expect(Operations.operations).toContain(operation));
        expect(operations).not.toContain('promote')
    });

    test('two real-reducer runs complete with identical logs and the promoted tab returned', async () => {
        createRunner();

        const first = await runner.start();

        expect(first.completed).toBe(true);
        expect(first.errors).toEqual([]);

        const firstDocument = Neo.getComponent('workstation-stage').dockZoneDocument;

        expect(firstDocument.nodes['split-main'].children[0]).toBe('scale-tabs');
        expect(firstDocument.nodes['split-main'].sizes).toEqual([0.52, 0.48]);
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
