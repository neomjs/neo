import {setup} from '../../../../setup.mjs';

setup({
    appConfig: {
        name: 'MissionControlWalkthroughTest'
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';
import DockService    from '../../../../../../src/ai/client/DockService.mjs';
import DockZoneModel  from '../../../../../../src/dashboard/DockZoneModel.mjs';
import TourRunner     from '../../../../../../src/ai/client/TourRunner.mjs';

import {validateTourScript}                        from '../../../../../../src/ai/client/tourScript.mjs';
import {missionControlTourScript, initialDocument} from '../../../../../../apps/agentos/tour/missionControlWalkthrough.mjs';
import cockpitDockDocument                         from '../../../../../../apps/agentos/util/cockpitDockDocument.mjs';

/**
 * @summary Verifies the mission-control walkthrough screenplay as reviewed content: it
 * validates fail-closed against the live executor vocabulary, plays start-to-finish in pure
 * spec-mode replay (the screenplay is pure narration + cues — ZERO document ops, so the
 * committed stage must be byte-identical after a full run), replays deterministically, and
 * pins its cue vocabulary against the hosting contract.
 */
test.describe.serial('apps/agentos/tour/missionControlWalkthrough', () => {
    let originalGetComponent, runner, service;

    /**
     * Wires a fresh holder carrying the screenplay's own opening document.
     * @returns {Object}
     */
    function createHolder() {
        const holder = {dockZoneDocument: DockZoneModel.clone(initialDocument), id: 'walkthrough-stage'};

        Neo.getComponent = () => holder;

        return holder
    }

    /**
     * @returns {Neo.ai.client.TourRunner} a spec-mode runner on a fresh stage
     */
    function createRunner() {
        createHolder();

        runner = Neo.create(TourRunner, {
            componentId: 'walkthrough-stage',
            dockService: service,
            mode       : 'spec',
            script     : missionControlTourScript
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
        const {valid, errors} = validateTourScript(missionControlTourScript, {operations: DockZoneModel.operations});

        expect(errors).toEqual([]);
        expect(valid).toBe(true)
    });

    test('the opening stage IS the shipped cockpit default — imported, never forked', () => {
        expect(initialDocument).toEqual(cockpitDockDocument())
    });

    test('the recorded close uses the time-neutral Start fleet contract', () => {
        const
            close      = missionControlTourScript.scenes.find(scene => scene.id === 's5'),
            screenplay = JSON.stringify(missionControlTourScript);

        expect(close.caption).toBe('The Start fleet action, the perspectives, the tear-out gestures — all of it runs from this surface. One line matters more than any feature:');
        expect(screenplay).not.toMatch(/morning(?:-start)?/i)
    });

    test('pure narration: ZERO document ops, so a full spec-mode replay leaves the committed stage byte-identical', async () => {
        createRunner();

        const holder = Neo.getComponent('walkthrough-stage');
        const before = DockZoneModel.clone(holder.dockZoneDocument);
        const result = await runner.start();

        expect(result.errors).toEqual([]);
        expect(result.completed).toBe(true);
        expect(holder.dockZoneDocument).toEqual(before);

        // the storyboard shape: five scenes, no op steps anywhere
        expect(missionControlTourScript.scenes.map(scene => scene.id)).toEqual(['s1', 's2', 's3', 's4', 's5']);
        expect(missionControlTourScript.scenes.flatMap(scene => scene.steps).filter(step => step.type === 'op')).toHaveLength(0)
    });

    test('two consecutive runs replay identically', async () => {
        createRunner();

        const first = await runner.start();

        expect(first.completed).toBe(true);

        runner.destroy();
        createRunner();

        const second = await runner.start();

        expect(second.completed).toBe(true);
        expect(second.log).toEqual(first.log)
    });

    test('the cue vocabulary is exactly the hosting contract — deterministic name-addressed drill included', () => {
        const cues = missionControlTourScript.scenes.flatMap(scene => scene.steps)
            .map(step => step.cue)
            .filter(Boolean);

        expect([...new Set(cues.map(cue => cue.type))].sort()).toEqual([
            'activity-burst', 'drill', 'popout', 'reattach'
        ]);

        // the drill beat is NAME-addressed (deterministic across runs, public roster identity)
        const drill = cues.find(cue => cue.type === 'drill');

        expect(drill.name).toBe('neo-fable');

        // the burst carries its count (the consumer's injection size)
        expect(cues.find(cue => cue.type === 'activity-burst').count).toBe(40)
    });
});
