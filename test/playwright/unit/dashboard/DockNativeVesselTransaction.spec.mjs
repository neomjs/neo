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
    TARGET_ROUTE = {nativeHandleKey: 'handle-target', targetWindowId: 'win-target'};

/**
 * @summary Registers the two windows the choreography measures, and doubles every platform call.
 *
 * The park effect DISPATCHES — focus, optional resize, park-move, refocus, compensate — so a
 * descriptor alone cannot exercise it. `calls` records the order, which is the contract that
 * matters: a transaction that moved before it focused would leave the source visibly over the
 * target for a frame, and only an ordered witness can see that.
 * @param {Object} [outcomes={}] Per-call boolean results; anything omitted succeeds.
 * @returns {{calls:String[],restore:Function}}
 */
const installPlatform = (outcomes={}) => {
    Neo.Main       ??= {};
    Neo.main       ??= {};
    Neo.main.addon ??= {};

    const
        calls    = [],
        previous = {
            focus   : Neo.Main.windowNativeFocus,
            moveTo  : Neo.Main.windowNativeMoveTo,
            resizeTo: Neo.Main.windowNativeResizeTo,
            addon   : Neo.main?.addon?.DragDrop
        },
        answer   = (name, payload) => {
            calls.push(name);
            payload && calls.push(`${name}:${payload.x},${payload.y}`);
            return Promise.resolve(outcomes[name] !== false)
        };

    WindowManager.register({id: 'win-source', innerRect: new Rectangle(40, 60, 480, 320), outerRect: new Rectangle(40, 60, 480, 320), nativeRoute: ROUTE});
    WindowManager.register({id: 'win-target', innerRect: new Rectangle(0, 0, 800, 600),   outerRect: new Rectangle(0, 0, 800, 600),   nativeRoute: TARGET_ROUTE});

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

    test('the park focuses BEFORE it moves, and refocuses after', async () => {
        const receipts = {};

        restore  = stubRoutes({focus: true, position: true, resize: true});
        platform = installPlatform();

        const parked = await NativeVesselTransaction
            .effectsFor(descriptorFor({receipts}))
            .parkVessel({itemId: 'item-1', windowName: 'vessel-1'});

        expect(parked).toBe(true);
        // Order is the contract: a move before the focus leaves the source visibly over the target
        // for a frame, and no settled-state assertion can see that.
        expect(platform.calls.filter(call => !call.includes(':')))
            .toEqual(['focus', 'park', 'focus']);
        expect(receipts.park.parked).toBe(true);
        expect(receipts.park.requested, 'parks at the target origin').toEqual({x: 0, y: 0})
    });

    test('a geometry-restoring park resizes between the focus and the move', async () => {
        const receipts = {};

        restore  = stubRoutes({focus: true, position: true, resize: true});
        platform = installPlatform();

        await NativeVesselTransaction
            .effectsFor(descriptorFor({geometry: {height: 320, width: 480}, receipts}))
            .parkVessel({itemId: 'item-1', windowName: 'vessel-1'});

        expect(platform.calls.filter(call => !call.includes(':')))
            .toEqual(['focus', 'resize', 'park', 'focus']);
        expect(receipts.park.resized).toBe(true)
    });

    test('a refused refocus compensates the move and REFUSES the park', async () => {
        const receipts = {};

        restore  = stubRoutes({focus: true, position: true, resize: true});
        platform = installPlatform();

        // The first focus succeeds and the refocus does not: one call, two answers, so the double
        // flips after the move rather than refusing focus outright.
        let focusCalls = 0;
        Neo.Main.windowNativeFocus = () => {
            platform.calls.push('focus');
            return Promise.resolve(++focusCalls === 1)
        };

        const parked = await NativeVesselTransaction
            .effectsFor(descriptorFor({receipts}))
            .parkVessel({itemId: 'item-1', windowName: 'vessel-1'});

        expect(parked, 'a compensated move is a refusal — nothing is parked').toBe(false);
        expect(receipts.park.compensated).toBe(true);
        expect(receipts.park.parked).toBe(false);
        expect(receipts.park.refusedAt).toBe('refocus');
        // Compensation returns the source to where it started, not to the park origin.
        expect(platform.calls).toContain('resume:40,60')
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
        expect(platform.calls.filter(call => !call.includes(':')))
            .toEqual(['focus', 'resize', 'park', 'focus'])
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
