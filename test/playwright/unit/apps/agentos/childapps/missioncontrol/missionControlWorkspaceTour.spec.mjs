import {setup} from '../../../../../setup.mjs';

setup({
    appConfig: {
        name: 'MissionControlWorkspaceTourTest'
    }
});

import {test, expect}          from '@playwright/test';
import Neo                     from '../../../../../../../src/Neo.mjs';
import * as core               from '../../../../../../../src/core/_export.mjs';
import MissionControlWorkspace from '../../../../../../../apps/agentos/childapps/missioncontrol/view/MissionControlWorkspace.mjs';
import cockpitDockDocument     from '../../../../../../../apps/agentos/util/cockpitDockDocument.mjs';
import {fusionTourScript}      from '../../../../../../../apps/agentos/tour/fusionFlagship.mjs';

/**
 * Covers the tour-hosting seam on the DEMO HOST — the ROUTING decisions, in isolation (the
 * loadActivity spec's philosophy): `onTourBeat` maps each scripted cue to exactly one COMPOSED
 * COCKPIT collaborator, the one-stage guard refuses a second concurrent play, and the terminal-
 * truth/reversibility contracts hold. Since the host drives the cockpit's public verbs on the
 * composed instance, every mock nests those verbs under a `cockpit` stub — exactly the seam the
 * host reaches through at runtime. The full tour REPLAY on the real reducers lives in the tour-
 * script spec; the live vessel/e2e truth is the e2e leaf's; the cockpit's own perspective-share
 * verbs are pinned in the fleet perspective-share unit.
 */
test.describe('Mission-control demo host — tour hosting seam over the composed cockpit', () => {
    const proto = MissionControlWorkspace.prototype;

    /**
     * A spy host recording every composed-cockpit call the cue executor can route to — each verb
     * returns its REAL success shape so the receipt discipline holds. The driven verbs live under
     * `cockpit` (the host reaches them via its `cockpit` getter), the tour state on the host.
     * @returns {Object}
     */
    function makeSpyHost() {
        const calls = [];

        return {
            calls,
            cuePromise    : Promise.resolve(),
            cueReceipts   : [],
            cueErrors     : [],
            executeTourCue: proto.executeTourCue,
            setTourCaption: text => calls.push(['caption', text]),
            cockpit       : {
                activatePerspective      : name  => (calls.push(['load', name]), {errors: [], switched: true}),
                dockService              : {capturePerspective: params => (calls.push(['save', params.perspectiveName, params.replace]), Promise.resolve({errors: [], stored: true}))},
                exportPerspectiveArtifact: name  => (calls.push(['export', name]), {errors: [], exported: true}),
                importPerspectiveArtifact: ()    => (calls.push(['import']), {errors: [], imported: true}),
                popOutAgentDetail        : ()    => (calls.push(['popout']), Promise.resolve({detached: true, errors: []})),
                reattachAgentDetail      : ()    => (calls.push(['reattach']), Promise.resolve({errors: [], reattached: true})),
                syncControlBar           : ()    => {}
            }
        }
    }

    test('executeTourCue routes every cue class to exactly one composed-cockpit collaborator and returns its receipt; unknown types fail closed', async () => {
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

        // behavior keyed by NAME (the beat handlers chain onto microtasks, so a mutated spy would
        // race the chain): "Ghost" refuses, everything else switches
        host.cockpit.activatePerspective = name => name === 'Ghost'
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

    test('one stage, one take: a play invoked while a tour runs is a guarded refusal, not a second runner', async () => {
        const result = await proto.playFusionTour.call({playTour: proto.playTour, tourRunner: {}});

        expect(result.completed).toBe(false);
        expect(result.errors[0]).toContain('already running')
    });

    test('a detached detail pane on the composed cockpit refuses the take fail-closed — reattach is a host decision, never an implicit tour side-effect', async () => {
        const result = await proto.playFusionTour.call({playTour: proto.playTour, tourRunner: null, cockpit: {detachedDetail: {windowName: 'x'}}});

        expect(result.completed).toBe(false);
        expect(result.errors[0]).toContain('reattach before a take')
    });

    test('the walkthrough cues route to the composed cockpit seams with receipts: the burst is bounded/honest/reversible, the drill selects through the controller — refusals fail closed', async () => {
        const streamSets = [];
        const selected   = [];

        const host = {
            tourStreamRestore: null,
            cockpit          : {
                getReference: name => name === 'activity-stream'
                    ? {adapterState: 'sample', events: [{agentId: 'owner-held'}], set: config => streamSets.push(config)}
                    : name === 'fleet-grid'
                        ? {store: {items: [{agentId: 'neo-fable'}, {agentId: 'neo-opus-ada'}]}}
                        : null,
                getController: () => ({onAgentSelect: data => selected.push(data.agentId)})
            }
        };

        const burst = await proto.executeTourCue.call(host, {type: 'activity-burst', count: 7});

        expect(burst).toEqual({injected: 7, provenance: 'tour:demo-burst'});
        // the surface's adapter state is NOT touched: a sample surface stays labeled sample
        expect(streamSets[0].adapterState).toBeUndefined();
        expect(streamSets[0].events).toHaveLength(7);
        // TOUR provenance on every event — generated data never poses as Memory Core arrival
        expect(streamSets[0].events.every(event => event.source === 'tour:demo-burst')).toBe(true);
        // distinct actors + monotone timestamps: coalescing can never collapse the burst
        expect(new Set(streamSets[0].events.map(event => event.agentId)).size).toBe(7);
        // the displaced owner-held state is captured for the take-terminal restore
        expect(host.tourStreamRestore).toEqual({adapterState: 'sample', events: [{agentId: 'owner-held'}]});

        const drill = await proto.executeTourCue.call(host, {type: 'drill', name: 'neo-fable'});

        expect(drill).toEqual({drilled: 'neo-fable'});
        expect(selected).toEqual(['neo-fable']);

        // fail-closed refusals: unknown resident, missing stream, and every dishonest count
        await expect(proto.executeTourCue.call(host, {type: 'drill', name: 'no-such-agent'})).rejects.toThrow('no roster resident');
        await expect(proto.executeTourCue.call({cockpit: {getReference: () => null}}, {type: 'activity-burst', count: 3})).rejects.toThrow('no activity stream');
        for (const bad of [undefined, 0, -5, 2.5, 201, 'many']) {
            await expect(proto.executeTourCue.call(host, {type: 'activity-burst', count: bad}), `count "${bad}" must refuse`)
                .rejects.toThrow('explicit integer count')
        }
    });

    test('restoreTourStream puts the composed cockpit\'s owner-held state back exactly and goes inert after — the burst is reversible at the take terminal', () => {
        const streamSets = [];
        const host       = {
            tourStreamRestore: {adapterState: 'sample', events: [{agentId: 'owner-held'}]},
            cockpit          : {getReference: name => name === 'activity-stream' ? {set: config => streamSets.push(config)} : null}
        };

        proto.restoreTourStream.call(host);

        expect(streamSets).toEqual([{adapterState: 'sample', events: [{agentId: 'owner-held'}]}]);
        expect(host.tourStreamRestore).toBeNull();

        // inert when nothing was displaced
        proto.restoreTourStream.call(host);
        expect(streamSets).toHaveLength(1)
    });

    test('CURRENT-ATTEMPT terminal truth: a thrown refresh publishes a failed report for THIS take — a seeded stale success can never masquerade (the RA-1 falsifier)', async () => {
        const restored = [];
        const host     = {
            playTour         : proto.playTour,
            restoreTourStream: () => restored.push(true),
            tourRunner       : null,
            tourStreamRestore: null,
            // the seeded STALE SUCCESS from a previous take — the exact masquerade RA-1 names
            lastTourReport: {completed: true, cueErrors: [], cueReceipts: 6, errors: [], log: ['old']},
            resetTourStage: () => {},
            onTourBeat    : () => {},
            onTourComplete: () => {},
            setTourCaption: () => {},
            // the composed cockpit: refresh rejects after ownership is claimed
            cockpit: {id: 'truth-stage', dockService: null, detachedDetail: null, refreshPromise: Promise.reject(new Error('refresh rejected by the falsifier'))}
        };

        const report = await proto.playFusionTour.call(host);

        // the readable report is CURRENT + FAILED — never stale + green
        expect(report.completed).toBe(false);
        expect(report.errors[0]).toContain('refresh rejected');
        expect(host.lastTourReport).toBe(report);
        expect(host.lastTourReport.log).toEqual([]);
        // ownership released through the same terminal, restore ran
        expect(host.tourRunner).toBeNull();
        expect(restored).toEqual([true])
    });

    test('single-flight under CONCURRENCY: ownership is claimed before any await, so a second call refuses while the first is parked in the refresh window', async () => {
        // hold the pre-start refresh window OPEN — the exact window the falsifier exploited
        let releaseRefresh;

        const host = {
            playTour         : proto.playTour,
            restoreTourStream: () => {},
            tourRunner       : null,
            tourStreamRestore: null,
            resetTourStage   : () => {},
            onTourBeat       : () => {},
            onTourComplete   : () => {},
            setTourCaption   : () => {},
            cockpit          : {id: 'concurrency-stage', dockService: null, detachedDetail: null, refreshPromise: new Promise(resolve => releaseRefresh = resolve)}
        };

        const first  = proto.playFusionTour.call(host).catch(error => ({completed: false, errors: [String(error)], crashed: true})),
              second = await proto.playFusionTour.call(host);

        // the SECOND call refuses at the guard — ownership was already claimed synchronously
        expect(second.completed).toBe(false);
        expect(second.errors[0]).toContain('already running');

        releaseRefresh();
        await first;

        // ownership fully released after the take settles
        expect(host.tourRunner).toBeNull()
    });

    test('resetTourStage commits a fresh opening document through the composed cockpit\'s commit loop — the replay seam', () => {
        const commits = [];
        const host    = {cockpit: {onDockZoneDocumentChange: document => commits.push(document)}};

        const returned = proto.resetTourStage.call(host);

        expect(commits).toHaveLength(1);
        expect(commits[0]).toBe(returned);
        // the committed stage IS the screenplay's opening document (fresh clone, never the frozen original)
        expect(returned).toEqual(cockpitDockDocument());
        expect(Object.isFrozen(returned)).toBe(false)
    });
});
