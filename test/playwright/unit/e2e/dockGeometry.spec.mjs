import {test, expect}               from '@playwright/test';
import {assertPreviewZoneAlignment} from '../../e2e/utils/dockGeometry.mjs';

/**
 * The preview/zone oracle, tested as the instrument it is.
 *
 * `assertPreviewZoneAlignment` used to assert a band thickness for edge placements. That is
 * affordance policy — `Preview#resultRegionPreviews` paints the region the pane would occupy, its
 * predecessor painted a fixed insertion band — and when the default moved to region mode the
 * budget stayed behind, so the five-beat journey reported a red that named no defect. The repair
 * drops the thickness and keeps the relationships that hold under EITHER language.
 *
 * A weakening and a repair look identical from the outside, so every relationship the helper still
 * claims gets a mutation that must make it throw. Without those, "the demo spec is green again"
 * would be indistinguishable from "the oracle stopped looking".
 *
 * @see https://github.com/neomjs/neo/issues/18082
 */

const ZONE = {left: 100, top: 200, right: 500, bottom: 500, width: 400, height: 300},
      // the affordance's own key; the helper never reads it, it reads the painted rect
      appFor = zone => ({getDomRect: async ids => Object.fromEntries(ids.map(id => [id, zone]))}),
      app    = appFor(ZONE),

      assert = (previewRect, kind) => assertPreviewZoneAlignment(app, {kind, previewRect, zoneId: 'zone'});

/** A rect from left/top/width/height, carrying the right/bottom the helper reads. */
const rect = (left, top, width, height) => ({left, top, width, height, right: left + width, bottom: top + height});

test.describe('assertPreviewZoneAlignment — the edge placement oracle', () => {
    test.describe('accepts both preview languages, because thickness is not its contract', () => {
        test('region mode: half the zone, hugging the named edge', async () => {
            // what `resultRegionPreviews: true` paints today
            await assert(rect(100, 200, 400, 150), 'edge-top');
            await assert(rect(100, 350, 400, 150), 'edge-bottom');
            await assert(rect(100, 200, 200, 300), 'edge-left');
            await assert(rect(300, 200, 200, 300), 'edge-right')
        });

        test('line mode: a 24px insertion band, hugging the named edge', async () => {
            // what the predecessor painted — the helper must not have become region-only
            await assert(rect(100, 200, 400, 24), 'edge-top');
            await assert(rect(100, 476, 400, 24), 'edge-bottom');
            await assert(rect(100, 200, 24, 300), 'edge-left');
            await assert(rect(476, 200, 24, 300), 'edge-right')
        });

        test('tab-into still equals the whole zone', async () => {
            await assert(rect(100, 200, 400, 300), 'tab-into')
        })
    });

    test.describe('mutations — each relationship it still claims must fail when broken', () => {
        test('a placement that extends past its zone', async () => {
            await expect(assert(rect(100, 200, 400, 340), 'edge-top')).rejects.toThrow()
        });

        test('a placement that floats free of the named edge', async () => {
            // right size, right span, but 40px below the zone's top
            await expect(assert(rect(100, 240, 400, 150), 'edge-top')).rejects.toThrow()
        });

        test('a placement that does not span the zone across the edge', async () => {
            // half-width band on a top edge: an edge placement never paints less than the span
            await expect(assert(rect(100, 200, 200, 150), 'edge-top')).rejects.toThrow()
        });

        test('a placement collapsed to nothing', async () => {
            await expect(assert(rect(100, 200, 400, 0), 'edge-top')).rejects.toThrow()
        });

        test('a placement that has grown to cover its whole zone', async () => {
            // indistinguishable from `tab-into` — the failure the removed budget used to catch
            await expect(assert(rect(100, 200, 400, 300), 'edge-top')).rejects.toThrow()
        });

        test('a tab-into that is not the whole zone', async () => {
            await expect(assert(rect(100, 200, 400, 150), 'tab-into')).rejects.toThrow()
        })
    })
});
