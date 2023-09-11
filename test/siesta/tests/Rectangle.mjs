import Rectangle from '../../../src/util/Rectangle.mjs';

// Maintainer:
// A good technique for debugging Rectangle code is to use the show(<colour>) method
// to visualize the Rectangles in the DOM.
//
// The following statements will reveal the state of the Rectangles used
// constrainingRect.show('#f1f1f1')
// target.show('red')
// subject.show('yellow')
// result.show('green')

StartTest(t => {
    let constrainTo, subject, target, result;

    t.it('contains', t => {
        t.ok(new Rectangle(0, 0, 100, 100).contains(new Rectangle(10, 10, 80, 80)));
        t.notOk(new Rectangle(0, 0, 100, 100).contains(new Rectangle(10, 10, 80, 110)));
        t.notOk(new Rectangle(0, 0, 100, 100).contains(new Rectangle(10, 10, 110, 80)));
        t.notOk(new Rectangle(0, 0, 100, 100).contains(new Rectangle(10, 10, 110, 110)));
        t.notOk(new Rectangle(0, 0, 100, 100).contains(new Rectangle(-10, 10, 80, 80)));
        t.notOk(new Rectangle(0, 0, 100, 100).contains(new Rectangle(10, -10, 80, 80)));
    });

    t.describe('constrain', t => {
        t.describe('Should constrain fitting subject rectangle', t => {
            constrainTo = new Rectangle(0, 0, 200, 200);

            // Subject rect is below and to the right
            result = new Rectangle(1000, 1000, 10, 10).constrainTo(constrainTo);
            t.ok(result.equals(new Rectangle(190, 190, 10, 10)));

            // Subject rect is to the right
            result = new Rectangle(1000, 0, 10, 10).constrainTo(constrainTo);
            t.ok(result.equals(new Rectangle(190, 0, 10, 10)));

            // Subject rect is above and right
            result = new Rectangle(1000, -1000, 10, 10).constrainTo(constrainTo);
            t.ok(result.equals(new Rectangle(190, 0, 10, 10)));

            // Subject rect is above
            result = new Rectangle(0, -1000, 10, 10).constrainTo(constrainTo);
            t.ok(result.equals(new Rectangle(0, 0, 10, 10)));

            // Subject rect is above and to the left
            result = new Rectangle(-1000, -1000, 10, 10).constrainTo(constrainTo);
            t.ok(result.equals(new Rectangle(0, 0, 10, 10)));

            // Subject rect is to the left
            result = new Rectangle(-1000, 0, 10, 10).constrainTo(constrainTo);
            t.ok(result.equals(new Rectangle(0, 0, 10, 10)));

            // Subject rect is below and to the left
            result = new Rectangle(-1000, 1000, 10, 10).constrainTo(constrainTo);
            t.ok(result.equals(new Rectangle(0, 190, 10, 10)));

            // Subject rect is below
            result = new Rectangle(0, 1000, 10, 10).constrainTo(constrainTo);
            t.ok(result.equals(new Rectangle(0, 190, 10, 10)));
        });

        t.describe('Should constrain non-fitting subject rectangle when minima allow', t => {
            constrainTo = new Rectangle(0, 0, 200, 200);
            subject          = new Rectangle(1000, 1000, 210, 210);

            // Subject Rectangle is willing to shrink to 200x200
            subject.minWidth = subject.minHeight = 200;

            // Subject rect is below and to the right
            result = subject.constrainTo(constrainTo);
            t.ok(result.equals(new Rectangle(0, 0, 200, 200)));

            // Subject rect is to the right
            subject.x = 1000; subject.y = 0;
            result = subject.constrainTo(constrainTo);
            t.ok(result.equals(new Rectangle(0, 0, 200, 200)));

            // Subject rect is above and right
            subject.x = 1000; subject.y = -1000;
            result = subject.constrainTo(constrainTo);
            t.ok(result.equals(new Rectangle(0, 0, 200, 200)));

            // Subject rect is above
            subject.x = 0; subject.y = -1000;
            result = subject.constrainTo(constrainTo);
            t.ok(result.equals(new Rectangle(0, 0, 200, 200)));

            // Subject rect is above and to the left
            subject.x = 1000; subject.y = -1000;
            result = subject.constrainTo(constrainTo);
            t.ok(result.equals(new Rectangle(0, 0, 200, 200)));

            // Subject rect is to the left
            subject.x = -1000; subject.y = 0;
            result = subject.constrainTo(constrainTo);
            t.ok(result.equals(new Rectangle(0, 0, 200, 200)));

            // Subject rect is below and to the left
            subject.x = -1000; subject.y = 1000;
            result = subject.constrainTo(constrainTo);
            t.ok(result.equals(new Rectangle(0, 0, 200, 200)));

            // Subject rect is below
            subject.x = 0; subject.y = 1000;
            result = subject.constrainTo(constrainTo);
            t.ok(result.equals(new Rectangle(0, 0, 200, 200)));
        });
        
        t.describe('Should constrain non-fitting subject rectangle when minima allow', t => {
            constrainTo = new Rectangle(0, 0, 200, 200);
            subject          = new Rectangle(1000, 1000, 210, 210);

            // Subject Rectangle is willing to shrink to 200x200
            subject.minWidth = subject.minHeight = 200;

            // Subject rect is below and to the right
            result = subject.constrainTo(constrainTo);
            t.ok(result.equals(new Rectangle(0, 0, 200, 200)));

            // Subject rect is to the right
            subject.x = 1000; subject.y = 0;
            result = subject.constrainTo(constrainTo);
            t.ok(result.equals(new Rectangle(0, 0, 200, 200)));

            // Subject rect is above and right
            subject.x = 1000; subject.y = -1000;
            result = subject.constrainTo(constrainTo);
            t.ok(result.equals(new Rectangle(0, 0, 200, 200)));

            // Subject rect is above
            subject.x = 0; subject.y = -1000;
            result = subject.constrainTo(constrainTo);
            t.ok(result.equals(new Rectangle(0, 0, 200, 200)));

            // Subject rect is above and to the left
            subject.x = 1000; subject.y = -1000;
            result = subject.constrainTo(constrainTo);
            t.ok(result.equals(new Rectangle(0, 0, 200, 200)));

            // Subject rect is to the left
            subject.x = -1000; subject.y = 0;
            result = subject.constrainTo(constrainTo);
            t.ok(result.equals(new Rectangle(0, 0, 200, 200)));

            // Subject rect is below and to the left
            subject.x = -1000; subject.y = 1000;
            result = subject.constrainTo(constrainTo);
            t.ok(result.equals(new Rectangle(0, 0, 200, 200)));

            // Subject rect is below
            subject.x = 0; subject.y = 1000;
            result = subject.constrainTo(constrainTo);
            t.ok(result.equals(new Rectangle(0, 0, 200, 200)));
        });
    });

    t.it('expand should work', t => {
        t.ok(new Rectangle(10, 10, 10, 10).expand(5).equals(new Rectangle(5, 5, 20, 20)));
        t.ok(new Rectangle(10, 10, 10, 10).expand([5, 6]).equals(new Rectangle(4, 5, 22, 20)));
        t.ok(new Rectangle(10, 10, 10, 10).expand([5, 6, 7]).equals(new Rectangle(4, 5, 22, 22)));
        t.ok(new Rectangle(10, 10, 10, 10).expand([5, 6, 7, 8]).equals(new Rectangle(2, 5, 24, 22)));
    });

    t.describe('alignTo', t => {
        t.describe('unconstrained', t => {
            target = new Rectangle(100, 100, 100, 100);

            result = new Rectangle(0, 0, 50, 50).alignTo({
                target,
                edgeAlign : 't-b'
            });
            t.ok(result.equals(new Rectangle(125, 200, 50, 50)));

            result = new Rectangle(0, 0, 50, 50).alignTo({
                target,
                edgeAlign : 't0-b0'
            });
            t.ok(result.equals(new Rectangle(100, 200, 50, 50)));

            result = new Rectangle(0, 0, 50, 50).alignTo({
                target,
                edgeAlign : 't100-b100'
            });
            t.ok(result.equals(new Rectangle(150, 200, 50, 50)));

            result = new Rectangle(0, 0, 50, 50).alignTo({
                target,
                edgeAlign : 'b-t'
            });
            t.ok(result.equals(new Rectangle(125, 50, 50, 50)));

            result = new Rectangle(0, 0, 50, 50).alignTo({
                target,
                edgeAlign : 'b0-t0'
            });
            t.ok(result.equals(new Rectangle(100, 50, 50, 50)));

            result = new Rectangle(0, 0, 50, 50).alignTo({
                target,
                edgeAlign : 'b100-t100'
            });
            t.ok(result.equals(new Rectangle(150, 50, 50, 50)));

            result = new Rectangle(0, 0, 50, 50).alignTo({
                target,
                edgeAlign : 'l-r'
            });
            t.ok(result.equals(new Rectangle(200, 125, 50, 50)));

            result = new Rectangle(0, 0, 50, 50).alignTo({
                target,
                edgeAlign : 'l0-r0'
            });
            t.ok(result.equals(new Rectangle(200, 100, 50, 50)));

            result = new Rectangle(0, 0, 50, 50).alignTo({
                target,
                edgeAlign : 'l100-r100'
            });
            t.ok(result.equals(new Rectangle(200, 150, 50, 50)));

            result = new Rectangle(0, 0, 50, 50).alignTo({
                target,
                edgeAlign : 'r-l'
            });
            t.ok(result.equals(new Rectangle(50, 125, 50, 50)));

            result = new Rectangle(0, 0, 50, 50).alignTo({
                target,
                edgeAlign : 'r0-l0'
            });
            t.ok(result.equals(new Rectangle(50, 100, 50, 50)));

            result = new Rectangle(0, 0, 50, 50).alignTo({
                target,
                edgeAlign : 'r100-l100'
            });
            t.ok(result.equals(new Rectangle(50, 150, 50, 50)));
        });

        // The aligned edge of the subject must match the size of the edge of the target that it aligns to
        t.describe('unconstrained width matchSize', t => {
            target = new Rectangle(100, 100, 100, 100);

            result = new Rectangle(0, 0, 50, 50).alignTo({
                target,
                edgeAlign : 't-b',
                matchSize : true
            });
            t.ok(result.equals(new Rectangle(100, 200, 100, 50)));

            result = new Rectangle(0, 0, 50, 50).alignTo({
                target,
                edgeAlign : 'b-t',
                matchSize : true
            });
            t.ok(result.equals(new Rectangle(100, 50, 100, 50)));

            result = new Rectangle(0, 0, 50, 50).alignTo({
                target,
                edgeAlign : 'l-r',
                matchSize : true
            });
            t.ok(result.equals(new Rectangle(200, 100, 50, 100)));

            result = new Rectangle(0, 0, 50, 50).alignTo({
                target,
                edgeAlign : 'r-l',
                matchSize : true
            });
            t.ok(result.equals(new Rectangle(50, 100, 50, 100)));
        });

        // The subject must be pushed away from the target by the correct targetMargin
        t.describe('unconstrained with targetMargin', async t => {
            target = new Rectangle(110, 110, 80, 80);

            result = new Rectangle(0, 0, 50, 50).alignTo({
                target,
                targetMargin : 10,
                edgeAlign : 't-b'
            });
            t.ok(result.equals(new Rectangle(125, 200, 50, 50)));

            result = new Rectangle(0, 0, 50, 50).alignTo({
                target,
                targetMargin : 10,
                edgeAlign : 't0-b0'
            });
            t.ok(result.equals(new Rectangle(110, 200, 50, 50)));

            result = new Rectangle(0, 0, 50, 50).alignTo({
                target,
                targetMargin : 10,
                edgeAlign : 't100-b100'
            });
            t.ok(result.equals(new Rectangle(140, 200, 50, 50)));

            result = new Rectangle(0, 0, 50, 50).alignTo({
                target,
                targetMargin : 10,
                edgeAlign : 'b-t'
            });
            t.ok(result.equals(new Rectangle(125, 50, 50, 50)));

            result = new Rectangle(0, 0, 50, 50).alignTo({
                target,
                targetMargin : 10,
                edgeAlign : 'b0-t0'
            });
            t.ok(result.equals(new Rectangle(110, 50, 50, 50)));

            result = new Rectangle(0, 0, 50, 50).alignTo({
                target,
                targetMargin : 10,
                edgeAlign : 'b100-t100'
            });
            t.ok(result.equals(new Rectangle(140, 50, 50, 50)));

            result = new Rectangle(0, 0, 50, 50).alignTo({
                target,
                targetMargin : 10,
                edgeAlign : 'l-r'
            });
            t.ok(result.equals(new Rectangle(200, 125, 50, 50)));

            result = new Rectangle(0, 0, 50, 50).alignTo({
                target,
                targetMargin : 10,
                edgeAlign : 'l0-r0'
            });
            t.ok(result.equals(new Rectangle(200, 110, 50, 50)));

            result = new Rectangle(0, 0, 50, 50).alignTo({
                target,
                targetMargin : 10,
                edgeAlign : 'l100-r100'
            });
            t.ok(result.equals(new Rectangle(200, 140, 50, 50)));

            result = new Rectangle(0, 0, 50, 50).alignTo({
                target,
                targetMargin : 10,
                edgeAlign : 'r-l'
            });
            t.ok(result.equals(new Rectangle(50, 125, 50, 50)));

            result = new Rectangle(0, 0, 50, 50).alignTo({
                target,
                targetMargin : 10,
                edgeAlign : 'r0-l0'
            });
            t.ok(result.equals(new Rectangle(50, 110, 50, 50)));

            result = new Rectangle(0, 0, 50, 50).alignTo({
                target,
                targetMargin : 10,
                edgeAlign : 'r100-l100'
            });
            t.ok(result.equals(new Rectangle(50, 140, 50, 50)));
        });

        // Test the adaptation scenarios for the requested position being below the target.
        // TODO: test constrain adaptation for all four edge alignment zones
        t.describe('constrained, edgeAlign : "t-b"', t => {
            constrainTo = new Rectangle(0, 0, 500, 500);
            target      = new Rectangle(200, 200, 100, 100);
            subject     = new Rectangle(0, 0, 10, 1000);

            t.it('Subject shrinks to fit', t => {
                subject.minHeight = 100;
                result = subject.alignTo({
                    target,
                    constrainTo,
                    edgeAlign : 't-b'
                });
                t.ok(result.equals(new Rectangle(245, 300, 10, 200)));
            });

            subject = new Rectangle(0, 0, 10, 1000);
            subject.minHeight = 100;

            t.it('Subject shrinks to fit, cannot fit in first choice zone, flips edge and matches aligned edge size', t => {
                result = subject.alignTo({
                    target,
                    constrainTo,
                    matchSize : true,
                    edgeAlign : 't-b'
                });
                t.ok(result.equals(new Rectangle(200, 300, 100, 200)));
            });

            t.it('Subject cannot shrink enough to fit at first choice moves to closest fitting zone', t => {
                // Only 50px below. Should flip to top
                target = new Rectangle(200, 350, 100, 100),
                subject = new Rectangle(0, 0, 50, 200);
                subject.minHeight = 100;

                result = subject.alignTo({
                    target,
                    constrainTo,
                    matchSize : true,
                    edgeAlign : 't-b'
                });
                t.ok(result.equals(new Rectangle(150, 300, 50, 200)));
            });
        });
    });
});
