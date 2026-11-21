import {setup} from '../../setup.mjs';

setup({appConfig: {name: 'HeaderSelectionTest'}});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import header         from '../../../../src/canvas/Header.mjs';

const width = 201, height = 58,
      home  = {id: 'home', x: -12, y: 5, width: 65, height: 48},
      news  = {id: 'news', x: 154, y: 5, width: 73, height: 48};

/** Records line vertices, independent of the renderer's palette, stroke widths and number of paths. */
function vertices(draw) {
    const points = [],
          point  = (x, y) => points.push([x, y]);
    draw({
        moveTo: point, lineTo: point, beginPath() {}, closePath() {}, fill() {}, stroke() {}, save() {}, restore() {}
    });
    return points
}

/** A partly clipped selected link still draws, strictly within its visible span. */
function expectInside(points, rect) {
    expect(points.length).toBeGreaterThan(0);
    expect(points.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y) &&
        x >= Math.max(0, rect.x) && x <= Math.min(width, rect.x + rect.width) && y >= 0 && y <= height)).toBe(true)
}

test('only the current visible route gains distinct geometry while its neighbour can still be hovered', () => {
    header.clearGraph();
    try {
        header.updateNavRects({width, height, rects: [
            home, news, {id: 'outside', x: width + 8, y: 5, width: 45, height: 48}
        ]});
        header.updateResources(width, height);
        const stream   = () => vertices(ctx => header.drawAuras(ctx, width, height)),
              baseline = stream(),
              ordinary = new Set(baseline.map(([x, y]) => `${x},${y}`)),
              selected = () => {
                  header.calculateStrandGeometry(width, height);
                  return vertices(ctx => header.drawActiveOverlay(ctx, width))
              },
              hovered  = () => vertices(ctx => header.drawHoverOverlay(ctx, width));

        header.updateActiveId({id: 'home'});
        const atHome = selected();
        expectInside(atHome, home);
        expect(atHome.some(([x, y]) => !ordinary.has(`${x},${y}`)), 'selection changes the shape of the wave').toBe(true);
        expect(stream().filter(([x]) => x > home.x + home.width).every(([x, y]) => ordinary.has(`${x},${y}`)),
            'the ordinary stream outside the current route keeps its geometry').toBe(true);

        header.updateHoverId({id: 'news'});
        expect(selected()).toEqual(atHome);
        expectInside(hovered(), news);
        header.updateHoverId({id: null});
        expect(selected()).toEqual(atHome);

        header.updateActiveId({id: 'news'});
        expectInside(selected(), news);
        const inHome = ([x]) => x <= home.x + home.width;
        expect(stream().filter(inHome), 'the former route resumes its ordinary wave on the same frame').toEqual(baseline.filter(inHome));
        header.updateActiveId({id: 'unmatched'});
        expect(selected()).toEqual([]);

        header.updateActiveId({id: 'outside'});
        expect(selected()).toEqual([]);
        header.updateActiveId({id: null});
        header.updateHoverId({id: 'outside'});
        expect(hovered()).toEqual([])
    } finally {
        header.clearGraph()
    }
});

test('an existing theme override can keep its palette when it adds the selected helix', () => {
    const {helix, selectionWash, ...original} = header.constructor.colors.light,
          paints                              = [],
          ctx                                 = new Proxy({}, {
              get: () => () => {},
              set(target, key, value) {
                  if (key === 'fillStyle' || key === 'strokeStyle') paints.push(value);
                  return true
              }
          });

    class LegacyHeader extends header.constructor {
        static config = {className: 'Neo.test.canvas.LegacyHeader', singleton: false}
        static colors = {light: original}
    }
    const themed = Neo.create(Neo.setupClass(LegacyHeader));
    try {
        themed.updateNavRects({width, height, rects: [news]});
        themed.updateResources(width, height);
        themed.updateActiveId({id: 'news'});
        themed.calculateStrandGeometry(width, height);
        themed.drawActiveOverlay(ctx, width);
        const [a, b, c] = original.grad1;
        expect(paints).toEqual([original.fgRibbon[1], c, a, b, a])
    } finally {
        themed.destroy()
    }
});
