import {callWorkstationTour, getWorkstationTour} from '../utils/workstationTour.mjs';
import {test, expect}                            from '../../fixtures.mjs';
import {fiveBeatFilmScript}                      from '../../../../apps/workstation/tour/fiveBeatFilm.mjs';

/**
 * @summary The flagship film plays from the Workstation's own toolbar: **Start film tour** runs the
 * all scenes, each window scene waits at a gate until the viewer clicks **Continue** (the user
 * activation its first `window.open` needs; the journey's later births inside the same held drag
 * rest on the site's pop-up permission, which Playwright grants by launch flag), and the tour's
 * receipt carries one settled cue per beat —
 * tear-out born mid-gesture, the journey's three vessels born and retired under one pointer-down
 * and its drop into the first vessel, the stack returned home, a perspective restored, one
 * mutation undone and redone, and the arrangement saved during the journey restored across windows:
 * its window born again around both panes and brought home.
 *
 * The gestures themselves are the five-beat witness's authority
 * (`WorkstationFiveBeatNL.spec.mjs`); this spec witnesses that the screenplay drives them from a
 * button, through gates, and that every earlier window closes while the signature keeps the matrix's.
 */

const
    ordinaryScreen   = {height: 1080, width: 1920},
    ordinaryViewport = {height: 800, width: 1280},
    filmCues         = fiveBeatFilmScript.scenes.flatMap(scene => scene.steps).filter(step => step.cue).map(step => step.cue.type);

test.describe('Workstation — the film tour plays from the toolbar', () => {
    test.setTimeout(240000);
    test.use({
        colorScheme   : 'dark',
        contextOptions: {screen: ordinaryScreen},
        viewport      : ordinaryViewport
    });

    /**
     * Boots the Workstation, connects the Neural Link bridge and wires the popup probe: whether
     * the platform created a window, whether its page loaded, and whether it closed again are
     * three separate facts, logged as they happen.
     * @param {Object} fixtures `{page, neuralLink}`
     * @returns {Promise<Object>} `{app, dispose, pageErrors, popupProbe, wsId}`
     */
    async function boot({page, neuralLink}) {
        const pageErrors = [],
              popupProbe = [];

        const
            onPageError = error => {
                const value = String(error?.stack || error?.message || error || '');
                value && value !== 'undefined' && pageErrors.push(value)
            },
            onPopup = popup => {
                const fact = {closed: false, loaded: false, urlAtOpen: popup.url()};

                popupProbe.push(fact);
                console.log(`[film-probe] popup created urlAtOpen=${fact.urlAtOpen}`);
                popup.on('pageerror', error => {
                    const value = String(error?.stack || error?.message || error || '');
                    value && value !== 'undefined' && pageErrors.push(`[popup] ${value}`)
                });
                popup.once('load',  () => {fact.loaded = true; fact.urlAtLoad = popup.url(); console.log(`[film-probe] popup loaded ${fact.urlAtLoad}`)});
                popup.once('close', () => {fact.closed = true; console.log('[film-probe] popup closed')})
            };

        page.on('pageerror', onPageError);
        page.on('popup', onPopup);

        await page.goto('/apps/workstation/index.html');
        await page.waitForSelector('.workstation-tour-film',   {timeout: 30000});
        await page.waitForSelector('.neo-tab-overflow-control', {timeout: 30000});

        const
            app        = await neuralLink.connectToApp('Workstation'),
            found      = await app.findInstances({className: 'Workstation.view.Workspace'}, ['id']),
            workspaces = Array.isArray(found) ? found : found ? [found] : [],
            wsId       = workspaces[0]?.id;

        expect(workspaces, 'the connected page must own exactly one current Workspace').toHaveLength(1);
        expect(wsId).toBeTruthy();

        return {
            app,
            dispose() {
                page.off('pageerror', onPageError);
                page.off('popup', onPopup)
            },
            pageErrors,
            popupProbe,
            wsId
        }
    }

    /**
     * The receipt both arms must produce: one settled cue per beat in screenplay order, every
     * gate continued the expected way, and each window effect proven by its own receipt.
     * @param {Object} receipt The settled tour receipt.
     * @param {Object} options
     * @param {String} options.continued `'viewer'` or `'auto'` — how the gates settled.
     * @param {String[]} options.pageErrors
     */
    function assertFilmReceipt(receipt, {continued, pageErrors}) {
        // A failed journey names its hops: each one carries the window rects, the pointer and the
        // sampler's reading, so the log explains the wrong turn without a rerun.
        const journeyHops = receipt.cueReceipts.find(entry => entry.cue.type === 'journey')?.receipt?.hops;

        receipt.errors.length && journeyHops && console.log(`[film-probe] journey hops: ${JSON.stringify(journeyHops)}`);

        expect(receipt.errors, `film tour errors:\n${receipt.errors.join('\n')}\npage errors:\n${pageErrors.join('\n')}`).toEqual([]);
        expect(receipt.completed).toBe(true);
        expect(receipt.scriptId).toBe(fiveBeatFilmScript.id);
        expect(receipt.log).toHaveLength(fiveBeatFilmScript.scenes.flatMap(scene => scene.steps).length);

        // one settled receipt per cue, in screenplay order; four gates, each settled the same way
        expect(receipt.cueReceipts.map(entry => entry.cue.type)).toEqual(filmCues);
        expect(receipt.cueReceipts.filter(entry => entry.cue.type === 'gate').map(entry => entry.receipt.continued))
            .toEqual([continued, continued, continued, continued]);

        const byType = type => receipt.cueReceipts.filter(entry => entry.cue.type === type).map(entry => entry.receipt);

        // scene 2 — born mid-gesture, committed into its vessel
        const [tearOut] = byType('tear-out');

        expect(tearOut.applied, 'the detached release must transfer into its vessel').toBe(true);
        expect(tearOut.proof?.born, 'the vessel must be born before pointer-up').toBe(true);

        // scene 3 — the journey: out, back over main, out, over Metrics' window, out, and the drop —
        // three vessel generations born and retired under one pointer-down, the pane the same throughout
        const [journey] = byType('journey');

        expect(journey.applied, 'commits must dock into the metrics vessel at the end of the journey').toBe(true);
        expect(journey.hops.map(hop => hop.kind)).toEqual(['desktop', 'main', 'desktop', 'target', 'desktop', 'target']);
        expect(journey.hops.filter(hop => hop.kind === 'desktop').map(hop => hop.born), 'every desktop hop births a vessel').toEqual([true, true, true]);
        expect(journey.proof?.vesselWindowIds, 'three generations, each a fresh window').toHaveLength(3);
        expect(new Set(journey.proof?.vesselWindowIds).size).toBe(3);
        expect(journey.hops[1], 'back over main: the vessel retires on the observed re-entry and the document is untouched')
            .toMatchObject({entrySeen: true, retired: true, documentsUnchanged: true});
        expect(journey.hops.filter(hop => hop.kind === 'target').map(hop => hop.claimed), 'both visits to Metrics\' window settle as one claim').toEqual([true, true]);
        expect(journey.hops[3].snapshot, 'over Metrics\' window the proxy lives there and no vessel survives')
            .toMatchObject({claimCount: 1, sourceVesselWindowId: null, proxy: {settled: true, visible: true}});
        expect(journey.proof?.birthHold, 'the born hold keeps the window under the still pointer').toEqual({durationMs: 1500, survived: true});
        // the continuity claim is the ledger: one non-constructing read of the borrowed pane per settled hop plus the drop
        expect(journey.proof?.continuity, 'every settled hop and the drop read the same live pane').toHaveLength(7);
        expect(journey.proof?.continuity.map(entry => entry.same)).toEqual([true, true, true, true, true, true, true]);
        expect(journey.proof?.continuity.map(entry => entry.destroyed)).toEqual([false, false, false, false, false, false, false]);
        expect(new Set(journey.proof?.continuity.map(entry => entry.paneId)).size, 'one pane id throughout').toBe(1);
        expect(journey.proof?.identityPreserved, 'the same live pane rides every hop').toBe(true);

        // scene 4 — the merged stack comes home
        const [stackReturn] = byType('native-return');

        expect(stackReturn.applied, 'the whole stack must transfer home').toBe(true);
        expect(stackReturn.proof).toMatchObject({
            identityPreserved: true,
            sourceWindowGone : true,
            sourceItemIds    : expect.arrayContaining(['metrics', 'commits']),
            phaseOrder       : ['documents-adopted', 'projections-settled', 'close-dispatched', 'close-acknowledged'],
            transfer         : {descriptor: {operation: 'transferNode'}, topologyExited: true}
        });
        expect(stackReturn.proof.positions.length, 'the actual frame travels through multiple positions').toBeGreaterThan(2);
        expect(stackReturn.proof.previews.length, 'the native frame visits distinct live targets').toBeGreaterThan(1);

        // scene 5 — the rail beat: the pane folds into its edge rail, is revealed, and comes home
        const [rail] = byType('rail');

        expect(rail.applied, 'the rail beat must fold, reveal and restore the pane').toBe(true);
        expect(rail.proof, 'each rail phase carries its own receipt').toMatchObject({collapsed: true, revealed: true, restored: true});
        expect(rail.proof?.edge, 'Metrics folds into the right rail').toBe('right');

        // scene 1's first motion and scene 6's resize beat: the boundary follows the pointer live,
        // the document commits once and the workspace adopts it — each drive its own receipt
        const [firstMotion, resize] = byType('resize');

        for (const [drive, requested, label] of [[firstMotion, [0.52, 0.48], 'the first motion'], [resize, [0.42, 0.58], 'the resize beat']]) {
            expect(drive.applied, `${label} must drive the boundary and commit the proportion`).toBe(true);
            expect(drive.proof, `${label}: the preview moved before the commit, the release committed once, the workspace adopted it`)
                .toMatchObject({committedOnce: true, documentUnchangedDuringPreview: true, previewTracked: true, synced: true});
            expect(drive.proof?.drive?.observed?.started, `${label}: the Mouse sensor armed the drag itself`).toBe(true);
            expect(drive.proof?.sizesAfter?.[0], `${label}: the committed proportion`).toBeCloseTo(requested[0], 2);
            expect(drive.proof?.sizesAfter?.[1]).toBeCloseTo(requested[1], 2)
        }

        // scene 8 — capture, restore, undo, redo, each with the membership it produced; the two
        // perspective cues are found by name, since the journey captures the cross-window one first
        const byName  = (type, name) => byType(type).find(entry => entry.name === name),
              capture = byName('perspective-capture', 'film-baseline'),
              restore = byName('perspective-restore', 'film-baseline'),
              [undo]  = byType('undo'),
              [redo]  = byType('redo');

        expect(capture.applied).toBe(true);
        expect(restore.applied, 'the perspective must restore the captured arrangement').toBe(true);
        expect(restore.tabs['heavy-tabs']).toContain('security');
        expect(restore.tabs['tabs-security-0']).toBeUndefined();
        expect(undo.applied).toBe(true);
        expect(undo.tabs['heavy-tabs']).toContain('security');
        expect(undo.tabs['scale-tabs']).not.toContain('security');
        expect(redo.applied).toBe(true);
        expect(redo.tabs['scale-tabs']).toContain('security');

        // scene 9 — the arrangement saved while Metrics' window held both panes comes back: the
        // restore returns them to the closed window's workspace, the open births that window again,
        // and its stack grip returns both panes before the empty window retires
        const acrossCapture  = byName('perspective-capture', 'film-two-windows'),
              acrossRestore  = byName('perspective-restore', 'film-two-windows'),
              [reborn]       = byType('workspace-open'),
              [returnedHome] = byType('stack-return'),
              roomItems      = Object.values(acrossRestore.tabs).flat();

        expect(acrossCapture, 'the two-window arrangement is captured at the end of the journey').toMatchObject({applied: true, stored: true});
        expect(acrossRestore.applied, 'the restore applies the two-window arrangement').toBe(true);
        expect(roomItems, 'the restore takes Metrics out of the room').not.toContain('metrics');
        expect(roomItems, 'and Commits with it').not.toContain('commits');
        expect(reborn, 'the window is born again around them').toEqual({applied: true, errors: [], workspaceKey: 'workstation-vessel:metrics'});
        expect(returnedHome, 'dragging the re-born stack returns both panes and closes its emptied window')
            .toMatchObject({applied: true, errors: [], proof: {
                sourceWindowGone: true,
                sourceItemIds   : expect.arrayContaining(['metrics', 'commits']),
                phaseOrder      : ['documents-adopted', 'projections-settled', 'close-dispatched', 'close-acknowledged'],
                transfer        : {descriptor: {operation: 'transferNode'}, topologyExited: true}
            }});
        expect(returnedHome.proof.sourceItemIds, 'the restored stack carries exactly the two captured panes').toHaveLength(2);
        for (const itemId of ['metrics', 'commits']) {
            expect(returnedHome.proof.mainDocument.items, `${itemId} belongs to main after the stack return`).toHaveProperty(itemId)
        }

        // the close: the matrix leaves the room in a window of its own, that window grows beside the
        // room through its owner-granted resize route, one flick's momentum carries the rows on, and
        // the film ends on the room and the window side by side. Whether the canvas column is in the
        // frame is the take's own evidence; the witness pins the frame and the measured travel.
        const [vesselResize] = byType('vessel-resize'), grown = vesselResize.proof;

        expect(vesselResize.applied, `the matrix window must grow:\n${(vesselResize.errors || []).join('\n')}`).toBe(true);
        for (const side of ['x', 'y', 'width', 'height']) {
            expect(Math.abs(grown.after[side] - grown.target[side]), `the frame's ${side} settled on its target`).toBeLessThanOrEqual(2)
        }
        expect(grown.after.width * grown.after.height, 'the window is at least four times the frame it was born with').toBeGreaterThanOrEqual(4 * grown.before.width * grown.before.height);

        const [gridDrag] = byType('grid-drag-scroll'), travel = gridDrag.proof?.travel;

        console.log(`[film-probe] close: frame ${JSON.stringify(grown.after)} for ${JSON.stringify(grown.target)}; throw ${JSON.stringify(travel)}`);
        expect(gridDrag.applied, `the grid must follow the hand:\n${(gridDrag.errors || []).join('\n')}`).toBe(true);
        expect(gridDrag.proof?.strokes).toBe(1);
        expect(gridDrag.proof?.after?.settled, 'the momentum tail settled before the read').toBe(true);
        expect(travel?.met, 'both dragged axes reached their expected travel').toEqual({x: true, y: true});
        expect(travel?.expected?.x, 'the pan right had at least a column of room').toBeGreaterThanOrEqual(130);
        expect(travel?.observed?.x, 'the view panned right by the expected travel').toBeGreaterThanOrEqual(travel.expected.x - travel.slack.x);
        expect(travel?.observed?.y, 'the momentum carried the rows at least as far again as the hand').toBeGreaterThanOrEqual(2 * travel.requested.y);


        // the room never stopped living
        expect(receipt.feed.growth).toBeGreaterThan(0)
    }

    test('Start film tour runs all scenes; the viewer\'s Continue clicks open every window', async ({page, neuralLink}) => {
        const {app, dispose, pageErrors, popupProbe, wsId} = await boot({page, neuralLink});

        try {
            await page.click('.workstation-tour-film');

            // The provider now publishes the film's beat count, not the dense tour's.
            await expect.poll(() => callWorkstationTour(app, wsId, 'getTourState').then(state => state.totalBeats), {
                timeout: 15000
            }).toBe(fiveBeatFilmScript.scenes.flatMap(scene => scene.steps).length);

            const gatesSeen = [];

            // Drive the viewer's side of the gates: whenever playback waits, click Continue with a
            // real pointer — that click is the activation the next window birth runs inside. The
            // receipt appears only after the signature scene settles, so the loop ends on it.
            let lastCaption = null;

            // A stalled run names its beat: the cue trail, the cue errors and the popup states are
            // dumped before the timeout is rethrown, so the log explains a failure without a rerun.
            const dumpDiagnostics = async label => {
                const cueLog = await callWorkstationTour(app, wsId, 'getCueLog').catch(error => ({error: String(error)}));

                console.log(`[film-probe] ${label}: caption=${JSON.stringify(lastCaption)} gates=${JSON.stringify(gatesSeen)}`);
                console.log(`[film-probe] cue log: ${JSON.stringify(cueLog)}`);
                console.log(`[film-probe] popups: ${JSON.stringify(popupProbe)}`);
                console.log(`[film-probe] page errors: ${JSON.stringify(pageErrors)}`)
            };

            await expect.poll(async () => {
                const receipt = await callWorkstationTour(app, wsId, 'getTourReceipt');

                if (receipt) return true;

                const state = await callWorkstationTour(app, wsId, 'getTourState');

                // The caption is the tour's own progress narration; logging its changes makes a
                // stalled run name the beat it stalled on.
                if (state.caption !== lastCaption) {
                    lastCaption = state.caption;
                    console.log(`[film-probe] beat ${state.completedCount}/${state.totalBeats}: ${state.caption}`)
                }

                if (state.gate) {
                    gatesSeen.push(state.gate.prompt);
                    console.log(`[film-probe] gate: ${state.gate.prompt}`);
                    await expect(page.locator('.workstation-tour-continue')).toBeVisible({timeout: 5000});
                    await expect(page.locator('.workstation-tour-continue')).toContainText(state.gate.prompt);
                    await page.click('.workstation-tour-continue')
                }

                return false
            }, {
                message  : 'the film tour settles its receipt after the signature scene',
                timeout  : 200000,
                intervals: [250, 500, 1000]
            }).toBe(true).catch(async error => {
                await dumpDiagnostics('receipt timeout');
                throw error
            });

            const receipt = await callWorkstationTour(app, wsId, 'getTourReceipt');

            receipt.completed || await dumpDiagnostics('incomplete receipt');

            expect(gatesSeen, 'the viewer continued every gate: tear-out, journey, restored window and signature').toHaveLength(4);
            assertFilmReceipt(receipt, {continued: 'viewer', pageErrors});

            expect(popupProbe.length, 'six windows are born: tear-out, three journey generations, restored window and signature matrix').toBeGreaterThanOrEqual(6);
            // every window but the close's lives and dies inside the film; the matrix keeps its own
            await expect.poll(() => popupProbe.filter(fact => !fact.closed).length, {timeout: 15000}).toBe(1);

            expect(pageErrors).toEqual([])
        } finally {
            dispose()
        }
    });

    test('under autoGates the film runs unattended: earlier windows close and the signature matrix stays open', async ({page, neuralLink}) => {
        const {app, dispose, pageErrors, popupProbe, wsId} = await boot({page, neuralLink});

        try {
            // The replay/take mode is a controller property, set before the ordinary button is
            // pressed — the same Start a viewer uses, minus the viewer.
            await app.setProperties(await getWorkstationTour(app, wsId), {autoGates: true});
            await page.click('.workstation-tour-film');

            // The probe line carries the beat's elapsed milliseconds, since the previous beat and
            // since the film started: one replay log is the silent choreography rehearsal's
            // per-beat receipt, the pace the picture set before any voice is placed over it. The
            // poll is the clock's resolution, so it stays at 100 ms: a screenplay pacing change is
            // measured here, against this log, before any take.
            let pendingGates = 0, lastCaption = null, startedAt = Date.now(), lastBeatAt = startedAt;

            await expect.poll(async () => {
                if (await callWorkstationTour(app, wsId, 'getTourReceipt')) return true;

                const state = await callWorkstationTour(app, wsId, 'getTourState');

                if (state.caption !== lastCaption) {
                    const now = Date.now();

                    lastCaption = state.caption;
                    console.log(`[film-probe] auto beat ${state.completedCount}/${state.totalBeats} +${now - lastBeatAt}ms t=${now - startedAt}ms: ${state.caption}`);
                    lastBeatAt  = now
                }

                (await callWorkstationTour(app, wsId, 'getPendingGate')) && pendingGates++;

                return false
            }, {
                message  : 'the unattended film tour settles its receipt after the signature scene',
                timeout  : 200000,
                intervals: [100]
            }).toBe(true).catch(async error => {
                const cueLog = await callWorkstationTour(app, wsId, 'getCueLog').catch(err => ({error: String(err)}));

                console.log(`[film-probe] auto receipt timeout: caption=${JSON.stringify(lastCaption)} cue log: ${JSON.stringify(cueLog)}`);
                console.log(`[film-probe] popups: ${JSON.stringify(popupProbe)} page errors: ${JSON.stringify(pageErrors)}`);
                throw error
            });

            const receipt = await callWorkstationTour(app, wsId, 'getTourReceipt');

            // the controller's own clock: start to settlement, the picture's total before any voice
            console.log(`[film-probe] auto receipt settled: elapsed ${receipt.elapsedMs}ms`);

            expect(pendingGates, 'no gate ever waited for a viewer').toBe(0);
            await expect(page.locator('.workstation-tour-continue')).toBeHidden();
            assertFilmReceipt(receipt, {continued: 'auto', pageErrors});

            expect(popupProbe.length, 'six windows are born without a click: tear-out, three journey generations, restored window and signature matrix').toBeGreaterThanOrEqual(6);
            await expect.poll(() => popupProbe.filter(fact => !fact.closed).length, {message: 'the matrix keeps its own window; every other one closed', timeout: 15000}).toBe(1);

            expect(pageErrors).toEqual([])
        } finally {
            dispose()
        }
    });

    test('a gate is a wait, not pacing: playback holds at the first gate until Continue is clicked', async ({page, neuralLink}) => {
        const {app, dispose, wsId} = await boot({page, neuralLink});

        try {
            await page.click('.workstation-tour-film');

            const firstGate = fiveBeatFilmScript.scenes.flatMap(scene => scene.steps).find(step => step.cue?.type === 'gate').cue.prompt;

            await expect.poll(() => callWorkstationTour(app, wsId, 'getPendingGate'), {timeout: 60000})
                .toEqual({prompt: firstGate});

            // Holding, sampled over five bridge round-trips rather than a sleep: the beat count stays
            // where the gate is, the gate stays pending, and no receipt settles.
            const before = (await callWorkstationTour(app, wsId, 'getTourState')).completedCount;

            for (let sample = 0; sample < 5; sample++) {
                expect(await callWorkstationTour(app, wsId, 'getPendingGate')).toEqual({prompt: firstGate});
                expect((await callWorkstationTour(app, wsId, 'getTourState')).completedCount).toBe(before);
                expect(await callWorkstationTour(app, wsId, 'getTourReceipt')).toBeNull()
            }

            // Retire the playback owner mid-gate: the pending gate must not leak a late step.
            await callWorkstationTour(app, wsId, 'cancelTour');
            // a fresh playback owner reads the same root provider: the gate is gone and nothing runs
            const after = await callWorkstationTour(app, wsId, 'getTourState');
            expect(after.gate).toBeNull();
            expect(after.running).toBe(false)
        } finally {
            dispose()
        }
    })
});
