import {setup} from '../../setup.mjs';

setup({
    appConfig: {
        name: 'DashboardDockNativeVesselTransactionTest'
    },
    mockLocalStorage: false,
    mockMain        : false
});

import {test, expect}          from '@playwright/test';
import Neo                     from "../../../../src/Neo.mjs";
import * as core               from "../../../../src/core/_export.mjs";
import NativeVesselTransaction from '../../../../src/dashboard/dock/window/NativeVesselTransaction.mjs';
import Rectangle               from '../../../../src/util/Rectangle.mjs';
import WindowManager           from '../../../../src/manager/Window.mjs';

/**
 * The default park / re-show transaction behind `VesselPark`'s three seams.
 *
 * The contract under test is the one neither existing consumer expressed: **the authority key set
 * is a function of the transaction's declared restore obligation.** All ten keys are reported
 * always; `sourceResizeCapable` gates the refusal only when the transaction owes a geometry
 * restore. Both directions are asserted, because a witness that only shows the refusal cannot tell
 * a conditional gate from an unconditional one — which is exactly how the two consumers came to
 * disagree about what "authorized" means.
 */

const
    ROUTE        = {nativeHandleKey: 'handle-1', targetWindowId: 'win-source'},
    SCREEN       = {availHeight: 1000, availLeft: 0, availTop: 0, availWidth: 1600},
    TARGET_ROUTE = {nativeHandleKey: 'handle-target', targetWindowId: 'win-target'};

/**
 * @summary Registers the two windows the choreography measures, and doubles every platform call.
 *
 * The park effect DISPATCHES — optional resize, then the park-move — so a descriptor alone cannot
 * exercise it. `calls` records the order, and whether a call happened at all: a park that still
 * focused would be asking for the z-order a real drag never grants (#19278).
 * @param {Object} [outcomes={}] Per-call boolean results; anything omitted succeeds.
 * @param {Object} [options={}]
 * @param {Object|null} [options.screen=SCREEN] The target display's work area `getWindowData` answers.
 * @returns {{calls:String[],restore:Function}}
 */
const installPlatform = (outcomes={}, {screen=SCREEN}={}) => {
    Neo.Main       ??= {};
    Neo.main       ??= {};
    Neo.main.addon ??= {};

    const
        calls    = [],
        previous = {
            focus        : Neo.Main.windowNativeFocus,
            getWindowData: Neo.Main.getWindowData,
            moveTo       : Neo.Main.windowNativeMoveTo,
            resizeTo     : Neo.Main.windowNativeResizeTo,
            addon        : Neo.main?.addon?.DragDrop
        },
        answer   = (name, payload) => {
            calls.push(name);
            payload && calls.push(`${name}:${payload.x},${payload.y}`);
            return Promise.resolve(outcomes[name] !== false)
        };

    WindowManager.register({id: 'win-source', innerRect: new Rectangle(40, 60, 480, 320), outerRect: new Rectangle(40, 60, 480, 320), nativeRoute: ROUTE});
    WindowManager.register({id: 'win-target', innerRect: new Rectangle(0, 0, 800, 600),   outerRect: new Rectangle(0, 0, 800, 600),   nativeRoute: TARGET_ROUTE});

    Neo.Main.getWindowData        = () => Promise.resolve({screen});
    Neo.Main.windowNativeFocus    = () => answer('focus');
    Neo.Main.windowNativeMoveTo   = data => answer('moveTo', data);
    Neo.Main.windowNativeResizeTo = () => answer('resize');
    Neo.main.addon.DragDrop = {
        parkWindowDrag                : data => answer('park', data),
        resumeWindowDrag              : data => answer('resume', data),
        retireWindowDragOrphanRecovery: () => answer('retireOrphan')
    };

    return {
        calls,
        restore() {
            Neo.Main.getWindowData        = previous.getWindowData;
            Neo.Main.windowNativeFocus    = previous.focus;
            Neo.Main.windowNativeMoveTo   = previous.moveTo;
            Neo.Main.windowNativeResizeTo = previous.resizeTo;
            Neo.main.addon.DragDrop       = previous.addon;
            WindowManager.unregister('win-source');
            WindowManager.unregister('win-target')
        }
    }
};

/**
 * @summary Installs a route resolver whose grant per capability is scripted.
 *
 * `resolveNativeRoute` is the engine's own route authority. Stubbing it keeps this spec about the
 * transaction's decision rather than about the platform's, and the granted map is the only input
 * that varies between the arms below.
 * @param {Object} granted `{position, resize, focus}` booleans.
 * @returns {Function} the previous implementation, for restoration
 */
const stubRoutes = granted => {
    const previous = WindowManager.resolveNativeRoute;

    WindowManager.resolveNativeRoute = ({capability}) => ({
        capable      : granted[capability] === true,
        granted      : granted[capability] === true,
        hasHandle    : true,
        ownerMatches : true,
        targetMatches: true
    });

    return previous
};

const descriptorFor = ({geometry=null, receipts}) => ({
    ownerWindowId  : () => 'win-owner',
    publishReceipt : (key, receipt) => {receipts[key] = receipt},
    resolveVessel  : () => ({nativeRoute: ROUTE, windowId: 'win-source', windowName: 'vessel-1'}),
    restoreGeometry: () => geometry,
    retireVessel   : async () => true,
    targetWindowId : () => 'win-target'
});

test.describe('Neo.dashboard.dock.window.NativeVesselTransaction', () => {
    let platform = null,
        restore  = null;

    test.afterEach(() => {
        restore && (WindowManager.resolveNativeRoute = restore);
        platform?.restore();
        platform = null;
        restore  = null
    });

    test('the authority block is the fixed ten keys, in order, whatever the obligation', () => {
        const receipts = {};

        restore  = stubRoutes({focus: true, position: true, resize: false});
        platform = installPlatform();

        return NativeVesselTransaction.effectsFor(descriptorFor({receipts}))
            .parkVessel({itemId: 'item-1', windowName: 'vessel-1'})
            .then(() => {
                expect(Object.keys(receipts.park.authority), 'ten keys, fixed order').toEqual(
                    NativeVesselTransaction.authorityKeys
                );
                expect(receipts.park.authority.sourceResizeCapable, 'reported even when not required').toBe(false)
            })
    });

    test('a position-only park ADMITS a route with no resize capability', async () => {
        const receipts = {};

        restore  = stubRoutes({focus: true, position: true, resize: false});
        platform = installPlatform();

        const admitted = await NativeVesselTransaction
            .effectsFor(descriptorFor({geometry: null, receipts}))
            .parkVessel({itemId: 'item-1', windowName: 'vessel-1'});

        expect(admitted, 'no declared geometry restore ⇒ resize is not a prerequisite').toBe(true);
        expect(receipts.park.owesResize, 'the obligation is recorded, not inferred').toBe(false)
    });

    test('a geometry-restoring park REFUSES the same route', async () => {
        const receipts = {};

        restore  = stubRoutes({focus: true, position: true, resize: false});
        platform = installPlatform();

        const admitted = await NativeVesselTransaction
            .effectsFor(descriptorFor({geometry: {height: 200, width: 300}, receipts}))
            .parkVessel({itemId: 'item-1', windowName: 'vessel-1'});

        expect(admitted, 'a promised extent restore makes resize a prerequisite at park').toBe(false);
        expect(receipts.park.owesResize).toBe(true)
    });

    test('the park clears any prior restore receipt, so a stale one cannot read as this gesture', async () => {
        const receipts = {restore: {stale: true}};

        restore  = stubRoutes({focus: true, position: true, resize: true});
        platform = installPlatform();

        await NativeVesselTransaction
            .effectsFor(descriptorFor({receipts}))
            .parkVessel({itemId: 'item-1', windowName: 'vessel-1'});

        expect(receipts.restore).toBeNull()
    });

    test('the re-show converts a content rect to the frame origin moveTo consumes', async () => {
        const receipts = {};

        restore  = stubRoutes({focus: true, position: true, resize: true});
        platform = installPlatform();

        const effects = NativeVesselTransaction.effectsFor(descriptorFor({receipts}));

        await effects.reshowVessel({itemId: 'item-1', rect: {x: 400, y: 300}, windowName: 'vessel-1'});

        // With no published chrome the offset is zero and the origin passes through unchanged —
        // the pre-chrome behaviour, asserted so the conversion cannot silently become mandatory.
        expect(receipts.restore.frame, 'no chrome published ⇒ content origin is the frame origin')
            .toEqual({x: 400, y: 300})
    });

    test('a re-show with no finite origin refuses before dispatching', async () => {
        const receipts = {};

        restore  = stubRoutes({focus: true, position: true, resize: true});
        platform = installPlatform();

        const admitted = await NativeVesselTransaction
            .effectsFor(descriptorFor({receipts}))
            .reshowVessel({itemId: 'item-1', rect: null, windowName: 'vessel-1'});

        expect(admitted, 'no origin is a refusal, never a move to NaN').toBe(false);
        expect(receipts.restore.frame).toBeNull()
    });

    test('the park moves the vessel clear of the target and focuses nothing (#19278)', async () => {
        const receipts = {};

        restore  = stubRoutes({focus: true, position: true, resize: true});
        platform = installPlatform();

        const parked = await NativeVesselTransaction
            .effectsFor(descriptorFor({receipts}))
            .parkVessel({itemId: 'item-1', windowName: 'vessel-1'});

        expect(parked).toBe(true);
        expect(platform.calls.filter(call => !call.includes(':')), 'one move, no focus step').toEqual(['park']);
        expect(receipts.park).toMatchObject({cleared: true, parked: true});
        // the 480x320 frame's work-area corner farthest from the 800x600 target at the origin
        expect(receipts.park.requested).toEqual({x: 1120, y: 680});
        expect(receipts.park).not.toHaveProperty('refocused')
    });

    test('a target focus route the park no longer uses does not refuse it', async () => {
        const receipts = {};

        restore  = stubRoutes({focus: false, position: true, resize: true});
        platform = installPlatform();

        const parked = await NativeVesselTransaction
            .effectsFor(descriptorFor({receipts}))
            .parkVessel({itemId: 'item-1', windowName: 'vessel-1'});

        expect(parked).toBe(true);
        expect(receipts.park.authority.targetFocusCapable, 'still reported').toBe(false)
    });

    test('a geometry-restoring park resizes before the move, and places the shrunk frame', async () => {
        const receipts = {};

        restore  = stubRoutes({focus: true, position: true, resize: true});
        platform = installPlatform();

        await NativeVesselTransaction
            .effectsFor(descriptorFor({geometry: {height: 320, width: 480}, receipts}))
            .parkVessel({itemId: 'item-1', windowName: 'vessel-1'});

        expect(platform.calls.filter(call => !call.includes(':'))).toEqual(['resize', 'park']);
        expect(receipts.park.resized).toBe(true)
    });

    test('a target spanning the work area still parks, and the receipt says it is not cleared', async () => {
        const receipts = {};

        restore  = stubRoutes({focus: true, position: true, resize: true});
        platform = installPlatform({}, {screen: {availHeight: 600, availLeft: 0, availTop: 0, availWidth: 800}});

        const parked = await NativeVesselTransaction
            .effectsFor(descriptorFor({receipts}))
            .parkVessel({itemId: 'item-1', windowName: 'vessel-1'});

        expect(parked, 'no corner is clear: the zones before the park are the belt').toBe(true);
        expect(receipts.park.cleared).toBe(false)
    });

    test('a target display without a measurable work area refuses before any move', async () => {
        const receipts = {};

        restore  = stubRoutes({focus: true, position: true, resize: true});
        platform = installPlatform({}, {screen: null});

        const parked = await NativeVesselTransaction
            .effectsFor(descriptorFor({receipts}))
            .parkVessel({itemId: 'item-1', windowName: 'vessel-1'});

        expect(parked).toBe(false);
        expect(receipts.park.refusedAt).toBe('screen');
        expect(platform.calls).toEqual([])
    });

    test('a source too large to hide behind the target refuses when nothing may shrink it', async () => {
        const receipts = {};

        restore  = stubRoutes({focus: true, position: true, resize: true});
        platform = installPlatform();
        // Bigger than the 800x600 target: it cannot be covered as-is.
        // `manager.Base#register` refuses an id it already holds rather than replacing it, so the
        // oversized source has to displace the fixture's window instead of shadowing it.
        WindowManager.unregister('win-source');
        WindowManager.register({
            id         : 'win-source', innerRect: new Rectangle(0, 0, 1200, 900),
            nativeRoute: ROUTE, outerRect: new Rectangle(0, 0, 1200, 900)
        });

        const admitted = await NativeVesselTransaction
            .effectsFor(descriptorFor({geometry: null, receipts}))
            .parkVessel({itemId: 'item-1', windowName: 'vessel-1'});

        expect(admitted, 'no extent obligation ⇒ no licence to shrink ⇒ refuse').toBe(false);
        expect(receipts.park.fits).toBe(false);
        expect(platform.calls, 'refused before any platform effect').toEqual([])
    });

    test('the same oversized source is ADMITTED when the transaction owes an extent restore', async () => {
        const receipts = {};

        restore  = stubRoutes({focus: true, position: true, resize: true});
        platform = installPlatform();
        // `manager.Base#register` refuses an id it already holds rather than replacing it, so the
        // oversized source has to displace the fixture's window instead of shadowing it.
        WindowManager.unregister('win-source');
        WindowManager.register({
            id         : 'win-source', innerRect: new Rectangle(0, 0, 1200, 900),
            nativeRoute: ROUTE, outerRect: new Rectangle(0, 0, 1200, 900)
        });

        const admitted = await NativeVesselTransaction
            .effectsFor(descriptorFor({geometry: {height: 900, width: 1200}, receipts}))
            .parkVessel({itemId: 'item-1', windowName: 'vessel-1'});

        expect(admitted, 'the promise to restore the extent is what licences the shrink').toBe(true);
        expect(receipts.park.fits).toBe(false);
        expect(platform.calls.filter(call => !call.includes(':'))).toEqual(['resize', 'park']);
        // the frame shrinks to the 800x600 target; beside it, the corner farthest from it is clear
        expect(receipts.park).toMatchObject({cleared: true, requested: {x: 800, y: 400}})
    });

    test('a terminal restore ending a DRAG asks its owner before the route', async () => {
        const receipts = {};

        restore  = stubRoutes({focus: true, position: true, resize: true});
        platform = installPlatform();

        const admitted = await NativeVesselTransaction
            .effectsFor({...descriptorFor({receipts}), terminalRestoreOwner: 'drag'})
            .reshowVessel({itemId: 'item-1', rect: {x: 10, y: 20}, terminal: true, windowName: 'vessel-1'});

        expect(admitted).toBe(true);
        expect(receipts.restore.addonRestored, 'the drag owner performed it').toBe(true);
        expect(platform.calls.filter(call => !call.includes(':')))
            .toEqual(['resume']);
        expect(platform.calls, 'the route was never addressed directly').not.toContain('moveTo')
    });

    test('a terminal restore ending a CONVERSION addresses the route directly', async () => {
        const receipts = {};

        restore  = stubRoutes({focus: true, position: true, resize: true});
        platform = installPlatform();

        // The default: no drag exists to hand back to, so asking one would succeed against a
        // stale effect. Both consumers are real and they differ here, so it is declared.
        const admitted = await NativeVesselTransaction
            .effectsFor(descriptorFor({receipts}))
            .reshowVessel({itemId: 'item-1', rect: {x: 10, y: 20}, terminal: true, windowName: 'vessel-1'});

        expect(admitted).toBe(true);
        expect(receipts.restore.addonRestored, 'no drag owner was consulted').toBeUndefined();
        expect(platform.calls).toContain('moveTo');
        expect(platform.calls, 'and the drag was never resumed').not.toContain('resume')
    });

    test('a windowName mismatch refuses the re-show even with every route granted', async () => {
        const receipts = {};

        restore  = stubRoutes({focus: true, position: true, resize: true});
        platform = installPlatform();

        const admitted = await NativeVesselTransaction
            .effectsFor(descriptorFor({receipts}))
            .reshowVessel({itemId: 'item-1', rect: {x: 10, y: 20}, windowName: 'a-different-vessel'});

        expect(admitted).toBe(false)
    });
});

/**
 * Where the park puts the vessel so it covers none of the target (#19278). Every arm is a real frame on a
 * real work area: the corner's frame must stay whole inside the work area, and "farthest" only decides
 * between corners that overlap the target equally.
 */
test.describe('Neo.dashboard.dock.window.NativeVesselTransaction.resolveClearPark', () => {
    const park = (frame, screen, target) => NativeVesselTransaction.resolveClearPark({frame, screen, target});

    test('the frame takes the clear corner farthest from the target, whole inside the work area', () => {
        const screen = {availHeight: 1000, availLeft: 0, availTop: 0, availWidth: 1600};

        expect(park({height: 320, width: 480}, screen, {height: 600, width: 800, x: 0, y: 0}))
            .toEqual({cleared: true, x: 1120, y: 680});
        // three corners clear an off-centre target; the farthest of them wins, not the first
        expect(park({height: 300, width: 400}, screen, {height: 400, width: 600, x: 200, y: 100}))
            .toEqual({cleared: true, x: 1200, y: 700})
    });

    test('a second display keeps the frame on its own work area', () => {
        const screen = {availHeight: 900, availLeft: 1920, availTop: 0, availWidth: 1440};

        expect(park({height: 300, width: 400}, screen, {height: 600, width: 800, x: 2000, y: 100}))
            .toEqual({cleared: true, x: 2960, y: 600})
    });

    test('a frame wider than the work area is clamped to its left edge, and can still clear the target', () => {
        const screen = {availHeight: 800, availLeft: 0, availTop: 0, availWidth: 1000};

        expect(park({height: 300, width: 1200}, screen, {height: 300, width: 400, x: 0, y: 0}))
            .toEqual({cleared: true, x: 0, y: 500})
    });

    test('a target spanning the work area answers the least-overlapping corner, not cleared', () => {
        const screen = {availHeight: 600, availLeft: 0, availTop: 0, availWidth: 800};

        expect(park({height: 300, width: 400}, screen, {height: 600, width: 800, x: 0, y: 0}))
            .toEqual({cleared: false, x: 0, y: 0})
    });

    test('an unmeasurable frame, work area or target answers null', () => {
        const
            frame  = {height: 300, width: 400},
            screen = {availHeight: 900, availLeft: 0, availTop: 0, availWidth: 1440},
            target = {height: 600, width: 800, x: 0, y: 0};

        expect(park(frame, null, target)).toBeNull();
        expect(park(frame, {...screen, availWidth: 0}, target)).toBeNull();
        expect(park({...frame, height: NaN}, screen, target)).toBeNull();
        expect(park(frame, screen, {...target, x: undefined})).toBeNull()
    });
});

/**
 * The tear-out close every host used to write for itself. The arms pin the ORDER as much as the verdicts:
 * identity before resolution, route authority before the pane moves, the pane home before its window
 * goes, and the platform's own answer returned — the by-name `false` the copies used to swallow above all.
 */
test.describe('Neo.dashboard.dock.window.NativeVesselTransaction#closeVessel', () => {
    const CLOSE_ROUTE = {capabilities: {close: true}, nativeHandleKey: 'handle-close', ownerWindowId: 'win-owner', targetWindowId: 'win-vessel'};

    let restorePlatform = null;

    test.afterEach(() => {
        restorePlatform?.();
        restorePlatform = null
    });

    /**
     * @summary Doubles both platform close routes and records what reached them, in order.
     * @param {Object} [answers={}] `{byName, native}`: `true`, `false` or `'throw'`; `true` when omitted.
     * Mutate it between calls to change an answer without reinstalling the double.
     * @returns {Object[]} `{name, data}` per dispatched call.
     */
    const installClose = (answers={}) => {
        Neo.Main ??= {};

        const
            calls    = [],
            previous = {byName: Neo.Main.windowClose, native: Neo.Main.windowNativeClose},
            answer   = (name, data) => {
                calls.push({data, name});
                if (answers[name] === 'throw') throw new Error(`${name} threw`);
                return Promise.resolve(answers[name] ?? true)
            };

        Neo.Main.windowClose       = data => answer('byName', data);
        Neo.Main.windowNativeClose = data => answer('native', data);

        restorePlatform = () => {
            Neo.Main.windowClose       = previous.byName;
            Neo.Main.windowNativeClose = previous.native;
            ['win-connecting', 'win-vessel'].forEach(id => WindowManager.get(id) && WindowManager.unregister(id))
        };

        return calls
    };

    // The lifecycle answers only under `source-1`, so every arm also proves the routine reads the admission
    // and the vessel under the caller's registration.
    const descriptorFor = ({admission=null, connection=null, receipts=[], ...rest} = {}) => ({
        nativeWindows : {
            getAdmission : sourceId => sourceId === 'source-1' ? admission : null,
            getConnection: sourceId => sourceId === 'source-1' ? connection : null,
            getOwner     : () => null
        },
        ownerWindowId : 'win-owner',
        publishReceipt: receipt => receipts.push(receipt),
        sourceId      : 'source-1',
        windowNameFor : itemId => `vessel-${itemId}`,
        ...rest
    });

    test('a mismatched name, a foreign entry name or a superseded lineage refuses before any dispatch', async () => {
        const calls = installClose();

        for (const [flag, vessel, connection] of [
            ['windowNameMatches', {itemId: 'a', windowName: 'someone-else'}, null],
            ['entryNameMatches',  {itemId: 'a', windowName: 'vessel-a'}, {windowId: 'win-vessel', windowName: 'vessel-a-successor'}],
            ['lineageMatches',    {generationToken: 'old', itemId: 'a', windowName: 'vessel-a'}, {generationToken: 'new', windowId: 'win-vessel', windowName: 'vessel-a'}]
        ]) {
            const receipts = [];

            expect(await NativeVesselTransaction.closeVessel(descriptorFor({connection, receipts}), vessel), flag).toBe(false);
            expect(receipts[0].identity[flag], flag).toBe(false);
            expect(receipts[0].stage, flag).toBe('identity-refused')
        }

        expect(calls, 'nothing reached the platform').toEqual([])
    });

    test('a present route that fails an axis refuses before the pane moves or the platform is asked', async () => {
        const calls    = installClose(),
              receipts = [],
              restored = [];

        WindowManager.register({id: 'win-vessel', nativeRoute: {...CLOSE_ROUTE, capabilities: {close: false}}});

        expect(await NativeVesselTransaction.closeVessel(descriptorFor({
            connection: {windowId: 'win-vessel', windowName: 'vessel-a'},
            embodiment: {getWindowId: () => 'win-vessel', isStaged: () => true, promote: () => true, restore: data => restored.push(data) > 0},
            receipts,
            sourceOwns: () => true
        }), {itemId: 'a', windowName: 'vessel-a'})).toBe(false);

        expect(receipts[0]).toMatchObject({route: {closeCapable: false, present: true}, stage: 'route-refused'});
        expect(restored, 'the pane stayed where it was').toEqual([]);
        expect(calls).toEqual([])
    });

    test('a granted route closes through its native handle and returns the platform answer', async () => {
        const answers = {},
              calls   = installClose(answers);

        WindowManager.register({id: 'win-vessel', nativeRoute: CLOSE_ROUTE});

        for (const answer of [true, false]) {
            const receipts = [];

            answers.native = answer;
            calls.length   = 0;

            expect(await NativeVesselTransaction.closeVessel(
                descriptorFor({connection: {windowId: 'win-vessel', windowName: 'vessel-a'}, receipts}),
                {itemId: 'a', windowName: 'vessel-a'}
            ), String(answer)).toBe(answer);
            expect(calls).toEqual([{data: {nativeHandleKey: 'handle-close', targetWindowId: 'win-vessel', windowId: 'win-owner'}, name: 'native'}]);
            expect(receipts[0], 'a resolved route the platform answered').toMatchObject({
                dispatch: 'native', route: {present: true}, stage: answer ? 'acknowledged' : 'platform-refused'
            })
        }
    });

    test('an unrouted vessel closes by name and returns the platform answer, a refusal included', async () => {
        const answers = {},
              calls   = installClose(answers);

        for (const [answer, expected, stage] of [[true, true, 'acknowledged'], [false, false, 'platform-refused'], ['throw', false, 'threw']]) {
            const receipts = [];

            answers.byName = answer;

            expect(await NativeVesselTransaction.closeVessel(descriptorFor({receipts}), {itemId: 'a', windowName: 'vessel-a'}), String(answer)).toBe(expected);
            expect(receipts[0], `no route, then the platform answered ${answer}`).toMatchObject({dispatch: 'semantic', route: {present: false}, stage})
        }

        expect(calls.map(call => call.data)).toEqual(Array(3).fill({names: ['vessel-a'], windowId: 'win-owner'}))
    });

    test('a staged pane goes home before its window closes, and a refused settle keeps the window', async () => {
        const calls = installClose();

        for (const [sourceOwns, method] of [[true, 'restore'], [false, 'promote']]) {
            calls.length = 0;

            expect(await NativeVesselTransaction.closeVessel(descriptorFor({
                embodiment: {
                    getWindowId: () => 'win-vessel',
                    isStaged   : () => true,
                    promote    : data => calls.push({data, name: 'promote'}) > 0,
                    restore    : data => calls.push({data, name: 'restore'}) > 0
                },
                sourceOwns: () => sourceOwns
            }), {itemId: 'a', windowName: 'vessel-a'}), method).toBe(true);

            expect(calls.map(call => call.name), method).toEqual([method, 'byName']);
            expect(calls[0].data).toEqual({itemId: 'a', windowId: 'win-vessel'})
        }

        const receipts = [];

        calls.length = 0;

        expect(await NativeVesselTransaction.closeVessel(descriptorFor({
            embodiment: {getWindowId: () => 'win-vessel', isStaged: () => true, restore: () => false},
            receipts,
            sourceOwns: () => true
        }), {itemId: 'a', windowName: 'vessel-a'})).toBe(false);

        expect(receipts[0]).toMatchObject({embodiment: {settled: false, sourceOwns: true}, stage: 'embodiment-refused'});
        expect(calls, 'the window was never asked to close').toEqual([])
    });

    test('a restoring settle waits for the host unwind, and a refused unwind refuses', async () => {
        const calls = installClose(),
              order = [];

        expect(await NativeVesselTransaction.closeVessel(descriptorFor({
            beforeRestore: () => false,
            embodiment   : {getWindowId: () => 'win-vessel', isStaged: () => true, restore: () => order.push('restore') > 0},
            sourceOwns   : () => true
        }), {itemId: 'a', windowName: 'vessel-a'})).toBe(false);

        expect(order, 'no restore after a refused unwind').toEqual([]);
        expect(calls).toEqual([]);

        expect(await NativeVesselTransaction.closeVessel(descriptorFor({
            beforeRestore: () => order.push('unwind') > 0,
            embodiment   : {getWindowId: () => 'win-vessel', isStaged: () => true, restore: () => order.push('restore') > 0},
            sourceOwns   : () => true
        }), {itemId: 'a', windowName: 'vessel-a'})).toBe(true);

        expect(order).toEqual(['unwind', 'restore'])
    });

    test('a close arriving mid-decision addresses the connecting window', async () => {
        const calls = installClose();

        WindowManager.register({id: 'win-connecting', nativeRoute: {...CLOSE_ROUTE, targetWindowId: 'win-connecting'}});

        expect(await NativeVesselTransaction.closeVessel(
            descriptorFor({admission: {connectingWindowId: 'win-connecting', windowId: null}}),
            {itemId: 'a', windowName: 'vessel-a'}
        )).toBe(true);

        expect(calls).toEqual([{data: {nativeHandleKey: 'handle-close', targetWindowId: 'win-connecting', windowId: 'win-owner'}, name: 'native'}])
    });

    test('resolveVessel: a connection outranks the recorded owner, and an entry without a window is no vessel', () => {
        const
            // Entries exist only under the registration `s`, so a resolver reading any other key finds nothing.
            nativeWindows = {
                getConnection: (sourceId, itemId) => sourceId === 's' && itemId === 'live' ? {windowId: 'win-live'} : null,
                getOwner     : (sourceId, itemId) => sourceId === 's' ? {windowId: itemId === 'owned' ? 'win-owned' : null, windowName: 'owned-name'} : null
            },
            resolve       = (itemId, sourceId='s') => NativeVesselTransaction.resolveVessel({nativeWindows, sourceId, windowNameFor: id => `vessel-${id}`}, itemId);

        expect(resolve('live')).toMatchObject({itemId: 'live', nativeRoute: null, windowId: 'win-live', windowName: 'vessel-live'});
        expect(resolve('live', 'another-source'), 'an entry belongs to its own registration').toBeNull();
        expect(resolve('owned')).toMatchObject({itemId: 'owned', windowId: 'win-owned', windowName: 'owned-name'});
        expect(resolve('pending'), 'no window, no vessel').toBeNull()
    });
});
