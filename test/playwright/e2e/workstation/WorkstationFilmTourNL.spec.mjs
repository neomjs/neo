import {callWorkstationTour, getWorkstationTour} from '../utils/workstationTour.mjs';
import {test, expect}                            from '../../fixtures.mjs';
import {fiveBeatFilmScript}                      from '../../../../apps/workstation/tour/fiveBeatFilm.mjs';

/**
 * @summary The flagship film plays from the Workstation's own toolbar: **Start film tour** runs the
 * eight scenes, every window birth waits at a gate until the viewer clicks **Continue** (the user
 * activation `window.open` needs), and the tour's receipt carries one settled cue per beat —
 * tear-out born mid-gesture, re-entry cancelled without mutation, conversion docked into the
 * first vessel, the stack returned home, a perspective restored, one mutation undone and redone.
 *
 * The gestures themselves are the five-beat witness's authority
 * (`WorkstationFiveBeatNL.spec.mjs`); this spec witnesses that the screenplay drives them from a
 * button, through gates, and that the windows it opens are all closed again by the signature.
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
     * @param {String} options.continued `'viewer'` or `'auto'` — how the three gates settled.
     * @param {String[]} options.pageErrors
     */
    function assertFilmReceipt(receipt, {continued, pageErrors}) {
        expect(receipt.errors, `film tour errors:\n${receipt.errors.join('\n')}\npage errors:\n${pageErrors.join('\n')}`).toEqual([]);
        expect(receipt.completed).toBe(true);
        expect(receipt.scriptId).toBe(fiveBeatFilmScript.id);
        expect(receipt.log).toHaveLength(fiveBeatFilmScript.scenes.flatMap(scene => scene.steps).length);

        // one settled receipt per cue, in screenplay order; three gates, each settled the same way
        expect(receipt.cueReceipts.map(entry => entry.cue.type)).toEqual(filmCues);
        expect(receipt.cueReceipts.filter(entry => entry.cue.type === 'gate').map(entry => entry.receipt.continued))
            .toEqual([continued, continued, continued]);

        const byType = type => receipt.cueReceipts.filter(entry => entry.cue.type === type).map(entry => entry.receipt);

        // scene 2 opens the film with the committed tear-out; scene 7, after the rails and the resize, is the morph:
        // born mid-gesture, retired on re-entry with zero mutation, proven
        const [tearOut, reentry] = byType('tear-out');

        expect(reentry.applied).toBe(false);
        expect(reentry.reentered, 'the vessel must retire on re-entry, before pointer-up').toBe(true);
        expect(reentry.proof?.documentsUnchanged, 'the re-entry must leave the committed document byte-identical').toBe(true);
        expect(reentry.proof?.birthHold, 'the short born hold must preserve the vessel without arming a preview')
            .toEqual({durationMs: 1500, survived: true, claimCount: 0, hasTarget: false, hasPreview: false, converted: false});
        expect(reentry.proof?.entrySeen, 'window absence alone is not proof of re-entry').toBe(true);

        // scene 2 — born mid-gesture, committed into its vessel
        expect(tearOut.applied, 'the detached release must transfer into its vessel').toBe(true);
        expect(tearOut.proof?.born, 'the vessel must be born before pointer-up').toBe(true);

        // scene 3 — the conversion docks into the first vessel
        const [convert] = byType('convert-while-dragging');

        expect(convert.applied, 'commits must dock into the metrics vessel').toBe(true);

        // scene 4 — the merged stack comes home
        const [stackReturn] = byType('stack-return');

        expect(stackReturn.applied, 'the whole stack must transfer home').toBe(true);

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

        // scene 9 — capture, restore, undo, redo, each with the membership it produced
        const [capture] = byType('perspective-capture'),
              [restore] = byType('perspective-restore'),
              [undo]    = byType('undo'),
              [redo]    = byType('redo');

        expect(capture.applied).toBe(true);
        expect(restore.applied, 'the perspective must restore the captured arrangement').toBe(true);
        expect(restore.tabs['heavy-tabs']).toContain('security');
        expect(restore.tabs['tabs-security-0']).toBeUndefined();
        expect(undo.applied).toBe(true);
        expect(undo.tabs['heavy-tabs']).toContain('security');
        expect(undo.tabs['scale-tabs']).not.toContain('security');
        expect(redo.applied).toBe(true);
        expect(redo.tabs['scale-tabs']).toContain('security');

        // the room never stopped living
        expect(receipt.feed.growth).toBeGreaterThan(0)
    }

    test('Start film tour runs all eight scenes; the viewer\'s Continue clicks open every window', async ({page, neuralLink}) => {
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

            expect(gatesSeen, 'the viewer continued every gate').toHaveLength(3);
            assertFilmReceipt(receipt, {continued: 'viewer', pageErrors});

            // every window the film opened was closed again by the signature
            expect(popupProbe.length, 'three windows are born: the tear-out, the re-entry, the conversion').toBeGreaterThanOrEqual(3);
            await expect.poll(() => popupProbe.every(fact => fact.closed), {timeout: 15000}).toBe(true);

            expect(pageErrors).toEqual([])
        } finally {
            dispose()
        }
    });

    test('under autoGates the film runs unattended: no gate waits for a viewer, and the same windows are born and closed', async ({page, neuralLink}) => {
        const {app, dispose, pageErrors, popupProbe, wsId} = await boot({page, neuralLink});

        try {
            // The replay/take mode is a controller property, set before the ordinary button is
            // pressed — the same Start a viewer uses, minus the viewer.
            await app.setProperties(await getWorkstationTour(app, wsId), {autoGates: true});
            await page.click('.workstation-tour-film');

            // The probe line carries the beat's elapsed milliseconds, since the previous beat and
            // since the film started: one replay log is the silent choreography rehearsal's
            // per-beat receipt, the pace the picture set before any voice is placed over it.
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
                intervals: [250, 500, 1000]
            }).toBe(true).catch(async error => {
                const cueLog = await callWorkstationTour(app, wsId, 'getCueLog').catch(err => ({error: String(err)}));

                console.log(`[film-probe] auto receipt timeout: caption=${JSON.stringify(lastCaption)} cue log: ${JSON.stringify(cueLog)}`);
                console.log(`[film-probe] popups: ${JSON.stringify(popupProbe)} page errors: ${JSON.stringify(pageErrors)}`);
                throw error
            });

            const receipt = await callWorkstationTour(app, wsId, 'getTourReceipt');

            expect(pendingGates, 'no gate ever waited for a viewer').toBe(0);
            await expect(page.locator('.workstation-tour-continue')).toBeHidden();
            assertFilmReceipt(receipt, {continued: 'auto', pageErrors});

            expect(popupProbe.length, 'three windows are born without a click: the tear-out, the re-entry, the conversion').toBeGreaterThanOrEqual(3);
            await expect.poll(() => popupProbe.every(fact => fact.closed), {timeout: 15000}).toBe(true);

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
