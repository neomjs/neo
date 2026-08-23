import {setup} from '../../../../setup.mjs';

setup({
    appConfig: {
        name: 'FusionFlagshipTest'
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';
import DockService    from '../../../../../../src/ai/client/DockService.mjs';
import DockZoneModel  from '../../../../../../src/dashboard/DockZoneModel.mjs';
import TourRunner     from '../../../../../../src/ai/client/TourRunner.mjs';

import {validateTourScript}                from '../../../../../../src/ai/client/tourScript.mjs';
import {fusionTourScript, initialDocument} from '../../../../../../apps/agentos/tour/fusionFlagship.mjs';
import CockpitDockDocument                 from '../../../../../../apps/agentos/util/CockpitDockDocument.mjs';

/**
 * @summary Verifies the flagship fusion screenplay as reviewed content: it validates
 * fail-closed against the live executor vocabulary, plays start-to-finish on the real reducers
 * from the REAL cockpit default document, replays deterministically, and keeps every expect
 * cue-independent (the layering contract: spec-mode replay executes no host cues, so every
 * scripted assertion must be document-truth the reducers alone produce).
 */
test.describe.serial('apps/agentos/tour/fusionFlagship', () => {
    let originalGetComponent, runner, service;

    /**
     * Wires a fresh holder carrying the screenplay's own opening document.
     * @returns {Object}
     */
    function createHolder() {
        const holder = {dockZoneDocument: DockZoneModel.clone(initialDocument), id: 'fusion-stage'};

        Neo.getComponent = () => holder;

        return holder
    }

    /**
     * @returns {Neo.ai.client.TourRunner} a spec-mode runner on a fresh stage
     */
    function createRunner() {
        createHolder();

        runner = Neo.create(TourRunner, {
            componentId: 'fusion-stage',
            dockService: service,
            mode       : 'spec',
            script     : fusionTourScript
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
        const {valid, errors} = validateTourScript(fusionTourScript, {operations: DockZoneModel.operations});

        expect(errors).toEqual([]);
        expect(valid).toBe(true)
    });

    test('the opening stage IS the shipped cockpit default — imported, never forked', () => {
        // the strongest form of the flagship claim: the tour runs on the real product surface,
        // so a cockpit-document change that would break the tour breaks THIS witness first
        expect(initialDocument).toEqual(CockpitDockDocument.create())
    });

    test('the full tour plays green on the real reducers from the real cockpit document', async () => {
        createRunner();

        const holder = Neo.getComponent('fusion-stage');
        const result = await runner.start();

        expect(result.errors).toEqual([]);
        expect(result.completed).toBe(true);

        // finale document truth in PURE replay (all host cues inert — pop-out/reattach and every
        // perspective transition are host-owned): the two S2 ops are the only mutations, so the
        // detail sits revealed in its split and the whole cast stays in the tree
        const finale = holder.dockZoneDocument;

        expect(finale.items.detail.title).toBe('Agent detail');
        expect(finale.items.detail.autoHidden).toBe(false);
        expect(finale.items.fleet.title).toBe('Fleet');
        expect(finale.nodes['split-fleet-tabs-0'].orientation).toBe('horizontal');
        expect(DockZoneModel.findContainingTabsId(finale, 'detail')).toBeTruthy();
        expect(DockZoneModel.findContainingTabsId(finale, 'fleet')).toBeTruthy();
        expect(DockZoneModel.findContainingTabsId(finale, 'stream')).toBeTruthy()
    });

    test('two consecutive runs on the SAME mounted stage replay identically — the reset seam, not a fresh holder, restores the opening document', async () => {
        // the reviewer probe this pins: without a stage reset, run 2 replays against run 1's
        // committed document and splitNode mints `split-fleet-tabs-1` while the script asserts
        // `-0`. The hosting surface's resetTourStage() commits a fresh opening document; this
        // witness reuses ONE holder and applies exactly that seam between takes.
        createRunner();

        const holder = Neo.getComponent('fusion-stage');
        const first  = await runner.start();

        expect(first.completed).toBe(true);

        runner.destroy();

        // the reset seam's document semantics (clone the screenplay's opening stage), applied
        // to the SAME holder — never a fresh one
        holder.dockZoneDocument = DockZoneModel.clone(initialDocument);

        runner = Neo.create(TourRunner, {
            componentId: 'fusion-stage',
            dockService: service,
            mode       : 'spec',
            script     : fusionTourScript
        });

        const second = await runner.start();

        expect(second.completed).toBe(true);
        expect(second.log).toEqual(first.log)
    });

    test('storyboard parity: four beats, operation budget S1:0 · S2:2 · S3:0 · S4:0 — the vessel beats are cues, never bare ops', () => {
        const opCounts = fusionTourScript.scenes.map(
            scene => scene.steps.filter(step => step.type === 'op').length
        );

        expect(fusionTourScript.scenes.map(scene => scene.id)).toEqual(['s1', 's2', 's3', 's4']);
        expect(opCounts).toEqual([0, 2, 0, 0]);

        // every op descriptor stays inside the executable vocabulary (no invented operations)
        fusionTourScript.scenes.forEach(scene =>
            scene.steps.filter(step => step.type === 'op').forEach(step =>
                expect(DockZoneModel.operations).toContain(step.descriptor.operation)
            )
        )
    });

    test('the cue vocabulary is exactly the Leaf-2 hosting contract — no unconsumed cue class ships', () => {
        const cueTypes = new Set(
            fusionTourScript.scenes.flatMap(scene => scene.steps)
                .map(step => step.cue?.type)
                .filter(Boolean)
        );

        // perspective-save/load ride the Demo-B precedent; export/import are the share
        // round-trip; popout/reattach ride the detail vessel's own state machine. A NEW cue
        // type added to the script without updating this pin (and the cockpit wiring) fails
        // here first.
        expect([...cueTypes].sort()).toEqual([
            'perspective-export', 'perspective-import', 'perspective-load', 'perspective-save', 'popout', 'reattach'
        ])
    });
});
