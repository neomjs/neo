import {setup} from '../../setup.mjs';

setup({
    appConfig: {
        name: 'DashboardDockKeyboardCommandsTest'
    }
});

import {test, expect}               from '@playwright/test';
// the machine module is deliberately pure (no Neo import), so THIS spec must populate the
// Neo namespace setup() touches — without these, the file is green in a shared worker (a
// sibling spec populated Neo first) and red run ALONE: a test-isolation leak, not a machine fact
import Neo                          from '../../../../src/Neo.mjs';
import * as core                    from '../../../../src/core/_export.mjs';
import {createDockKeyboardCommands} from '../../../../src/dashboard/dock/interaction/KeyboardCommands.mjs';

/**
 * @summary The keyboard detach command machine, driven end-to-end through its injected seams —
 * the discrete twin of the DockTearOut witnesses.
 *
 * Every witness is a choreography-contract pin for the a11y leg: admission fails CLOSED and is
 * ANNOUNCED (a silent no-op keystroke is the failure a11y parity exists to prevent), the model
 * commits exactly once after admission, a refused/throwing commit retires the vessel, focus-
 * transfer denial is a NAMED terminal (Boolean admission, degraded arrival announced), and every
 * announcement derives from the outcome terminal — never from the keystroke. The seams are the
 * assertion surface; the machine exposes nothing else.
 */
const CYCLE_TARGETS = [
    {workspaceId: 'main',  tabsId: 'tabs-a', label: 'Main window, left pane'},
    {workspaceId: 'pop-1', tabsId: 'tabs-b', label: 'Popup one'},
    {workspaceId: 'pop-2', tabsId: 'tabs-c', label: 'Popup two'}
];

test.describe('Neo.dashboard.dock.interaction.KeyboardCommands — createDockKeyboardCommands', () => {
    const harness = ({admit = true, commitErrors = [], commitThrows = false, focusGranted = true, targets = CYCLE_TARGETS} = {}) => {
        const calls = {announced: [], applied: [], closed: [], committed: [], focused: [], focusedWs: [], highlights: [], opened: [], synced: []};

        const commands = createDockKeyboardCommands({
            announce      : announcement => calls.announced.push(announcement),
            applyOperation: operation => {
                calls.applied.push(operation);
                if (commitThrows) throw new Error('host reducer exploded');
                return commitErrors.length
                    ? {document: null, errors: commitErrors}
                    : {document: {committed: true, detached: operation.itemId}, errors: []}
            },
            closeVessel   : vessel => calls.closed.push(vessel),
            commitTransfer: request => {
                calls.committed.push(request);
                if (commitThrows) throw new Error('adoption exploded');
                return {errors: commitErrors}
            },
            enumerateTargets: () => targets,
            focusVessel     : vessel => {
                calls.focused.push(vessel);
                return focusGranted
            },
            focusWorkspace : request => {
                calls.focusedWs.push(request);
                return focusGranted
            },
            highlightTarget : target => calls.highlights.push(target),
            onDocumentChange: (document, operation) => calls.synced.push({document, operation}),
            openVessel      : async request => {
                calls.opened.push(request);
                return admit ? {popupHeight: 480, popupWidth: 640, windowName: `vessel-${request.itemId}`} : null
            }
        });

        return {calls, commands}
    };

    test('failed admission fails CLOSED and is ANNOUNCED: nothing commits, focus never attempted, the item stays docked', async () => {
        const {calls, commands} = harness({admit: false});

        const outcome = await commands.detachItem({itemId: 'graph', itemLabel: 'Graph'});

        expect(calls.opened).toHaveLength(1);          // the host WAS asked (Boolean windowOpen is its check)
        expect(calls.applied).toHaveLength(0);         // no admission = nothing to commit
        expect(calls.focused).toHaveLength(0);         // focus is never attempted without a vessel
        expect(calls.closed).toHaveLength(0);          // nothing was opened, nothing retires

        // the degraded state is ANNOUNCED — a silent no-op keystroke would be indistinguishable
        // from a broken one, precisely the a11y failure this contract exists to prevent
        expect(calls.announced).toHaveLength(1);
        expect(calls.announced[0]).toMatchObject({command: 'detach', itemId: 'graph', terminal: 'REJECTED', focusTransferred: false});
        expect(calls.announced[0].message).toContain('Graph stays docked');

        expect(outcome).toEqual({focusTransferred: false, itemId: 'graph', terminal: 'REJECTED'})
    });

    test('the keyboard path presents the SAME openVessel seam shape as the pointer path (null proxy/zone, no branching)', async () => {
        const {calls, commands} = harness();

        await commands.detachItem({itemId: 'graph'});

        expect(calls.opened[0]).toEqual({itemId: 'graph', proxyRect: null, sortZone: null})
    });

    test('an admitted command commits detachItem EXACTLY once, syncs the committed document, and the vessel stays', async () => {
        const {calls, commands} = harness();

        const outcome = await commands.detachItem({itemId: 'graph'});

        expect(calls.applied).toEqual([{operation: 'detachItem', itemId: 'graph'}]);
        expect(calls.synced).toHaveLength(1);
        expect(calls.synced[0].document).toEqual({committed: true, detached: 'graph'});
        expect(calls.closed, 'a committed detach KEEPS its vessel — it owns the item now').toHaveLength(0);

        expect(outcome).toEqual({focusTransferred: true, itemId: 'graph', terminal: 'COMMITTED_TARGET', windowName: 'vessel-graph'})
    });

    test('a model refusal retires the vessel and announces the rejection — no window survives owning nothing', async () => {
        const {calls, commands} = harness({commitErrors: ['item "graph" is not in the tree']});

        const outcome = await commands.detachItem({itemId: 'graph'});

        expect(calls.applied).toHaveLength(1);
        expect(calls.synced).toHaveLength(0);
        // retirement names the ITEM, not just the window — the host's connect-race bookkeeping
        // is keyed by itemId and a window-only retirement would leave it stale
        expect(calls.closed).toEqual([{itemId: 'graph', popupHeight: 480, popupWidth: 640, windowName: 'vessel-graph'}]);
        expect(calls.focused).toHaveLength(0);

        expect(calls.announced).toHaveLength(1);
        expect(calls.announced[0]).toMatchObject({terminal: 'REJECTED', focusTransferred: false});
        expect(outcome.terminal).toBe('REJECTED')
    });

    test('a THROWING reducer lands on the same refusal path — the vessel never orphans', async () => {
        const {calls, commands} = harness({commitThrows: true});

        const outcome = await commands.detachItem({itemId: 'graph'});

        expect(calls.synced).toHaveLength(0);
        expect(calls.closed).toHaveLength(1);
        expect(calls.announced[0]).toMatchObject({terminal: 'REJECTED'});
        expect(outcome.terminal).toBe('REJECTED')
    });

    test('focus-transfer denial is a NAMED terminal: the item stays committed, the degraded arrival is announced', async () => {
        const {calls, commands} = harness({focusGranted: false});

        const outcome = await commands.detachItem({itemId: 'graph', itemLabel: 'Graph'});

        // the commit stands — focus denial must never undo a committed detach
        expect(calls.synced).toHaveLength(1);
        expect(calls.closed).toHaveLength(0);

        expect(calls.announced).toHaveLength(1);
        expect(calls.announced[0]).toMatchObject({terminal: 'COMMITTED_TARGET', focusTransferred: false});
        expect(calls.announced[0].message).toContain('Focus stayed here');

        expect(outcome).toEqual({focusTransferred: false, itemId: 'graph', terminal: 'COMMITTED_TARGET', windowName: 'vessel-graph'})
    });

    test('every announcement derives from the outcome terminal — announced state cannot diverge from committed state', async () => {
        for (const [config, expected] of [
            [{admit: false},              'REJECTED'],
            [{commitErrors: ['refused']}, 'REJECTED'],
            [{},                          'COMMITTED_TARGET'],
            [{focusGranted: false},       'COMMITTED_TARGET']
        ]) {
            const {calls, commands} = harness(config);
            const outcome           = await commands.detachItem({itemId: 'graph'});

            expect(calls.announced).toHaveLength(1);
            expect(calls.announced[0].terminal).toBe(expected);
            expect(outcome.terminal).toBe(expected)
        }
    });

    test('cycleStart with no legal targets fails CLOSED and is ANNOUNCED — never a silent no-op keystroke', () => {
        const {calls, commands} = harness({targets: []});

        const outcome = commands.cycleStart({itemId: 'graph', itemLabel: 'Graph'});

        expect(outcome).toEqual({candidates: 0, itemId: 'graph', terminal: 'REJECTED'});
        expect(calls.highlights).toHaveLength(0);
        expect(calls.announced[0]).toMatchObject({command: 'transfer', terminal: 'REJECTED'});
        expect(calls.announced[0].message).toContain('No transfer targets available');
        expect(commands.getActiveCycle()).toBeNull()
    });

    test('cycleStart highlights the first candidate and announces the full cycle grammar (position, keys)', () => {
        const {calls, commands} = harness();

        const outcome = commands.cycleStart({itemId: 'graph', itemLabel: 'Graph'});

        expect(outcome).toEqual({candidates: 3, itemId: 'graph', terminal: 'HOVERING_CLAIM'});
        expect(calls.highlights[0]).toEqual(CYCLE_TARGETS[0]);
        expect(calls.announced[0].message).toContain('Target 1 of 3: Main window, left pane');
        expect(calls.announced[0].message).toContain('Enter moves Graph, Escape cancels');
        expect(commands.getActiveCycle()).toEqual({count: 3, index: 0, itemId: 'graph'})
    });

    test('cycleNext / cyclePrev wrap around; the highlight and the position announcement track the candidate', () => {
        const {calls, commands} = harness();

        commands.cycleStart({itemId: 'graph'});
        commands.cycleNext();
        expect(calls.announced.at(-1).message).toContain('Target 2 of 3: Popup one');

        commands.cycleNext();
        commands.cycleNext();
        expect(calls.announced.at(-1).message).toContain('Target 1 of 3'); // wrapped forward

        commands.cyclePrev();
        expect(calls.announced.at(-1).message).toContain('Target 3 of 3: Popup two'); // wrapped back
        expect(calls.highlights.at(-1)).toEqual(CYCLE_TARGETS[2])
    });

    test('cycleCommit commits the CURRENT candidate exactly once, clears the highlight, and focus follows the item', async () => {
        const {calls, commands} = harness();

        commands.cycleStart({itemId: 'graph', itemLabel: 'Graph'});
        commands.cycleNext();

        const outcome = await commands.cycleCommit();

        expect(calls.committed).toEqual([{itemId: 'graph', target: {tabsId: 'tabs-b', workspaceId: 'pop-1'}}]);
        expect(calls.highlights.at(-1)).toBeNull();
        expect(calls.focusedWs).toEqual([{workspaceId: 'pop-1'}]);
        expect(outcome.terminal).toBe('COMMITTED_TARGET');
        expect(calls.announced.at(-1).message).toContain('Graph moved to Popup one. Focus moved with it.');
        expect(commands.getActiveCycle()).toBeNull()
    });

    test('a rejected transfer leaves the item where it is and announces the rejection — no focus attempt', async () => {
        const {calls, commands} = harness({commitErrors: ['target tabs vanished']});

        commands.cycleStart({itemId: 'graph', itemLabel: 'Graph'});

        const outcome = await commands.cycleCommit();

        expect(outcome.terminal).toBe('REJECTED');
        expect(calls.focusedWs).toHaveLength(0);
        expect(calls.announced.at(-1).message).toContain('Move rejected by the workspace. Graph stays where it is.')
    });

    test('a THROWING transfer seam lands on the refusal path — the cycle ends honestly', async () => {
        const {calls, commands} = harness({commitThrows: true});

        commands.cycleStart({itemId: 'graph'});

        const outcome = await commands.cycleCommit();

        expect(outcome.terminal).toBe('REJECTED');
        expect(calls.announced.at(-1)).toMatchObject({terminal: 'REJECTED'})
    });

    test('cycleCancel is the CANCELLED terminal: zero model mutation, highlight cleared, cancellation announced', () => {
        const {calls, commands} = harness();

        commands.cycleStart({itemId: 'graph', itemLabel: 'Graph'});

        const outcome = commands.cycleCancel();

        expect(calls.committed).toHaveLength(0);
        expect(outcome.terminal).toBe('CANCELLED');
        expect(calls.highlights.at(-1)).toBeNull();
        expect(calls.announced.at(-1).message).toContain('Move cancelled. Graph stays where it is.');
        expect(commands.getActiveCycle()).toBeNull()
    });

    test('outside an active cycle the cycle verbs are guarded no-ops — the host routes keys only while one is active', async () => {
        const {calls, commands} = harness();

        commands.cycleNext();
        commands.cyclePrev();
        expect(await commands.cycleCommit()).toBeUndefined();
        expect(commands.cycleCancel()).toBeUndefined();

        expect(calls.announced).toHaveLength(0);
        expect(calls.committed).toHaveLength(0)
    });

    test('focus denial on a committed transfer is a NAMED degraded arrival — the move stands, the announcement says so', async () => {
        const {calls, commands} = harness({focusGranted: false});

        commands.cycleStart({itemId: 'graph', itemLabel: 'Graph'});

        const outcome = await commands.cycleCommit();

        expect(outcome.terminal).toBe('COMMITTED_TARGET');
        expect(outcome.focusTransferred).toBe(false);
        expect(calls.announced.at(-1).message).toContain('Focus stayed here')
    });

    // ── the ASYNC host shapes: the first real host commits an async document pair, so the
    // machine must await settlement and fail-close on every unproven result — a synchronous
    // fixture alone would let a delayed refusal announce a green terminal

    const asyncHarness = commitImpl => {
        const calls = {announced: [], committed: [], focusedWs: []};

        const commands = createDockKeyboardCommands({
            announce      : announcement => calls.announced.push(announcement),
            applyOperation: () => ({document: {}, errors: []}),
            closeVessel   : () => {},
            commitTransfer: request => {
                calls.committed.push(request);
                return commitImpl(request)
            },
            enumerateTargets: () => CYCLE_TARGETS,
            focusVessel     : () => true,
            focusWorkspace  : request => {
                calls.focusedWs.push(request);
                return true
            },
            highlightTarget : () => {},
            onDocumentChange: () => {},
            openVessel      : async () => null
        });

        return {calls, commands}
    };

    const settleDelay = ms => new Promise(resolve => setTimeout(resolve, ms));

    test('a DELAYED async success settles BEFORE the terminal — focus and announcement wait for the pair', async () => {
        let settled = false;

        const {calls, commands} = asyncHarness(async () => {
            await settleDelay(60);
            settled = true;
            return {errors: []}
        });

        commands.cycleStart({itemId: 'graph'});

        const outcome = await commands.cycleCommit();

        expect(settled, 'the commit must have settled before the terminal').toBe(true);
        expect(outcome.terminal).toBe('COMMITTED_TARGET');
        expect(calls.focusedWs).toHaveLength(1)
    });

    test('a DELAYED async refusal lands REJECTED with ZERO focus — the false-green falsifier, pinned', async () => {
        const {calls, commands} = asyncHarness(async () => {
            await settleDelay(60);
            return {errors: ['async refusal']}
        });

        commands.cycleStart({itemId: 'graph', itemLabel: 'Graph'});

        const outcome = await commands.cycleCommit();

        expect(outcome.terminal).toBe('REJECTED');
        expect(calls.focusedWs, 'no focus may move on a refused commit').toHaveLength(0);
        expect(calls.announced.at(-1).message).toContain('Move rejected')
    });

    test('an async REJECTION lands on the refusal path — zero focus, honest terminal', async () => {
        const {calls, commands} = asyncHarness(async () => {
            await settleDelay(20);
            throw new Error('adoption exploded late')
        });

        commands.cycleStart({itemId: 'graph'});

        const outcome = await commands.cycleCommit();

        expect(outcome.terminal).toBe('REJECTED');
        expect(calls.focusedWs).toHaveLength(0)
    });

    test('malformed results refuse across the shape matrix — an unproven commit is a refused one', async () => {
        for (const bad of [undefined, null, 42, {}, {errors: 'nope'}]) {
            const {calls, commands} = asyncHarness(async () => bad);

            commands.cycleStart({itemId: 'graph'});

            const outcome = await commands.cycleCommit();

            expect(outcome.terminal, `shape ${JSON.stringify(bad)} must refuse`).toBe('REJECTED');
            expect(calls.focusedWs).toHaveLength(0)
        }
    })
});
