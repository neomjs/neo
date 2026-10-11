import {test, expect} from '@playwright/test';

/**
 * The reveal overlay's ORIGIN, measured on a rendered dock rather than on stylesheet text.
 *
 * `--dock-edge-rail-size` gives the rail's extent and the overlay's inset one shared VALUE. That is
 * only half of "the overlay starts exactly where the strip ends": the two readers also have to
 * measure from the same ORIGIN. The rail is laid out in normal flow, inside its ancestor's
 * content box; an absolutely positioned overlay resolves against the nearest positioned ancestor's
 * padding box. Leave the containing block to the dashboard host and a consumer that pads that host
 * pushes the rail inward while the overlay stays put — the overlay then covers the strip by exactly
 * the padding, and the rail's other tabs cannot be reached without dismissing first.
 *
 * **The padded arm is the regression; the unpadded arm is the control.** A gap of 0 on a padded
 * host only means the engine holds if an unpadded host also reports 0 in the same document —
 * otherwise a fixture whose stylesheet never applied reads as a pass. The padded arm additionally
 * asserts the padding is live before it measures anything, because the cheapest way for this test
 * to lie is for `addStyleTag` to have missed.
 *
 * @see https://github.com/neomjs/neo/issues/18070
 */

const EDGES = ['left', 'right', 'top', 'bottom'];

const HOST = '.dock-rail-origin-host';

/**
 * The signed distance from the rail's trailing edge to the overlay's leading edge, along the axis
 * the edge reserves. 0 means they touch; a negative value is the overlay lying over the strip.
 */
const gapFor = (edge, rail, overlay) => {
    if (edge === 'left')   return overlay.x - (rail.x + rail.width);
    if (edge === 'right')  return rail.x - (overlay.x + overlay.width);
    if (edge === 'top')    return overlay.y - (rail.y + rail.height);
    return rail.y - (overlay.y + overlay.height)
};

const measureEdge = async (page, edge) => {
    const railSel    = `.neo-dashboard-dock-edge-rail-${edge}`,
          overlaySel = `.neo-dashboard-dock-reveal-overlay-${edge}`;

    await page.locator(`${railSel} .neo-dashboard-dock-rail-tab`).first().click();
    await expect(page.locator(overlaySel)).toBeVisible({timeout: 10000});

    const boxes = await page.evaluate(async ({railSel, overlaySel}) => {
        const overlay = document.querySelector(overlaySel);

        // The reveal plays an entry animation (`neo-dock-reveal-from-<edge>`: a nudge along the
        // edge's axis plus an opacity ramp). Visibility flips when it STARTS, so a rect read here
        // samples the overlay in flight and lands several pixels off its committed position — a
        // geometry assertion that would fail or pass on timing alone.
        await Promise.all(overlay.getAnimations({subtree: true}).map(animation =>
            animation.finished.catch(() => {})
        ));

        const box = sel => {
            const r = document.querySelector(sel).getBoundingClientRect();
            return {x: r.x, y: r.y, width: r.width, height: r.height}
        };

        return {rail: box(railSel), overlay: box(overlaySel)}
    }, {railSel, overlaySel});

    // A zero-extent overlay would satisfy every containment assertion below for the wrong reason.
    expect(boxes.overlay.width,  `[${edge}] the reveal actually opened`).toBeGreaterThan(0);
    expect(boxes.overlay.height, `[${edge}] the reveal actually opened`).toBeGreaterThan(0);

    await page.keyboard.press('Escape');
    await expect(page.locator(overlaySel)).toBeHidden({timeout: 10000});

    return gapFor(edge, boxes.rail, boxes.overlay)
};

test.beforeEach(async ({page}) => {
    await page.goto('test/playwright/component/apps/dock-rail-origin/index.html');
    await page.waitForSelector('#dock-rail-origin-workspace', {state: 'attached'});

    for (const edge of EDGES) {
        await expect(page.locator(`.neo-dashboard-dock-edge-rail-${edge}`)).toBeVisible({timeout: 10000})
    }
});

test.describe('Neo.dashboard.dock.interaction.Rail — reveal overlay origin (#18070)', () => {
    test('an unpadded dock host: the overlay begins exactly where the strip ends, on every edge', async ({page}) => {
        const paddingLeft = await page.evaluate(sel => getComputedStyle(document.querySelector(sel)).paddingLeft, HOST);

        expect(paddingLeft, 'control precondition: this arm measures an UNPADDED host').toBe('0px');

        for (const edge of EDGES) {
            expect(await measureEdge(page, edge), `[${edge}] overlay touches the rail's trailing edge`)
                .toBeCloseTo(0, 1)
        }
    });

    test('a padded dock host does not move the overlay onto its own strip, on every edge', async ({page}) => {
        // Exactly what a consumer writes: an app stylesheet giving the dock host breathing room.
        await page.addStyleTag({content: `${HOST} { padding: 12px; }`});

        const paddingLeft = await page.evaluate(sel => getComputedStyle(document.querySelector(sel)).paddingLeft, HOST);

        // Without this the arm passes vacuously whenever the style tag fails to land.
        expect(paddingLeft, 'precondition: the consumer padding is live').toBe('12px');

        for (const edge of EDGES) {
            expect(await measureEdge(page, edge), `[${edge}] overlay touches the rail's trailing edge`)
                .toBeCloseTo(0, 1)
        }
    });

    test('the containing block moves to the edge zone without re-anchoring the drag layers', async ({page}) => {
        await page.addStyleTag({content: `${HOST} { padding: 12px; }`});

        const anchors = await page.evaluate(() => {
            const host = document.querySelector('.dock-rail-origin-host'),
                  zone = document.querySelector('.neo-dashboard-dock-edge-zone'),
                  name = el => el === host ? 'host' : el === zone ? 'edge-zone' : el?.className?.split(' ')[0] ?? null,
                  read = sel => {
                      const el = document.querySelector(sel);
                      return el ? {present: true, anchor: name(el.offsetParent), insideZone: zone.contains(el)} : {present: false}
                  };

            return {
                zonePosition  : getComputedStyle(zone).position,
                preview       : read('.neo-dock-preview'),
                dropIndicators: read('.neo-dashboard-dock-drop-indicators')
            }
        });

        expect(anchors.zonePosition, 'the edge zone is the overlay\'s containing block').toBe('relative');

        // The drag layers are siblings of the edge zone, so a positioned edge zone must not capture
        // them. If either ever moves inside the zone this assertion is the thing that says so.
        for (const [name, layer] of Object.entries({preview: anchors.preview, dropIndicators: anchors.dropIndicators})) {
            if (layer.present) {
                expect(layer.insideZone, `${name} is not a descendant of the edge zone`).toBe(false);
                expect(layer.anchor,     `${name} still anchors to the dock host`).not.toBe('edge-zone')
            }
        }
    })
});
