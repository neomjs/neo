import {setup} from '../../../../setup.mjs';

setup({
    appConfig: {
        name: 'WorkstationFilmTourTest'
    }
});

import {test, expect}    from '@playwright/test';
import Neo               from '../../../../../../src/Neo.mjs';
import * as core         from '../../../../../../src/core/_export.mjs';
import DockService       from '../../../../../../src/ai/client/DockService.mjs';
import WorkspaceDocument from '../../../../../../src/dashboard/dock/model/WorkspaceDocument.mjs';
import Operations        from '../../../../../../src/dashboard/dock/model/Operations.mjs';
import TourRunner        from '../../../../../../src/ai/client/TourRunner.mjs';

import {validateTourScript}               from '../../../../../../src/ai/client/tourScript.mjs';
import {WORKSTATION_CUE_TYPES}            from '../../../../../../apps/workstation/tour/cueVocabulary.mjs';
import {fiveBeatFilmScript, filmCueTypes} from '../../../../../../apps/workstation/tour/fiveBeatFilm.mjs';
import {initialDocument}                  from '../../../../../../apps/workstation/tour/denseWorkstation.mjs';

/**
 * @summary Verifies the flagship film as executable content: it validates against the shipped
 * operation vocabulary, names only cues the playback controller handles, gates every window
 * birth behind a viewer cue, keeps its pacing budget, and runs its document tier twice with
 * identical logs. Window gestures, perspectives and history are the composed E2E's authority
 * (`e2e/workstation/WorkstationFilmTourNL.spec.mjs`).
 */
test.describe('apps/workstation/tour/fiveBeatFilm', () => {
    let originalGetComponent, runner, service;

    const steps = () => fiveBeatFilmScript.scenes.flatMap(scene => scene.steps);

    /**
     * @returns {Neo.ai.client.TourRunner}
     */
    function createRunner() {
        const holder = {dockZoneDocument: WorkspaceDocument.clone(initialDocument), id: 'workstation-film-stage'};

        Neo.getComponent = () => holder;
        runner = Neo.create(TourRunner, {
            componentId: holder.id,
            dockService: service,
            mode       : 'spec',
            script     : fiveBeatFilmScript
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

    test('the screenplay validates and names only shipped operations and handled cues', () => {
        const
            {valid, errors} = validateTourScript(fiveBeatFilmScript, {operations: Operations.operations}),
            cues            = steps().filter(step => step.cue).map(step => step.cue.type),
            operations      = steps().filter(step => step.type === 'op').map(step => step.descriptor.operation);

        expect(valid).toBe(true);
        expect(errors).toEqual([]);
        // the film opens on the committed tear-out right after a three-second cold open; the journey
        // (one drag across every boundary, ending in the first vessel) and the return stay contiguous
        // with it, the order the five-beat witness proves them in; the rail beat follows the return,
        // the resize (a real pointer drag with the live preview) settles the layout after it, and
        // the drop-zone showcase moves the travelled pane afterwards
        expect(fiveBeatFilmScript.scenes.map(scene => scene.id)).toEqual([
            'film-cold-open', 'film-tear-out', 'film-journey', 'film-reintegration',
            'film-rails', 'film-resize', 'film-showcase', 'film-perspectives-undo', 'film-signature'
        ]);
        fiveBeatFilmScript.scenes.forEach(scene => {
            expect(scene.steps.length, `${scene.id} must carry runnable steps`).toBeGreaterThan(0);
            expect(typeof scene.narration, `${scene.id} keeps its narration draft`).toBe('string')
        });

        // every cue the film uses is one the controller executes, and the exported list is exact
        cues.forEach(type => expect(WORKSTATION_CUE_TYPES).toContain(type));
        expect([...new Set(cues)].sort()).toEqual([...filmCueTypes].sort());
        filmCueTypes.forEach(type => expect(WORKSTATION_CUE_TYPES).toContain(type));

        // the cold open's resize is a pointer drag (a `resize` cue), so the document tier's own
        // operations are the showcase's split and the perspective scene's re-add
        expect(operations).toEqual(['splitNode', 'addTab']);
        operations.forEach(operation => expect(Operations.operations).toContain(operation))
    });

    test('every window birth is gated: a gate cue directly precedes the tear-out and the journey', () => {
        const birthing = ['tear-out', 'journey'];

        let births = 0;

        fiveBeatFilmScript.scenes.forEach(scene => {
            scene.steps.forEach((step, index) => {
                if (birthing.includes(step.cue?.type)) {
                    births++;
                    expect(scene.steps[index - 1]?.cue?.type, `${scene.id}[${index}] needs the viewer's click first`).toBe('gate');
                    expect(scene.steps[index - 1].ms, 'a gate is not pacing').toBe(0);
                    expect(typeof scene.steps[index - 1].cue.prompt).toBe('string')
                }
            })
        });

        // the tear-out and the journey (three windows behind one gate); the stack return opens no window
        expect(births).toBe(2);
        expect(steps().filter(step => step.cue?.type === 'gate')).toHaveLength(2);
        expect(steps().find(step => step.cue?.type === 'native-return').cue.ownerItemId).toBe('metrics');
        expect(steps().filter(step => step.cue?.type === 'tear-out').map(step => step.cue.options.reenter === true))
            .toEqual([false]);

        // the journey walks Commits out, back over main, out, into the vessel the tear-out committed,
        // out once more, and drops there: a target hop follows a desktop hop, and the last hop drops
        const journey = steps().find(step => step.cue?.type === 'journey').cue;

        expect(journey.hops).toEqual(['desktop', 'main', 'desktop', 'target', 'desktop', 'target']);
        expect(journey.targetItemId).toBe(steps().find(step => step.cue?.type === 'tear-out').cue.itemId);
        expect(journey.itemId).not.toBe(journey.targetItemId);
        // the journey's source is a small group; the heavy group overflows and cannot arm or re-arm there
        expect(journey.sourceNodeId).not.toBe('heavy-tabs')
    });

    test('the pacing budget sums to 91s inside the 90–150s envelope', () => {
        const total = fiveBeatFilmScript.scenes.reduce((sum, scene) => sum + scene.targetSeconds, 0);

        expect(total).toBe(91);
        expect(total).toBeGreaterThanOrEqual(fiveBeatFilmScript.envelope.minSeconds);
        expect(total).toBeLessThanOrEqual(fiveBeatFilmScript.envelope.maxSeconds)
    });

    test('the picture sets the pace: no hold inside a gesture over 1.5 s, no cue-free pause over 1 s except the named close', () => {
        const
            holds  = steps().filter(step => step.cue?.options?.birthDwellMs !== undefined).map(step => step.cue.options.birthDwellMs),
            pauses = fiveBeatFilmScript.scenes.flatMap(scene => scene.steps
                .filter(step => step.type === 'pause' && !step.cue)
                .map(step => ({scene: scene.id, ms: step.ms, caption: step.caption}))),
            close  = pauses.filter(pause => pause.scene === 'film-signature');

        expect(holds.length, 'the journey keeps its born hold').toBe(1);
        holds.forEach(ms => expect(ms, 'a hold inside a gesture reads as "that is a window", never as a park').toBeLessThanOrEqual(1500));

        pauses.filter(pause => pause.scene !== 'film-signature').forEach(pause =>
            expect(pause.ms, `${pause.scene}: "${pause.caption}"`).toBeLessThanOrEqual(1000));

        // the living close is the one outcome the viewer reads at rest; it is named, and bounded
        expect(close).toHaveLength(1);
        expect(close[0].ms).toBeLessThanOrEqual(2000);
        expect(close[0].caption).toContain('close')
    });

    test('the showcase holds each preview to read the choice, and the split gets a reading second before the restore', () => {
        const
            showcase = steps().find(step => step.cue?.type === 'cross-zone-showcase'),
            history  = fiveBeatFilmScript.scenes.find(scene => scene.id === 'film-perspectives-undo').steps,
            splitAt  = history.findIndex(step => step.type === 'op' && step.descriptor?.operation === 'splitNode');

        // a dwell over a target is a hold inside a gesture: long enough to read the choice, bounded like the born hold
        expect(showcase.cue.dwells).toHaveLength(2);
        expect(showcase.cue.options.dwellDelay).toBe(1500);
        expect(showcase.cue.options.dwellDelay).toBeLessThanOrEqual(1500);

        // the torn room is an outcome the viewer reads at rest before the restore undoes it: one cue-free second, at the cap
        expect(splitAt).toBeGreaterThan(0);
        expect(history[splitAt + 1]).toMatchObject({type: 'pause', ms: 1000});
        expect(history[splitAt + 1].cue).toBeUndefined();
        expect(history[splitAt + 2].cue?.type).toBe('perspective-restore')
    });

    test('the document tier runs twice with identical logs and ends with Security in the matrix group', async () => {
        createRunner();

        const first = await runner.start();

        expect(first.errors).toEqual([]);
        expect(first.completed).toBe(true);

        const firstDocument = Neo.getComponent('workstation-film-stage').dockZoneDocument;

        // both resizes are cues (pointer drags), which spec mode never executes: the shipped
        // proportion stands, and the receipts carry the committed vectors in the film witness
        expect(firstDocument.nodes['split-main'].sizes).toEqual([0.6, 0.4]);
        expect(firstDocument.nodes['scale-tabs'].activeItemId).toBe('security');
        expect(firstDocument.nodes['heavy-tabs'].items).not.toContain('security');
        // cues are not executed in spec mode, so the travelled panes never left the document
        expect(firstDocument.items.metrics.title).toBe('System Metrics');
        expect(firstDocument.items.commits.title).toBe('Commit Stream');
        expect(firstDocument.items.audit.title).toBe('Evidence Audit');

        runner.destroy();
        createRunner();

        const second = await runner.start();

        expect(second.completed).toBe(true);
        expect(second.errors).toEqual([]);
        expect(second.log).toEqual(first.log)
    })
});
