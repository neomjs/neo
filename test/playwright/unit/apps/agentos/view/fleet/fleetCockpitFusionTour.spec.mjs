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
     * A spy host recording every collaborator call `onTourBeat` can route to.
     * @returns {Object}
     */
    function makeSpyHost() {
        const calls = [];

        return {
            calls,
            activatePerspective      : name  => calls.push(['load', name]),
            dockService              : {capturePerspective: params => (calls.push(['save', params.perspectiveName, params.replace]), Promise.resolve({stored: true}))},
            exportPerspectiveArtifact: name  => calls.push(['export', name]),
            importPerspectiveArtifact: ()    => calls.push(['import']),
            popOutAgentDetail        : ()    => calls.push(['popout']),
            reattachAgentDetail      : ()    => calls.push(['reattach']),
            setTourCaption           : text  => calls.push(['caption', text]),
            syncControlBar           : ()    => {}
        }
    }

    test('onTourBeat routes every scripted cue class to exactly one collaborator — and a cue-less beat only feeds the caption', () => {
        const host = makeSpyHost();

        proto.onTourBeat.call(host, {caption: 'hello', cue: null});
        expect(host.calls).toEqual([['caption', 'hello']]);

        host.calls.length = 0;
        proto.onTourBeat.call(host, {cue: {type: 'perspective-save', name: 'Mission Control'}});
        proto.onTourBeat.call(host, {cue: {type: 'perspective-load', name: 'Mission Control'}});
        proto.onTourBeat.call(host, {cue: {type: 'perspective-export', name: 'Shared Session'}});
        proto.onTourBeat.call(host, {cue: {type: 'perspective-import'}});
        proto.onTourBeat.call(host, {cue: {type: 'popout', itemId: 'detail'}});
        proto.onTourBeat.call(host, {cue: {type: 'reattach', itemId: 'detail'}});

        expect(host.calls).toEqual([
            ['save', 'Mission Control', true],
            ['load', 'Mission Control'],
            ['export', 'Shared Session'],
            ['import'],
            ['popout'],
            ['reattach']
        ])
    });

    test('the script and the host agree on the cue vocabulary — every scripted cue type has a routing branch', () => {
        const scripted = new Set(
            fusionTourScript.scenes.flatMap(scene => scene.steps)
                .map(step => step.cue?.type)
                .filter(Boolean)
        );

        for (const type of scripted) {
            const host = makeSpyHost();

            proto.onTourBeat.call(host, {cue: {type, name: 'X', itemId: 'detail'}});
            expect(host.calls.length, `cue "${type}" must route somewhere`).toBe(1)
        }
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
});
