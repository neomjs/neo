import {setup} from '../../../../../../setup.mjs';

setup({
    appConfig: {
        name: 'FleetCockpitPerspectiveShareTest'
    }
});

import {test, expect}       from '@playwright/test';
import Neo                  from '../../../../../../../../src/Neo.mjs';
import * as core            from '../../../../../../../../src/core/_export.mjs';
import DockPerspectiveStore from '../../../../../../../../src/dashboard/DockPerspectiveStore.mjs';
import DockZoneModel        from '../../../../../../../../src/dashboard/DockZoneModel.mjs';
import FleetCockpit         from '../../../../../../../../apps/agentos/view/fleet/cockpit/Container.mjs';
import cockpitDockDocument  from '../../../../../../../../apps/agentos/util/cockpitDockDocument.mjs';

/**
 * Covers the cockpit's perspective-SHARE product verbs in isolation — export serializes the stored
 * layout to the v1 artifact, import re-admits it through validation into a SECOND store, and both
 * fail closed. These are the cockpit's own capabilities (the operator's share round-trip); the demo
 * host's tour cue chain drives them from outside, but they live on and belong to the product cockpit.
 * The tour-hosting seam itself is pinned in the demo host's tour unit.
 */
test.describe('Fleet cockpit — perspective share round-trip', () => {
    const proto = FleetCockpit.prototype;

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
});
