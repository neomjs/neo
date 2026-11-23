import { setup } from '../../setup.mjs';

const appName = 'RectangleTest';

setup({
    appConfig: {
        name: appName
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import Rectangle      from '../../../../src/util/Rectangle.mjs';

test.describe('Rectangle', () => {
    test('contains', () => {
        expect(new Rectangle(0, 0, 100, 100).contains(new Rectangle(10, 10, 80, 80))).toBe(true);
        expect(new Rectangle(0, 0, 100, 100).contains(new Rectangle(10, 10, 80, 110))).toBe(false);
        expect(new Rectangle(0, 0, 100, 100).contains(new Rectangle(10, 10, 110, 80))).toBe(false);
        expect(new Rectangle(0, 0, 100, 100).contains(new Rectangle(10, 10, 110, 110))).toBe(false);
        expect(new Rectangle(0, 0, 100, 100).contains(new Rectangle(-10, 10, 80, 80))).toBe(false);
        expect(new Rectangle(0, 0, 100, 100).contains(new Rectangle(10, -10, 80, 80))).toBe(false);
    });

    test.describe('gapBetween — the gap from a target to a subject aligned beside it, relative to the subject', () => {
        const target = {height: 30, width: 80, x: 100, y: 100};

        test('below or above the target, it spans the gap across both boxes', () => {
            expect(Rectangle.gapBetween(target, {height: 24, width: 120, x: 90, y: 140}), 'below, a 10px gap')
                .toEqual({height: 10, left: 0, top: -10, width: 120});
            expect(Rectangle.gapBetween(target, {height: 24, width: 60, x: 130, y: 152}), 'below, offset by 12px and narrower')
                .toEqual({height: 22, left: -30, top: -22, width: 90});
            expect(Rectangle.gapBetween(target, {height: 24, width: 120, x: 90, y: 66}), 'above')
                .toEqual({height: 10, left: 0, top: 24, width: 120})
        });

        test('beside the target, it spans the gap along both boxes', () => {
            expect(Rectangle.gapBetween(target, {height: 24, width: 60, x: 190, y: 103}), 'to the right')
                .toEqual({height: 30, left: -10, top: -3, width: 10});
            expect(Rectangle.gapBetween(target, {height: 24, width: 60, x: 30, y: 103}), 'to the left')
                .toEqual({height: 30, left: 60, top: -3, width: 10})
        });

        test('touching or overlapping boxes have no gap', () => {
            expect(Rectangle.gapBetween(target, {height: 24, width: 120, x: 90, y: 130})).toBe(null);
            expect(Rectangle.gapBetween(target, {height: 24, width: 120, x: 90, y: 110})).toBe(null)
        })
    });

    test.describe('intersects', () => {
        const rect = new Rectangle(0, 0, 100, 100);

        test('returns the overlapping area for an overlapping rectangle', () => {
            const result = rect.intersects(new Rectangle(50, 60, 100, 100));

            expect(result).toBeInstanceOf(Rectangle);
            expect(result.equals(new Rectangle(50, 60, 50, 40))).toBe(true);
        });

        test('returns false for a disjoint rectangle', () => {
            expect(rect.intersects(new Rectangle(200, 200, 50, 50))).toBe(false);
        });

        test('returns false for a rectangle that only touches an edge', () => {
            expect(rect.intersects(new Rectangle(100, 0, 50, 50))).toBe(false);
            expect(rect.intersects(new Rectangle(0, 100, 50, 50))).toBe(false);
        });

        test('returns false, never true, for a zero-size rectangle', () => {
            // A zero-size rectangle well inside used to hit the old point branch and return true
            expect(rect.intersects(new Rectangle(10, 10, 0, 0))).toBe(false);
            expect(rect.intersects(new Rectangle(10, 10, 0, 50))).toBe(false);
            expect(rect.intersects(new Rectangle(10, 10, 50, 0))).toBe(false);
            // A point-shaped object without width and height
            expect(rect.intersects({bottom: 10, right: 10, x: 10, y: 10})).toBe(false);
        });
    });

    test.describe('containsPoint', () => {
        const rect = new Rectangle(10, 20, 100, 50);

        test('returns true for a point inside', () => {
            expect(rect.containsPoint(50, 40)).toBe(true);
        });

        test('returns true for a point on an edge or a corner', () => {
            expect(rect.containsPoint(10, 40)).toBe(true);  // left edge
            expect(rect.containsPoint(110, 40)).toBe(true); // right edge
            expect(rect.containsPoint(50, 20)).toBe(true);  // top edge
            expect(rect.containsPoint(50, 70)).toBe(true);  // bottom edge
            expect(rect.containsPoint(110, 70)).toBe(true); // bottom right corner
        });

        test('returns false for a point outside', () => {
            expect(rect.containsPoint(9, 40)).toBe(false);
            expect(rect.containsPoint(111, 40)).toBe(false);
            expect(rect.containsPoint(50, 19)).toBe(false);
            expect(rect.containsPoint(50, 71)).toBe(false);
        });
    });

    test.describe('constrain', () => {
        test('Should constrain fitting subject rectangle', () => {
            const constrainTo = new Rectangle(0, 0, 200, 200);

            // Subject rect is below and to the right
            let result = new Rectangle(1000, 1000, 10, 10).constrainTo(constrainTo);
            expect(result.equals(new Rectangle(190, 190, 10, 10))).toBe(true);

            // Subject rect is to the right
            result = new Rectangle(1000, 0, 10, 10).constrainTo(constrainTo);
            expect(result.equals(new Rectangle(190, 0, 10, 10))).toBe(true);

            // Subject rect is above and right
            result = new Rectangle(1000, -1000, 10, 10).constrainTo(constrainTo);
            expect(result.equals(new Rectangle(190, 0, 10, 10))).toBe(true);

            // Subject rect is above
            result = new Rectangle(0, -1000, 10, 10).constrainTo(constrainTo);
            expect(result.equals(new Rectangle(0, 0, 10, 10))).toBe(true);

            // Subject rect is above and to the left
            result = new Rectangle(-1000, -1000, 10, 10).constrainTo(constrainTo);
            expect(result.equals(new Rectangle(0, 0, 10, 10))).toBe(true);

            // Subject rect is to the left
            result = new Rectangle(-1000, 0, 10, 10).constrainTo(constrainTo);
            expect(result.equals(new Rectangle(0, 0, 10, 10))).toBe(true);

            // Subject rect is below and to the left
            result = new Rectangle(-1000, 1000, 10, 10).constrainTo(constrainTo);
            expect(result.equals(new Rectangle(0, 190, 10, 10))).toBe(true);

            // Subject rect is below
            result = new Rectangle(0, 1000, 10, 10).constrainTo(constrainTo);
            expect(result.equals(new Rectangle(0, 190, 10, 10))).toBe(true);
        });

        test('Should constrain non-fitting subject rectangle when minima allow', () => {
            const constrainTo = new Rectangle(0, 0, 200, 200);
            const subject     = new Rectangle(1000, 1000, 210, 210);

            // Subject Rectangle is willing to shrink to 200x200
            subject.minWidth = subject.minHeight = 200;

            // Subject rect is below and to the right
            let result = subject.constrainTo(constrainTo);
            expect(result.equals(new Rectangle(0, 0, 200, 200))).toBe(true);

            // Subject rect is to the right
            subject.x = 1000;
            subject.y = 0;
            result = subject.constrainTo(constrainTo);
            expect(result.equals(new Rectangle(0, 0, 200, 200))).toBe(true);

            // Subject rect is above and right
            subject.x = 1000;
            subject.y = -1000;
            result = subject.constrainTo(constrainTo);
            expect(result.equals(new Rectangle(0, 0, 200, 200))).toBe(true);

            // Subject rect is above
            subject.x = 0;
            subject.y = -1000;
            result = subject.constrainTo(constrainTo);
            expect(result.equals(new Rectangle(0, 0, 200, 200))).toBe(true);

            // Subject rect is above and to the left
            subject.x = 1000;
            subject.y = -1000;
            result = subject.constrainTo(constrainTo);
            expect(result.equals(new Rectangle(0, 0, 200, 200))).toBe(true);

            // Subject rect is to the left
            subject.x = -1000;
            subject.y = 0;
            result = subject.constrainTo(constrainTo);
            expect(result.equals(new Rectangle(0, 0, 200, 200))).toBe(true);

            // Subject rect is below and to the left
            subject.x = -1000;
            subject.y = 1000;
            result = subject.constrainTo(constrainTo);
            expect(result.equals(new Rectangle(0, 0, 200, 200))).toBe(true);

            // Subject rect is below
            subject.x = 0;
            subject.y = 1000;
            result = subject.constrainTo(constrainTo);
            expect(result.equals(new Rectangle(0, 0, 200, 200))).toBe(true);
        });
    });

    test.describe('fitTo — inside the bounds by the smallest move, shrunk only where it cannot fit', () => {
        const bounds = new Rectangle(0, 0, 1000, 800);

        test('a rectangle inside the bounds comes back as it is, as a copy', () => {
            const subject = new Rectangle(100, 100, 400, 300),
                  result  = subject.fitTo(bounds);

            expect(result.equals(subject)).toBe(true);
            expect(result).not.toBe(subject)
        });

        test('a rectangle across an edge moves back by the overlap, and keeps its size', () => {
            expect(new Rectangle(700, 100, 400, 300).fitTo(bounds).equals(new Rectangle(600, 100, 400, 300)), 'right').toBe(true);
            expect(new Rectangle(100, 600, 400, 300).fitTo(bounds).equals(new Rectangle(100, 500, 400, 300)), 'bottom').toBe(true);
            expect(new Rectangle(-50, -20, 400, 300).fitTo(bounds).equals(new Rectangle(0, 0, 400, 300)), 'top-left').toBe(true)
        });

        test('only the dimension that cannot fit shrinks, where constrainTo() refuses without minima', () => {
            const subject = new Rectangle(100, 100, 1200, 300);

            expect(subject.constrainTo(bounds)).toBe(false);
            expect(subject.fitTo(bounds).equals(new Rectangle(0, 100, 1000, 300))).toBe(true)
        });

        test('a minimum holds, and one larger than the bounds keeps the leading edge inside', () => {
            const subject = new Rectangle(300, 100, 1200, 300);

            subject.minWidth = 900;
            expect(subject.fitTo(bounds).equals(new Rectangle(0, 100, 1000, 300)), 'room for the minimum').toBe(true);

            subject.minWidth = 1100;
            expect(subject.fitTo(bounds).equals(new Rectangle(0, 100, 1100, 300)), 'no room').toBe(true)
        });
    });

    test('expand should work', () => {
        expect(new Rectangle(10, 10, 10, 10).expand(5).equals(new Rectangle(5, 5, 20, 20))).toBe(true);
        expect(new Rectangle(10, 10, 10, 10).expand([5, 6]).equals(new Rectangle(4, 5, 22, 20))).toBe(true);
        expect(new Rectangle(10, 10, 10, 10).expand([5, 6, 7]).equals(new Rectangle(4, 5, 22, 22))).toBe(true);
        expect(new Rectangle(10, 10, 10, 10).expand([5, 6, 7, 8]).equals(new Rectangle(2, 5, 24, 22))).toBe(true);
    });

    test.describe('alignTo', () => {
        test('applies the final offset without mutating the source Rectangle', () => {
            const
                subject = new Rectangle(0, 0, 50, 50),
                result  = subject.alignTo({
                    target   : new Rectangle(100, 100, 100, 100),
                    edgeAlign: 't0-b0',
                    offset   : [12, 34]
                });

            expect(result.equals(new Rectangle(112, 234, 50, 50))).toBe(true);
            expect(result.position).toBe('bottom');
            expect(subject.equals(new Rectangle(0, 0, 50, 50))).toBe(true)
        });

        test('applies the final offset to an overlapping early-return result', () => {
            const result = new Rectangle(0, 0, 100, 100).alignTo({
                target     : new Rectangle(100, 100, 50, 50),
                constrainTo: new Rectangle(0, 0, 150, 150),
                edgeAlign  : 't0-t0',
                offset     : [5, 7]
            });

            expect(result.equals(new Rectangle(105, 107, 100, 100))).toBe(true);
            expect(result.position).toBe('top')
        });

        test('applies the final offset to a constrained solution', () => {
            const subject = new Rectangle(0, 0, 50, 200);

            subject.minHeight = 100;

            const result = subject.alignTo({
                target     : new Rectangle(200, 350, 100, 100),
                constrainTo: new Rectangle(0, 0, 500, 500),
                edgeAlign  : 't-b',
                matchSize  : true,
                offset     : [7, 9]
            });

            expect(result.equals(new Rectangle(157, 309, 50, 200))).toBe(true);
            expect(result.position).toBe('left')
        });

        test.describe('unconstrained', () => {
            const target = new Rectangle(100, 100, 100, 100);

            let result = new Rectangle(0, 0, 50, 50).alignTo({
                target,
                edgeAlign: 't-b'
            });
            expect(result.equals(new Rectangle(125, 200, 50, 50))).toBe(true);

            result = new Rectangle(0, 0, 50, 50).alignTo({
                target,
                edgeAlign: 't0-b0'
            });
            expect(result.equals(new Rectangle(100, 200, 50, 50))).toBe(true);

            result = new Rectangle(0, 0, 50, 50).alignTo({
                target,
                edgeAlign: 't100-b100'
            });
            expect(result.equals(new Rectangle(150, 200, 50, 50))).toBe(true);

            result = new Rectangle(0, 0, 50, 50).alignTo({
                target,
                edgeAlign: 'b-t'
            });
            expect(result.equals(new Rectangle(125, 50, 50, 50))).toBe(true);

            result = new Rectangle(0, 0, 50, 50).alignTo({
                target,
                edgeAlign: 'b0-t0'
            });
            expect(result.equals(new Rectangle(100, 50, 50, 50))).toBe(true);

            result = new Rectangle(0, 0, 50, 50).alignTo({
                target,
                edgeAlign: 'b100-t100'
            });
            expect(result.equals(new Rectangle(150, 50, 50, 50))).toBe(true);

            result = new Rectangle(0, 0, 50, 50).alignTo({
                target,
                edgeAlign: 'l-r'
            });
            expect(result.equals(new Rectangle(200, 125, 50, 50))).toBe(true);

            result = new Rectangle(0, 0, 50, 50).alignTo({
                target,
                edgeAlign: 'l0-r0'
            });
            expect(result.equals(new Rectangle(200, 100, 50, 50))).toBe(true);

            result = new Rectangle(0, 0, 50, 50).alignTo({
                target,
                edgeAlign: 'l100-r100'
            });
            expect(result.equals(new Rectangle(200, 150, 50, 50))).toBe(true);

            result = new Rectangle(0, 0, 50, 50).alignTo({
                target,
                edgeAlign: 'r-l'
            });
            expect(result.equals(new Rectangle(50, 125, 50, 50))).toBe(true);

            result = new Rectangle(0, 0, 50, 50).alignTo({
                target,
                edgeAlign: 'r0-l0'
            });
            expect(result.equals(new Rectangle(50, 100, 50, 50))).toBe(true);

            result = new Rectangle(0, 0, 50, 50).alignTo({
                target,
                edgeAlign: 'r100-l100'
            });
            expect(result.equals(new Rectangle(50, 150, 50, 50))).toBe(true);
        });

        test('unconstrained width matchSize', () => {
            const target = new Rectangle(100, 100, 100, 100);

            let result = new Rectangle(0, 0, 50, 50).alignTo({
                target,
                edgeAlign: 't-b',
                matchSize: true
            });
            expect(result.equals(new Rectangle(100, 200, 100, 50))).toBe(true);

            result = new Rectangle(0, 0, 50, 50).alignTo({
                target,
                edgeAlign: 'b-t',
                matchSize: true
            });
            expect(result.equals(new Rectangle(100, 50, 100, 50))).toBe(true);

            result = new Rectangle(0, 0, 50, 50).alignTo({
                target,
                edgeAlign: 'l-r',
                matchSize: true
            });
            expect(result.equals(new Rectangle(200, 100, 50, 100))).toBe(true);

            result = new Rectangle(0, 0, 50, 50).alignTo({
                target,
                edgeAlign: 'r-l',
                matchSize: true
            });
            expect(result.equals(new Rectangle(50, 100, 50, 100))).toBe(true);
        });

        test('unconstrained with targetMargin', () => {
            const target = new Rectangle(110, 110, 80, 80);

            let result = new Rectangle(0, 0, 50, 50).alignTo({
                target,
                targetMargin: 10,
                edgeAlign   : 't-b'
            });
            expect(result.equals(new Rectangle(125, 200, 50, 50))).toBe(true);

            result = new Rectangle(0, 0, 50, 50).alignTo({
                target,
                targetMargin: 10,
                edgeAlign   : 't0-b0'
            });
            expect(result.equals(new Rectangle(110, 200, 50, 50))).toBe(true);

            result = new Rectangle(0, 0, 50, 50).alignTo({
                target,
                targetMargin: 10,
                edgeAlign   : 't100-b100'
            });
            expect(result.equals(new Rectangle(140, 200, 50, 50))).toBe(true);

            result = new Rectangle(0, 0, 50, 50).alignTo({
                target,
                targetMargin: 10,
                edgeAlign   : 'b-t'
            });
            expect(result.equals(new Rectangle(125, 50, 50, 50))).toBe(true);

            result = new Rectangle(0, 0, 50, 50).alignTo({
                target,
                targetMargin: 10,
                edgeAlign   : 'b0-t0'
            });
            expect(result.equals(new Rectangle(110, 50, 50, 50))).toBe(true);

            result = new Rectangle(0, 0, 50, 50).alignTo({
                target,
                targetMargin: 10,
                edgeAlign   : 'b100-t100'
            });
            expect(result.equals(new Rectangle(140, 50, 50, 50))).toBe(true);

            result = new Rectangle(0, 0, 50, 50).alignTo({
                target,
                targetMargin: 10,
                edgeAlign   : 'l-r'
            });
            expect(result.equals(new Rectangle(200, 125, 50, 50))).toBe(true);

            result = new Rectangle(0, 0, 50, 50).alignTo({
                target,
                targetMargin: 10,
                edgeAlign   : 'l0-r0'
            });
            expect(result.equals(new Rectangle(200, 110, 50, 50))).toBe(true);

            result = new Rectangle(0, 0, 50, 50).alignTo({
                target,
                targetMargin: 10,
                edgeAlign   : 'l100-r100'
            });
            expect(result.equals(new Rectangle(200, 140, 50, 50))).toBe(true);

            result = new Rectangle(0, 0, 50, 50).alignTo({
                target,
                targetMargin: 10,
                edgeAlign   : 'r-l'
            });
            expect(result.equals(new Rectangle(50, 125, 50, 50))).toBe(true);

            result = new Rectangle(0, 0, 50, 50).alignTo({
                target,
                targetMargin: 10,
                edgeAlign   : 'r0-l0'
            });
            expect(result.equals(new Rectangle(50, 110, 50, 50))).toBe(true);

            result = new Rectangle(0, 0, 50, 50).alignTo({
                target,
                targetMargin: 10,
                edgeAlign   : 'r100-l100'
            });
            expect(result.equals(new Rectangle(50, 140, 50, 50))).toBe(true);
        });

        test('an oversized subject uses the largest available placement and keeps the requested side on a tie', () => {
            const bounds  = new Rectangle(10, 20, 500, 300),
                  target  = new Rectangle(210, 150, 100, 40),
                  subject = new Rectangle(0, 0, 600, 700);

            // The two horizontal strips each offer 500 × 130, the other sides 200 × 300.
            const result = subject.alignTo({target, constrainTo: bounds, edgeAlign: 't0-b0'});
            expect(result.toJSON()).toMatchObject({x: 10, y: 190, width: 500, height: 130});
            expect([result.zone, result.position]).toEqual([2, 'bottom']);

            const above = subject.alignTo({target: new Rectangle(210, 280, 100, 20), constrainTo: bounds,
                edgeAlign: 't0-b0', targetMargin: 5, offset: [2, 3]});
            expect(above.toJSON()).toMatchObject({x: 12, y: 23, width: 500, height: 255});
            expect(above.position).toBe('top');
            expect(subject.toJSON()).toMatchObject({x: 0, y: 0, width: 600, height: 700})
        });

        test('a rejected preferred side does not replace a natural fit elsewhere with a smaller rectangle', () => {
            const result = new Rectangle(0, 0, 140, 210).alignTo({
                target   : new Rectangle(270, 230, 30, 30), constrainTo: new Rectangle(0, 0, 300, 270),
                edgeAlign: 't0-b0', axisLock: true
            });
            expect(result.toJSON()).toMatchObject({x: 160, y: 20, width: 140, height: 210});
            expect(result.position).toBe('top')
        });

        test('an explicit minimum that is larger than the viewport keeps its size and a reachable leading edge', () => {
            const subject = new Rectangle(0, 0, 400, 500);
            subject.minWidth = 400;
            const result = subject.alignTo({target: new Rectangle(220, 220, 20, 20),
                constrainTo: new Rectangle(10, 20, 240, 250), edgeAlign: 't0-b0'});
            expect(result.toJSON()).toMatchObject({x: 10, y: 20, width: 400, height: 250});
        });

        test.describe('constrained, edgeAlign : "t-b"', () => {
            const constrainTo = new Rectangle(0, 0, 500, 500);
            let   target      = new Rectangle(200, 200, 100, 100);
            let   subject     = new Rectangle(0, 0, 10, 1000);

            test('Subject shrinks to fit', () => {
                subject.minHeight = 100;
                const result = subject.alignTo({
                    target,
                    constrainTo,
                    edgeAlign: 't-b'
                });
                expect(result.equals(new Rectangle(245, 300, 10, 200))).toBe(true);
            });

            test('Subject shrinks to fit, cannot fit in first choice zone, flips edge and matches aligned edge size', () => {
                subject = new Rectangle(0, 0, 10, 1000);
                subject.minHeight = 100;
                const result = subject.alignTo({
                    target,
                    constrainTo,
                    matchSize: true,
                    edgeAlign: 't-b'
                });
                expect(result.equals(new Rectangle(200, 300, 100, 200))).toBe(true);
            });

            test('Subject cannot shrink enough to fit at first choice moves to closest fitting zone', () => {
                // Only 50px below. Should flip to top
                target = new Rectangle(200, 350, 100, 100);
                subject = new Rectangle(0, 0, 50, 200);
                subject.minHeight = 100;

                const result = subject.alignTo({
                    target,
                    constrainTo,
                    matchSize: true,
                    edgeAlign: 't-b'
                });
                expect(result.equals(new Rectangle(150, 300, 50, 200))).toBe(true);
            });
        });
    });
});
