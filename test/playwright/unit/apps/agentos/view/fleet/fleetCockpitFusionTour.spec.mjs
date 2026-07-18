import {setup} from '../../../../../setup.mjs';

setup({
    appConfig: {
        name: 'FleetCockpitFusionTourTest'
    }
});

import {test, expect}       from '@playwright/test';
import Neo                  from '../../../../../../../src/Neo.mjs';
import * as core            from '../../../../../../../src/core/_export.mjs';
import DockPerspectiveStore from '../../../../../../../src/dashboard/DockPerspectiveStore.mjs';
import DockZoneModel        from '../../../../../../../src/dashboard/DockZoneModel.mjs';
import FleetCockpit         from '../../../../../../../apps/agentos/view/fleet/FleetCockpit.mjs';
import cockpitDockDocument  from '../../../../../../../apps/agentos/view/fleet/cockpitDockDocument.mjs';
import {fusionTourScript}   from '../../../../../../../apps/agentos/tour/fusionFlagship.mjs';

/**
 * Covers the fusion-tour hosting seam on the cockpit — the ROUTING decisions, in isolation
 * (the loadActivity spec's philosophy): `onTourBeat` maps each scripted cue to exactly one
 * cockpit collaborator, the share round-trip runs on the REAL perspective store, and the
 * one-stage guard refuses a second concurrent play. The full tour REPLAY on the real reducers
 * lives in the tour-script spec; the live vessel/e2e truth is the e2e leaf's.
 */
test.describe('Fleet cockpit — fusion tour hosting seam', () => {
    const proto = FleetCockpit.prototype;

    /**
     * A spy host recording every collaborator call the cue executor can route to — each verb
     * returns its REAL success shape so the receipt discipline holds.
     * @returns {Object}
     */
    function makeSpyHost() {
        const calls = [];

        return {
            calls,
            cuePromise               : Promise.resolve(),
            cueReceipts              : [],
            cueErrors                : [],
            executeTourCue           : proto.executeTourCue,
            activatePerspective      : name  => (calls.push(['load', name]), {errors: [], switched: true}),
            dockService              : {capturePerspective: params => (calls.push(['save', params.perspectiveName, params.replace]), Promise.resolve({errors: [], stored: true}))},
            exportPerspectiveArtifact: name  => (calls.push(['export', name]), {errors: [], exported: true}),
            importPerspectiveArtifact: ()    => (calls.push(['import']), {errors: [], imported: true}),
            popOutAgentDetail        : ()    => (calls.push(['popout']), Promise.resolve({detached: true, errors: []})),
            reattachAgentDetail      : ()    => (calls.push(['reattach']), Promise.resolve({errors: [], reattached: true})),
            setTourCaption           : text  => calls.push(['caption', text]),
            syncControlBar           : ()    => {}
        }
    }

    test('executeTourCue routes every cue class to exactly one collaborator and returns its receipt; unknown types fail closed', async () => {
        const host = makeSpyHost();

        expect((await proto.executeTourCue.call(host, {type: 'perspective-save', name: 'Mission Control'})).stored).toBe(true);
        expect((await proto.executeTourCue.call(host, {type: 'perspective-load', name: 'Mission Control'})).switched).toBe(true);
        expect((await proto.executeTourCue.call(host, {type: 'perspective-export', name: 'Shared Session'})).exported).toBe(true);
        expect((await proto.executeTourCue.call(host, {type: 'perspective-import'})).imported).toBe(true);
        expect((await proto.executeTourCue.call(host, {type: 'popout', itemId: 'detail'})).detached).toBe(true);
        expect((await proto.executeTourCue.call(host, {type: 'reattach', itemId: 'detail'})).reattached).toBe(true);

        expect(host.calls.map(call => call[0])).toEqual(['save', 'load', 'export', 'import', 'popout', 'reattach']);

        await expect(proto.executeTourCue.call(host, {type: 'no-such-cue'})).rejects.toThrow('unknown cue type')
    });

    test('the script and the host agree on the cue vocabulary — every scripted cue type executes to a receipt', async () => {
        const scripted = new Set(
            fusionTourScript.scenes.flatMap(scene => scene.steps)
                .map(step => step.cue?.type)
                .filter(Boolean)
        );

        for (const type of scripted) {
            const host    = makeSpyHost(),
                  receipt = await proto.executeTourCue.call(host, {type, name: 'X', itemId: 'detail'});

            expect(receipt, `cue "${type}" must produce a receipt`).toBeTruthy()
        }
    });

    test('the settlement chain (the Workstation pattern): the runner never awaits cues, so onTourBeat chains them — a REFUSED verb folds into cueErrors, cue truth outranks a green log', async () => {
        const host = makeSpyHost();

        // behavior keyed by NAME (the beat handlers chain onto microtasks, so a mutated spy
        // would race the chain): "Ghost" refuses, everything else switches
        host.activatePerspective = name => name === 'Ghost'
            ? {errors: ['no such perspective'], switched: false}
            : {errors: [], switched: true};

        proto.onTourBeat.call(host, {cue: {type: 'perspective-load', name: 'Mission Control'}});
        // the refusing verb must FOLD, not throw out of the beat handler
        proto.onTourBeat.call(host, {cue: {type: 'perspective-load', name: 'Ghost'}});
        // and a later healthy cue still settles — one failure never wedges the chain
        proto.onTourBeat.call(host, {cue: {type: 'perspective-load', name: 'Recovery'}});

        await host.cuePromise;

        expect(host.cueReceipts.map(entry => entry.cue.name)).toEqual(['Mission Control', 'Recovery']);
        expect(host.cueErrors).toEqual(['perspective-load: no such perspective']);
        // the failure surfaced on the caption strip, never silently
        expect(host.calls.filter(call => call[0] === 'caption').some(call => call[1].includes('Surface cue failed'))).toBe(true)
    });

    test('the share round-trip on the REAL store: export serializes the stored layout, import re-admits it through validation, fingerprint-stable', () => {
        const store    = Neo.create(DockPerspectiveStore, {}),
              captured = DockZoneModel.capturePerspective(cockpitDockDocument(), {layoutId: 'tour-shared-session', perspectiveName: 'Shared Session', title: 'Shared Session'});

        expect(captured.errors).toEqual([]);
        expect(store.savePerspective(captured.layout).saved).toBe(true);

        // export half on a fake host carrying the real store
        const exporter = {perspectiveStore: store, sharedPerspectiveArtifact: null};
        const exported = proto.exportPerspectiveArtifact.call(exporter, 'Shared Session');

        expect(exported).toEqual({errors: [], exported: true});
        expect(typeof exporter.sharedPerspectiveArtifact).toBe('string');

        // import half into a SECOND, empty store — the teammate's cockpit
        const targetStore = Neo.create(DockPerspectiveStore, {}),
              importer    = {
                  perspectiveStore         : targetStore,
                  sharedPerspectiveArtifact: exporter.sharedPerspectiveArtifact,
                  syncControlBar           : () => {}
              };

        const imported = proto.importPerspectiveArtifact.call(importer);

        expect(imported.errors).toEqual([]);
        expect(imported.imported).toBe(true);

        // fingerprint-stable across the trip: the re-admitted record equals the captured one
        expect(targetStore.getPerspective('Shared Session').layout).toEqual(captured.layout);

        store.destroy();
        targetStore.destroy()
    });

    test('import fails closed: no held artifact and malformed JSON both refuse without touching the store', () => {
        const store = Neo.create(DockPerspectiveStore, {});

        expect(proto.importPerspectiveArtifact.call({perspectiveStore: store, sharedPerspectiveArtifact: null}).imported).toBe(false);

        const malformed = proto.importPerspectiveArtifact.call({perspectiveStore: store, sharedPerspectiveArtifact: '{not json'});

        expect(malformed.imported).toBe(false);
        expect(malformed.errors[0]).toContain('not valid JSON');
        expect(store.list()).toEqual([]);

        store.destroy()
    });

    test('one stage, one take: a play invoked while a tour runs is a guarded refusal, not a second runner', async () => {
        const result = await proto.playFusionTour.call({tourRunner: {}});

        expect(result.completed).toBe(false);
        expect(result.errors[0]).toContain('already running')
    });

    test('a detached detail pane refuses the take fail-closed — reattach is a host decision, never an implicit tour side-effect', async () => {
        const result = await proto.playFusionTour.call({tourRunner: null, detachedDetail: {windowName: 'x'}});

        expect(result.completed).toBe(false);
        expect(result.errors[0]).toContain('reattach before a take')
    });

    test('resetTourStage commits a fresh opening document through the standard commit loop — the replay seam', () => {
        const commits = [];
        const host    = {onDockZoneDocumentChange: document => commits.push(document)};

        const returned = proto.resetTourStage.call(host);

        expect(commits).toHaveLength(1);
        expect(commits[0]).toBe(returned);
        // the committed stage IS the screenplay's opening document (fresh clone, never the frozen original)
        expect(returned).toEqual(cockpitDockDocument());
        expect(Object.isFrozen(returned)).toBe(false)
    });
});
