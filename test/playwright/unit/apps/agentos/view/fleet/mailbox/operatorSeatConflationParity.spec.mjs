import {setup} from '../../../../../../setup.mjs';

setup({
    appConfig: {
        name: 'AgentOSOperatorSeatConflationParityTest'
    }
});

// The full setup() chain — not just Neo/core — MUST precede the FleetCockpit import: its
// transitive graph reaches DOM-typed core modules (util.Rectangle extends DOMRect), so a bare
// import only booted when ANOTHER spec in the same worker had installed the environment first —
// worker-scheduling luck, twice now (first the Neo namespace, then the DOM globals).
import {expect, test}                   from '@playwright/test';
import Neo                              from '../../../../../../../../src/Neo.mjs';
import * as core                        from '../../../../../../../../src/core/_export.mjs';
import {describeOperatorSeatConflation} from '../../../../../../../../ai/services/fleet/operatorSeatConflation.mjs';
import FleetCockpit                     from '../../../../../../../../apps/agentos/view/fleet/cockpit/Container.mjs';

/**
 * @summary The parity pin for a DELIBERATE cross-boundary duplication: the seat-conflation
 * decision exists twice by design — the pure leaf in `ai/services/fleet` (the fleet entry's boot
 * consumer) and `FleetCockpit#deriveOperatorIdentityPosture` (the pane consumer) — because an
 * app→Brain runtime import would cost more than three duplicated lines (the parity-twin
 * philosophy). A duplication defended by a comment decays the first time someone edits one side;
 * THIS table is what converts the architectural bet into an enforced one. A cross-boundary import
 * in a TEST is not a runtime coupling — it is the standard pin for a deliberate twin.
 *
 * One shared fixture drives BOTH implementations; a divergence fails here instead of surviving
 * until an incident notices. Every row names the case the form-insensitive canonicalization
 * exists to handle — including the bare-form viewer, deletable from either side without any
 * single-sided spec noticing (the reviewed decay path, now closed).
 */
test.describe('operatorSeatConflation — cross-boundary parity pin (leaf ↔ cockpit twin)', () => {
    const REGISTERED = ['@neo-fable-clio', '@neo-opus-vega', 'neo-opus-ada'];

    /**
     * The ONE shared truth table. `expected: null` asserts the null-not-clean contract on both
     * sides; the others assert the decision AND the canonical seat identity.
     */
    const TABLE = [
        {label: '@-form viewer vs @-form registered',   viewer: '@neo-fable-clio', expected: {conflated: true,  seatIdentity: '@neo-fable-clio'}},
        {label: 'bare viewer vs @-form registered',     viewer: 'neo-fable-clio',  expected: {conflated: true,  seatIdentity: '@neo-fable-clio'}},
        {label: '@-form viewer vs bare registered',     viewer: '@neo-opus-ada',   expected: {conflated: true,  seatIdentity: '@neo-opus-ada'}},
        {label: 'bare viewer vs bare registered',       viewer: 'neo-opus-ada',    expected: {conflated: true,  seatIdentity: '@neo-opus-ada'}},
        {label: 'clean operator viewer',                viewer: '@tobiu',          expected: {conflated: false, seatIdentity: '@tobiu'}},
        {label: 'prefix is not a match',                viewer: '@neo-fable',      expected: {conflated: false, seatIdentity: '@neo-fable'}},
        {label: 'case is not forgiven',                 viewer: '@NEO-FABLE-CLIO', expected: {conflated: false, seatIdentity: '@NEO-FABLE-CLIO'}},
        {label: 'blank viewer cannot be judged',        viewer: '   ',             expected: null},
        {label: 'missing viewer cannot be judged',      viewer: null,              expected: null}
    ];

    const
        leafDecision    = viewer => describeOperatorSeatConflation({viewerIdentity: viewer, registeredIds: REGISTERED}),
        cockpitDecision = viewer => FleetCockpit.prototype.deriveOperatorIdentityPosture.call(
            {resolveFleetRosterStore: () => ({items: REGISTERED.map(id => ({agentId: String(id).replace(/^@/, '')}))})},
            viewer
        );

    for (const {label, viewer, expected} of TABLE) {
        test(`both twins agree: ${label}`, () => {
            expect(leafDecision(viewer), 'leaf').toEqual(expected);
            expect(cockpitDecision(viewer), 'cockpit twin').toEqual(expected)
        })
    }

    test('the empty-list null contract holds on both sides — absence of truth is not a clean bill', () => {
        expect(describeOperatorSeatConflation({viewerIdentity: '@tobiu', registeredIds: []})).toBeNull();
        expect(FleetCockpit.prototype.deriveOperatorIdentityPosture.call(
            {resolveFleetRosterStore: () => ({items: []})},
            '@tobiu'
        )).toBeNull()
    })
});
