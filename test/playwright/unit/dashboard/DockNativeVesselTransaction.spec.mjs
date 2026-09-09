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

const ROUTE = {nativeHandleKey: 'handle-1', targetWindowId: 'win-source'};

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
    let restore = null;

    test.afterEach(() => {
        restore && (WindowManager.resolveNativeRoute = restore);
        restore = null
    });

    test('the authority block is the fixed ten keys, in order, whatever the obligation', () => {
        const receipts = {};

        restore = stubRoutes({focus: true, position: true, resize: false});

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

        restore = stubRoutes({focus: true, position: true, resize: false});

        const admitted = await NativeVesselTransaction
            .effectsFor(descriptorFor({geometry: null, receipts}))
            .parkVessel({itemId: 'item-1', windowName: 'vessel-1'});

        expect(admitted, 'no declared geometry restore ⇒ resize is not a prerequisite').toBe(true);
        expect(receipts.park.owesResize, 'the obligation is recorded, not inferred').toBe(false)
    });

    test('a geometry-restoring park REFUSES the same route', async () => {
        const receipts = {};

        restore = stubRoutes({focus: true, position: true, resize: false});

        const admitted = await NativeVesselTransaction
            .effectsFor(descriptorFor({geometry: {height: 200, width: 300}, receipts}))
            .parkVessel({itemId: 'item-1', windowName: 'vessel-1'});

        expect(admitted, 'a promised extent restore makes resize a prerequisite at park').toBe(false);
        expect(receipts.park.owesResize).toBe(true)
    });

    test('the park clears any prior restore receipt, so a stale one cannot read as this gesture', async () => {
        const receipts = {restore: {stale: true}};

        restore = stubRoutes({focus: true, position: true, resize: true});

        await NativeVesselTransaction
            .effectsFor(descriptorFor({receipts}))
            .parkVessel({itemId: 'item-1', windowName: 'vessel-1'});

        expect(receipts.restore).toBeNull()
    });

    test('the re-show converts a content rect to the frame origin moveTo consumes', async () => {
        const receipts = {};

        restore = stubRoutes({focus: true, position: true, resize: true});

        WindowManager.register?.({id: 'win-source'});

        const effects = NativeVesselTransaction.effectsFor(descriptorFor({receipts}));

        await effects.reshowVessel({itemId: 'item-1', rect: {x: 400, y: 300}, windowName: 'vessel-1'});

        // With no published chrome the offset is zero and the origin passes through unchanged —
        // the pre-chrome behaviour, asserted so the conversion cannot silently become mandatory.
        expect(receipts.restore.frame, 'no chrome published ⇒ content origin is the frame origin')
            .toEqual({x: 400, y: 300})
    });

    test('a re-show with no finite origin refuses before dispatching', async () => {
        const receipts = {};

        restore = stubRoutes({focus: true, position: true, resize: true});

        const admitted = await NativeVesselTransaction
            .effectsFor(descriptorFor({receipts}))
            .reshowVessel({itemId: 'item-1', rect: null, windowName: 'vessel-1'});

        expect(admitted, 'no origin is a refusal, never a move to NaN').toBe(false);
        expect(receipts.restore.frame).toBeNull()
    });

    test('a windowName mismatch refuses the re-show even with every route granted', async () => {
        const receipts = {};

        restore = stubRoutes({focus: true, position: true, resize: true});

        const admitted = await NativeVesselTransaction
            .effectsFor(descriptorFor({receipts}))
            .reshowVessel({itemId: 'item-1', rect: {x: 10, y: 20}, windowName: 'a-different-vessel'});

        expect(admitted).toBe(false)
    });
});
