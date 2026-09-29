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
import Operations              from '../../../../src/dashboard/dock/model/Operations.mjs';
import WorkspaceDocument       from '../../../../src/dashboard/dock/model/WorkspaceDocument.mjs';
import WorkspaceSet            from '../../../../src/dashboard/dock/window/WorkspaceSet.mjs';
import Rectangle               from '../../../../src/util/Rectangle.mjs';
import TransactionManager      from '../../../../src/manager/Transaction.mjs';
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
 * focused would be asking for the z-order a real drag never grants.
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

    test('a vessel without an outer frame that owes no resize is refused, not cleared against its inner rect', async () => {
        const receipts = {};

        restore  = stubRoutes({focus: true, position: true, resize: true});
        platform = installPlatform();

        WindowManager.unregister('win-source');
        WindowManager.register({id: 'win-source', innerRect: new Rectangle(40, 60, 480, 320), nativeRoute: ROUTE});

        const parked = await NativeVesselTransaction
            .effectsFor(descriptorFor({receipts}))
            .parkVessel({itemId: 'item-1', windowName: 'vessel-1'});

        expect(parked).toBe(false);
        expect(receipts.park.refusedAt).toBe('screen');
        expect(platform.calls, 'nothing moves').toEqual([])
    });

    test('an inner-plane park that owes a resize clears the frame the outer-plane resize applies', async () => {
        const
            receipts = {},
            resizes  = [];

        restore  = stubRoutes({focus: true, position: true, resize: true});
        platform = installPlatform();

        // Real chrome: each window's content sits 68 px below its frame
        WindowManager.unregister('win-source');
        WindowManager.unregister('win-target');
        WindowManager.register({id: 'win-source', innerRect: new Rectangle(40, 128, 480, 252), outerRect: new Rectangle(40, 60, 480, 320), nativeRoute: ROUTE});
        WindowManager.register({id: 'win-target', innerRect: new Rectangle(0, 68, 800, 532),   outerRect: new Rectangle(0, 0, 800, 600),   nativeRoute: TARGET_ROUTE});

        Neo.Main.windowNativeResizeTo = ({height, width}) => {
            resizes.push({height, width});
            return Promise.resolve(true)
        };

        await NativeVesselTransaction
            .effectsFor(descriptorFor({geometry: {height: 320, width: 480}, receipts}))
            .parkVessel({itemId: 'item-1', windowName: 'vessel-1'});

        expect(resizes, 'the inner-plane shrink, applied as the outer size').toEqual([{height: 252, width: 480}]);
        // the corner farthest from the target that holds a 480x252 frame, the one the resize produces
        expect(receipts.park.requested).toEqual({x: 1120, y: 748});
        expect(receipts.park.cleared).toBe(true)
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
 * Where the park puts the vessel so it covers none of the target. Every arm is a real frame on a
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

    test('a frame larger than the work area is refused before placement: no corner holds it whole', () => {
        const screen = {availHeight: 800, availLeft: 0, availTop: 0, availWidth: 1000}, target = {height: 300, width: 400, x: 0, y: 0};

        expect(park({height: 300, width: 1200}, screen, target), 'wider').toBeNull();
        expect(park({height: 900, width: 400},  screen, target), 'taller').toBeNull();
        expect(park({height: 800, width: 1000}, screen, target), 'exactly the work area still fits').toEqual({cleared: false, x: 0, y: 0})
    });

    test('a target without extent is refused: nothing can be cleared of it', () => {
        const screen = {availHeight: 900, availLeft: 0, availTop: 0, availWidth: 1440}, frame = {height: 300, width: 400};

        expect(park(frame, screen, {height: 0, width: 800, x: 0, y: 0})).toBeNull();
        expect(park(frame, screen, {height: 600, width: -1, x: 0, y: 0})).toBeNull()
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

/** @summary Exercises all-pane native release and replay with an independent document host. */
test.describe('Neo.dashboard.dock.window.NativeVesselTransaction workspace returns', () => {
    const SOURCE = 'catalog-detached', TARGET = 'catalog-landing', FLOATING = 'surface-floating', LANDING = 'surface-landing';
    let host, previousMain, previousLease, previousLogError;

    test.beforeEach(() => {
        Neo.Main ??= {};
        previousMain = Object.fromEntries(['windowNativeIsClosed', 'windowOpen', 'clearTopologyIdentity', 'closeTopologyWindow']
            .map(key => [key, Neo.Main[key]]));
        previousLease = TransactionManager.reconnectLeaseMs;
        previousLogError = Neo.logError
    });

    test.afterEach(() => {
        if (host) {
            TransactionManager.un({...host.listeners, scope: host});
            TransactionManager.retireGroup(host.groupId);
            host.set.destroy()
        }
        Object.assign(Neo.Main, previousMain);
        TransactionManager.reconnectLeaseMs = previousLease;
        Neo.logError = previousLogError;
        host = null
    });

    /** @summary Creates a valid document with a structural root that survives all panes leaving. @param {String[]} itemIds @returns {Object} */
    const dockDocument = itemIds => ({
        schema: WorkspaceDocument.SCHEMA, root: 'shell',
        items : Object.fromEntries(itemIds.map(itemId => [itemId, {reference: itemId, title: itemId}])),
        nodes : {shell: {type: 'edge-zone', zones: itemIds.length ? {center: {nodeId: 'tabs'}} : {}},
            ...(itemIds.length ? {tabs: {type: 'tabs', items: [...itemIds], activeItemId: itemIds[0]}} : {})}
    });

    /**
     * @summary Registers ordinary Dock document owners and runtime native seams in a real Group.
     * @param {Object} [options={}] Close policy, native binding and real lease duration.
     * @returns {Object} The independent host and its controlled platform answers.
     */
    const createHost = ({policy = 'return', bound = true, leaseMs} = {}) => {
        if (leaseMs !== undefined) TransactionManager.reconnectLeaseMs = leaseMs;
        const identity = TransactionManager.bind({workspaceKey: LANDING, windowId: 'native-return-landing'}),
              groupId  = identity.groupId;
        TransactionManager.setHistoryDepth({groupId, depth: 8});
        const set            = Neo.create(WorkspaceSet, {manager: TransactionManager, documentModel: WorkspaceDocument, getGroupId: () => groupId}),
              reservation    = TransactionManager.reserve({groupId, workspaceKey: FLOATING}),
              sourceIdentity = bound ? TransactionManager.bind({...reservation, windowId: 'native-return-floating'}) : reservation;
        host = {
            id     : 'independent-dock-document-owner', groupId, set, sourceIdentity, policy,
            calls  : [], returned: [], effects: [], logs: [],
            answers: {observe: true, open: false, clear: true, close: true},
            source : {document: dockDocument(['pane-last', 'pane-first']), windowId: bound ? 'native-return-floating' : null},
            target : {document: dockDocument(['anchor']), windowId: 'native-return-landing'}
        };
        const dispatch = async (name, data) => {
            host.calls.push({name, data});
            const answer = host.answers[name];
            return typeof answer === 'function' ? answer(data) : answer
        };
        Neo.Main.windowNativeIsClosed = data => dispatch('observe', data);
        Neo.Main.windowOpen = data => dispatch('open', data);
        Neo.Main.clearTopologyIdentity = data => dispatch('clear', data);
        Neo.Main.closeTopologyWindow = data => dispatch('close', data);
        Neo.logError = error => host.logs.push(error.message);

        host.listeners = {
            release      : data => { if (data.groupId === groupId && data.workspaceKey === FLOATING) host.releaseData = data },
            leaseExpired : data => { if (data.groupId === groupId && data.workspaceKey === FLOATING) host.expiryData = data },
            effectReceipt: data => { if (data.groupId === groupId) host.effects.push(data.receipt) }
        };
        TransactionManager.on({...host.listeners, scope: host});
        const nativeWindows = TransactionManager.getNativeLifecycle(groupId), descriptor = {workspaceSet: set, nativeWindows};
        host.nativeWindows = nativeWindows;
        host.descriptor = descriptor;
        nativeWindows.registerSource('independent-dock-owner', {
            keyFor        : () => FLOATING, open: async () => null, close: async () => true,
            unbind        : data => NativeVesselTransaction.releaseWorkspace(descriptor, data),
            bindingExpired: data => NativeVesselTransaction.releaseWorkspace(descriptor, {...data, expired: true})
        });
        const nativeSeams = state => ({
            policy       : () => state === host.source ? host.policy : null,
            returnTarget : () => LANDING,
            windowId     : () => state.windowId,
            ownerWindowId: () => host.target.windowId,
            route        : () => ({nativeHandleKey: 'independent-native-handle', ownerWindowId: host.target.windowId}),
            placements   : () => ({'pane-first': {tabsNodeId: 'tabs', index: 1}, 'pane-last': {tabsNodeId: 'tabs', index: 2}}),
            openConfig   : () => ({url: '/independent-dock', name: 'independent-floating'}),
            detach       : () => { host.calls.push({name: 'detach'}); state.windowId = null },
            returned     : receipt => {
                host.returned.push(receipt);
                if (host.throwReturned) throw new Error('return projection refused')
            }
        });
        for (const [key, state, bindingKey] of [[SOURCE, host.source, FLOATING], [TARGET, host.target, LANDING]]) {
            state.seams = {
                bindingKey, getDocument: () => state.document, setDocument: document => state.document = document,
                resolveReturnDescriptor: Operations.appendingReturnDescriptor,
                nativeWindow           : nativeSeams(state),
                project                : context => NativeVesselTransaction.replayWorkspaceReturn(set, key, context, () => {
                    host.calls.push({name: 'project', key, cursorAction: context.cursorAction});
                    return true
                })
            };
            expect(set.register(key, state.seams)).toBe(true)
        }
        host.release = () => {
            const binding = TransactionManager.get(groupId).bindings.get(FLOATING);
            expect(TransactionManager.release(host.source.windowId)).toBe(true);
            return binding.releaseWork ?? NativeVesselTransaction.releaseWorkspace(descriptor, host.releaseData)
        };
        host.rebind = (identity = host.sourceIdentity, windowId = 'native-return-successor') => {
            const result = TransactionManager.bind({...identity, windowId});
            host.source.windowId = result.windowId;
            return result
        };
        return host
    };

    test('a confirmed close returns every pane in one ordered undoable row', async () => {
        const owner  = createHost(), sourceBefore = WorkspaceDocument.clone(owner.source.document);
        const result = await owner.release();
        expect(result).toMatchObject({retained: true, awaitingClosure: false,
            receipt: {returned: true, workspaceId: SOURCE, itemIds: ['pane-first', 'pane-last']}});
        expect(owner.source.document.items).toEqual({});
        expect(owner.target.document.nodes.tabs.items).toEqual(['anchor', 'pane-first', 'pane-last']);
        const history = TransactionManager.get(owner.groupId).history;
        expect(history.count).toBe(1);
        expect(history.current).toMatchObject({operation: 'returnPopupWorkspace', workspaceId: SOURCE,
            targetWorkspaceId: TARGET, cause: 'popup-close'});
        expect(history.current.participants.find(entry => entry.workspaceKey === SOURCE).before).toEqual(sourceBefore);
        expect(owner.calls.filter(call => call.name === 'observe')).toEqual([{name: 'observe',
            data: {nativeHandleKey: 'independent-native-handle', windowId: 'native-return-landing'}}]);
        expect(owner.returned).toHaveLength(1)
    });

    test('retain detaches the render target while preserving both documents and history', async () => {
        const owner        = createHost({policy: 'retain'}), sourceBefore = WorkspaceDocument.clone(owner.source.document),
              targetBefore = WorkspaceDocument.clone(owner.target.document);
        expect(await owner.release()).toEqual({retained: true, awaitingClosure: false});
        expect(owner.source.windowId).toBeNull();
        expect(owner.source.document).toEqual(sourceBefore);
        expect(owner.target.document).toEqual(targetBefore);
        expect(owner.calls.filter(call => call.name === 'observe')).toEqual([]);
        expect(TransactionManager.get(owner.groupId).history).toBeNull()
    });

    test('unknown native closure waits for its exact formerly-bound lease expiry', async () => {
        const owner = createHost({leaseMs: 0});
        owner.answers.observe = null;
        expect(await owner.release()).toEqual({retained: true, awaitingClosure: true});
        expect(TransactionManager.get(owner.groupId).history).toBeNull();
        expect(Object.keys(owner.source.document.items)).toHaveLength(2);
        const stale = {...owner.releaseData, generationToken: 'foreign-lineage', expired: true};
        expect(await NativeVesselTransaction.releaseWorkspace(owner.descriptor, stale)).toBe(false);
        await expect.poll(() => owner.returned.length).toBe(1);
        expect(owner.expiryData.releasedBinding).toBe(owner.releaseData.releasedBinding);
        expect(owner.source.document.items).toEqual({});
        expect(TransactionManager.get(owner.groupId).history.current.cause).toBe('popup-reconnect-expired');
        expect(owner.calls.filter(call => call.name === 'observe')).toHaveLength(1)
    });

    test('expiry during deferred closure observation recovers once through the original pending latch', async () => {
        const owner = createHost({leaseMs: 0});
        let resolveObservation;
        owner.answers.observe = new Promise(resolve => resolveObservation = resolve);
        const pending = owner.release();
        await expect.poll(() => Boolean(owner.expiryData)).toBe(true);
        expect(owner.expiryData.releasedBinding.releaseWork).toBe(pending);
        expect(TransactionManager.get(owner.groupId).history).toBeNull();
        resolveObservation(null);
        expect((await pending).receipt.returned).toBe(true);
        expect(owner.returned).toHaveLength(1);
        expect(owner.source.document.items).toEqual({});
        expect(TransactionManager.get(owner.groupId).history.current.cause).toBe('popup-reconnect-expired')
    });

    test('a warm rebind during deferred closure observation preserves its semantic owner', async () => {
        const owner = createHost();
        let resolveObservation;
        owner.answers.observe = new Promise(resolve => resolveObservation = resolve);
        const pending = owner.release();
        await expect.poll(() => owner.calls.some(call => call.name === 'observe')).toBe(true);
        owner.rebind();
        resolveObservation(true);
        expect(await pending).toBe(false);
        expect(owner.source.windowId).toBe('native-return-successor');
        expect(Object.keys(owner.source.document.items)).toHaveLength(2);
        expect(owner.target.document.nodes.tabs.items).toEqual(['anchor']);
        expect(owner.returned).toEqual([]);
        expect(TransactionManager.get(owner.groupId).history).toBeNull()
    });

    test('duplicate release shares observation and the entire queued semantic write', async () => {
        const owner = createHost(), target = owner.set.getParticipant(TARGET), prepare = target.prepare;
        let enterQueue, releaseQueue, resolveObservation;
        const queueStarted = new Promise(resolve => enterQueue = resolve), queueGate = new Promise(resolve => releaseQueue = resolve);
        target.prepare = async (...args) => { const value = prepare(...args); enterQueue(); await queueGate; return value };
        const queued = owner.set.commit(TARGET, [{operation: 'setItemLocked', itemId: 'anchor', locked: true}]);
        await queueStarted;
        owner.answers.observe = new Promise(resolve => resolveObservation = resolve);
        const pending = owner.release(), duplicate = NativeVesselTransaction.releaseWorkspace(owner.descriptor, owner.releaseData);
        expect(duplicate).toBe(pending);
        await expect.poll(() => owner.calls.some(call => call.name === 'observe')).toBe(true);
        const originalReturn = owner.set.returnWorkspace;
        let   returnQueued   = false;
        owner.set.returnWorkspace = (...args) => { returnQueued = true; return originalReturn.apply(owner.set, args) };
        resolveObservation(true);
        await expect.poll(() => returnQueued).toBe(true);
        expect(owner.releaseData.releasedBinding.releaseWork).toBe(pending);
        expect(NativeVesselTransaction.releaseWorkspace(owner.descriptor, owner.releaseData)).toBe(pending);
        expect(owner.calls.filter(call => call.name === 'observe')).toHaveLength(1);
        expect(owner.calls.filter(call => call.name === 'detach')).toHaveLength(1);
        expect(TransactionManager.get(owner.groupId).history).toBeNull();
        releaseQueue();
        await queued;
        expect((await pending).receipt.returned).toBe(true);
        expect(owner.source.document.items).toEqual({});
        expect(owner.target.document.items.anchor.locked).toBe(true);
        expect(TransactionManager.get(owner.groupId).history.count).toBe(2);
        expect(TransactionManager.get(owner.groupId).history.rows.filter(row => row.operation === 'returnPopupWorkspace')).toHaveLength(1);
        expect(owner.returned).toHaveLength(1)
    });

    test('a never-bound reservation expiry cannot return its registered documents', async () => {
        const owner = createHost({bound: false, leaseMs: 0});
        await expect.poll(() => Boolean(owner.expiryData)).toBe(true);
        expect(owner.expiryData.generation).toBe(0);
        expect(await NativeVesselTransaction.releaseWorkspace(owner.descriptor, {...owner.expiryData, expired: true}))
            .toEqual({retained: true, awaitingClosure: false});
        expect(Object.keys(owner.source.document.items)).toHaveLength(2);
        expect(owner.target.document.nodes.tabs.items).toEqual(['anchor']);
        expect(owner.returned).toEqual([]);
        expect(owner.calls.filter(call => call.name === 'observe')).toEqual([]);
        expect(TransactionManager.get(owner.groupId).history).toBeNull()
    });

    for (const refusal of ['target', 'reducer']) {
        test(`a confirmed close with ${refusal} refusal preserves both documents`, async () => {
            const owner        = createHost(), sourceBefore = WorkspaceDocument.clone(owner.source.document),
                  targetBefore = WorkspaceDocument.clone(owner.target.document);
            if (refusal === 'target') owner.set.unregister(TARGET);
            else owner.set.register(TARGET, {...owner.target.seams,
                resolveReturnDescriptor: () => ({operation: 'addTab', tabsNodeId: 'missing'})});
            expect(await owner.release()).toMatchObject({retained: true, awaitingClosure: true});
            expect(owner.returned[0]).toMatchObject({returned: false, workspaceId: SOURCE});
            expect(owner.source.document).toEqual(sourceBefore);
            expect(owner.target.document).toEqual(targetBefore);
            expect(TransactionManager.get(owner.groupId).history).toBeNull()
        })
    }

    test('a throwing return projection cannot rewrite a committed semantic success', async () => {
        const owner = createHost();
        owner.throwReturned = true;
        expect((await owner.release()).receipt.returned).toBe(true);
        expect(owner.source.document.items).toEqual({});
        expect(owner.returned.map(receipt => receipt.returned)).toEqual([true]);
        expect(owner.logs).toEqual(['return projection refused']);
        expect(TransactionManager.get(owner.groupId).history.count).toBe(1)
    });

    test('undo native-open refusal remains separate from restored documents and the Group cursor', async () => {
        const owner        = createHost(), sourceBefore = WorkspaceDocument.clone(owner.source.document),
              targetBefore = WorkspaceDocument.clone(owner.target.document);
        await owner.release();
        owner.calls.length = 0;
        const result = await TransactionManager.undo({groupId: owner.groupId});
        await expect.poll(() => owner.effects.length).toBe(1);
        expect(owner.source.document).toEqual(sourceBefore);
        expect(owner.target.document).toEqual(targetBefore);
        expect(TransactionManager.get(owner.groupId).history.cursor).toBe(-1);
        expect(TransactionManager.get(owner.groupId).history.count).toBe(1);
        expect(owner.effects[0]).toMatchObject({kind: 'native', id: SOURCE, transactionId: result.transactionId,
            observation: {opened: false}, error: null});
        expect(owner.calls.filter(call => call.name === 'open')).toHaveLength(1);
        expect(owner.calls.findIndex(call => call.name === 'open')).toBeLessThan(
            owner.calls.findIndex(call => call.name === 'project' && call.key === SOURCE));
        expect(TransactionManager.getBinding(owner.groupId, FLOATING)).toBeNull()
    });

    for (const refusal of [null, 'clear', 'close']) {
        test(`redo ${refusal ? `${refusal} refusal` : 'acknowledged close'} leaves returned documents and its committed cursor intact`, async () => {
            const owner = createHost();
            await owner.release();
            owner.answers.open = data => { owner.rebind(data.topologyIdentity, 'native-return-reopened'); return true };
            await TransactionManager.undo({groupId: owner.groupId});
            await expect.poll(() => owner.effects.length).toBe(1);
            expect(owner.effects[0].observation.opened).toBe(true);
            if (refusal) owner.answers[refusal] = false;
            owner.calls.length = 0;
            const result = await TransactionManager.redo({groupId: owner.groupId});
            await expect.poll(() => owner.effects.length).toBe(2);
            expect(owner.source.document.items).toEqual({});
            expect(owner.target.document.nodes.tabs.items).toEqual(['anchor', 'pane-first', 'pane-last']);
            expect(TransactionManager.get(owner.groupId).history.cursor).toBe(0);
            expect(TransactionManager.get(owner.groupId).history.count).toBe(1);
            expect(owner.effects[1]).toMatchObject({kind: 'native', id: SOURCE, transactionId: result.transactionId,
                observation: {closed: !refusal}, error: null});
            expect(owner.calls.filter(call => call.name === 'clear')).toHaveLength(1);
            expect(owner.calls.filter(call => call.name === 'close')).toHaveLength(refusal === 'clear' ? 0 : 1);
            expect(owner.calls.findIndex(call => call.name === 'project' && call.key === SOURCE)).toBeLessThan(
                owner.calls.findIndex(call => call.name === 'clear'))
        })
    }

    test('redo revalidates a successor that binds while identity clearing is deferred', async () => {
        const owner = createHost();
        await owner.release();
        owner.answers.open = data => { owner.rebind(data.topologyIdentity, 'native-return-reopened'); return true };
        await TransactionManager.undo({groupId: owner.groupId});
        await expect.poll(() => owner.effects.length).toBe(1);
        let resolveClear;
        owner.answers.clear = new Promise(resolve => resolveClear = resolve);
        const result = await TransactionManager.redo({groupId: owner.groupId});
        await expect.poll(() => owner.calls.some(call => call.name === 'clear')).toBe(true);
        expect(TransactionManager.release(owner.source.windowId)).toBe(true);
        const successor = TransactionManager.reserve({groupId: owner.groupId, workspaceKey: FLOATING});
        owner.rebind(successor, 'native-return-new-lineage');
        resolveClear(true);
        await expect.poll(() => owner.effects.length).toBe(2);
        expect(owner.calls.filter(call => call.name === 'close')).toEqual([]);
        expect(owner.effects[1]).toMatchObject({transactionId: result.transactionId, observation: {closed: false}});
        expect(owner.source.windowId).toBe('native-return-new-lineage');
        expect(owner.source.document.items).toEqual({});
        expect(TransactionManager.get(owner.groupId).history.cursor).toBe(0)
    });
});
