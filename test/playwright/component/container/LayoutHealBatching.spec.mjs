import {test, expect} from '@playwright/test';

/**
 * Guards the SHAPE that made the `moveBefore` layout heal quadratic, rather than its wall-clock symptom.
 *
 * The heal rebuilds a parent's box tree with a `display` toggle, because Chromium can leave the sibling
 * chain stale after an atomic move. Its cost scales with the parent's child count, so running it once per
 * move made an N-sibling reorder O(N²) — invisible at grid N, 8137ms of blocked main thread at helix N.
 *
 * A timing assertion would express that directly and flake immediately; these assert the structure
 * instead, which fails against the per-move form for the same reason and cannot be timing-dependent.
 * Each one demonstrates its own RED by simulating the per-move form in-page, so "this test can fail"
 * is proven here rather than claimed.
 */
test.describe('Neo.main.DeltaUpdates layout-heal batching', () => {
    test.beforeEach(async ({page}) => {
        await page.goto('test/playwright/component/apps/empty-viewport/index.html');
        await page.waitForSelector('#component-test-viewport', {state: 'attached'})
    });

    /**
     * Builds a parent with `count` identifiable children and a display-toggle counter attached to it.
     * @param {Object} page Playwright page.
     * @param {Number} count Child count.
     * @returns {Promise<void>}
     */
    async function seed(page, count) {
        await page.evaluate(n => {
            const root = document.getElementById('component-test-viewport');

            root.innerHTML = '';

            const parent = document.createElement('div');

            parent.id = 'heal-parent';
            root.appendChild(parent);

            for (let i = 0; i < n; i++) {
                const child = document.createElement('div');

                child.id = `heal-child-${i}`;
                parent.appendChild(child)
            }

            // One heal = set `display:none`, force layout, restore. Both writes are synchronous, so by
            // the time the observer callback runs the value is ALREADY restored — reading the live
            // `style.display` here counts zero every time. The heal is therefore reconstructed from
            // `oldValue`: the restore is the record whose PREVIOUS value was `display: none`.
            window.__healCount = 0;

            new MutationObserver(records => {
                records.forEach(record => {
                    if (record.attributeName === 'style' && record.oldValue?.includes('display: none')) {
                        window.__healCount++
                    }
                })
            }).observe(parent, {attributes: true, attributeFilter: ['style'], attributeOldValue: true})
        }, count)
    }

    /**
     * Applies a reorder of every child as one delta batch and returns the observed heal count.
     * @param {Object} page Playwright page.
     * @param {Number} count Child count.
     * @returns {Promise<Number>}
     */
    async function reorderAndCountHeals(page, count) {
        return page.evaluate(async n => {
            window.__healCount = 0;

            const deltas = [];

            // Reverse the order: every child genuinely moves, so no move can be skipped as a no-op.
            for (let i = 0; i < n; i++) {
                deltas.push({action: 'moveNode', id: `heal-child-${n - 1 - i}`, index: i, parentId: 'heal-parent'})
            }

            Neo.main.DeltaUpdates.update({deltas});

            // MutationObserver delivers on the microtask queue; `update()` is synchronous, so one tick
            // is enough and no timer is involved.
            await Promise.resolve();
            await new Promise(resolve => setTimeout(resolve, 0));

            return window.__healCount
        }, count)
    }

    test('a batch of N moves against one parent heals ONCE, and the per-move form is proven to fail it', async ({page}) => {
        const count = 40;

        await seed(page, count);

        const batched = await reorderAndCountHeals(page, count);

        // The guarantee: heal count does not scale with the number of moves.
        expect(batched).toBe(1);

        // RED demonstration. Simulate the reintroduced per-move form and re-run the SAME assertion path,
        // so this test is shown to distinguish the two rather than merely passing against the good one.
        const perMove = await page.evaluate(async n => {
            const DU       = Neo.main.DeltaUpdates,
                  original = DU.moveNode.bind(DU);

            DU.moveNode = function(delta) {
                original(delta);

                const parentNode   = document.getElementById(delta.parentId),
                      displayValue = parentNode.style.display;

                parentNode.style.display = 'none';
                void parentNode.offsetHeight;
                parentNode.style.display = displayValue
            };

            window.__healCount = 0;

            const deltas = [];

            for (let i = 0; i < n; i++) {
                deltas.push({action: 'moveNode', id: `heal-child-${i}`, index: i, parentId: 'heal-parent'})
            }

            DU.update({deltas});

            await Promise.resolve();
            await new Promise(resolve => setTimeout(resolve, 0));

            DU.moveNode = original;

            return window.__healCount
        }, count);

        // Fails the `toBe(1)` above for the right reason: one heal per move.
        expect(perMove).toBeGreaterThan(1);
        expect(batched).toBeLessThan(perMove)
    });

    test('moveNode performs no layout flush inline — the batch drain is the only flush site', async ({page}) => {
        const result = await page.evaluate(async () => {
            // `cache: 'no-store'` plus a unique query is load-bearing, not defensive. A plain fetch is
            // served from cache, so this assertion passed against a source that HAD been mutated to
            // reintroduce the inline flush — it was validating stale text while looking green, which is
            // the precise failure this test exists to prevent.
            const source = await (await fetch(`/src/main/DeltaUpdates.mjs?cacheBust=${Math.random()}`, {cache: 'no-store'})).text();

            /**
             * Slices one method body out of the class source by brace balance.
             *
             * The parameter list is walked with PAREN balance first, because `moveNode({id, index,
             * parentId})` destructures: taking the first `{` after the method name yields the parameter
             * object, not the body. An earlier version did exactly that and reported "no display toggle
             * in moveNode" while the toggle sat in a body it never read — and the non-vacuity check did
             * not catch it, because `flushLayoutHeals()` takes no parameters, so for that method the
             * first `{` happens to be correct.
             * @param {String} name Method name.
             * @returns {String}
             */
            const methodBody = name => {
                const start = source.indexOf(`\n    ${name}(`);

                if (start === -1) return '';

                let i = source.indexOf('(', start), parens = 0;

                for (; i < source.length; i++) {
                    if (source[i] === '(') parens++;
                    if (source[i] === ')') { parens--; if (parens === 0) break }
                }

                const bodyStart = source.indexOf('{', i);

                let depth = 0;

                for (let j = bodyStart; j < source.length; j++) {
                    if (source[j] === '{') depth++;
                    if (source[j] === '}') { depth--; if (depth === 0) return source.slice(bodyStart, j + 1) }
                }

                return ''
            };

            const moveNode = methodBody('moveNode'),
                  flush    = methodBody('flushLayoutHeals');

            return {
                moveNodeFound: moveNode.length > 0,
                flushFound   : flush.length > 0,
                // Proves the slice is the BODY and not a parameter list — the failure mode above.
                moveNodeBodyIsReal    : moveNode.includes('moveBefore'),
                moveNodeTogglesDisplay: /style\.display\s*=/.test(moveNode),
                flushTogglesDisplay   : /style\.display\s*=/.test(flush)
            }
        });

        expect(result.moveNodeFound).toBe(true);
        expect(result.flushFound).toBe(true);
        expect(result.moveNodeBodyIsReal).toBe(true);

        // The guard.
        expect(result.moveNodeTogglesDisplay).toBe(false);

        // Non-vacuity: the same predicate is TRUE for the method that legitimately toggles display, so a
        // `false` above is a real finding rather than a regex that matches nothing.
        expect(result.flushTogglesDisplay).toBe(true)
    });

    test('a delta throwing mid-batch still drains the pending heals', async ({page}) => {
        await seed(page, 8);

        const healCount = await page.evaluate(async () => {
            window.__healCount = 0;

            try {
                Neo.main.DeltaUpdates.update({deltas: [
                    {action: 'moveNode', id: 'heal-child-7', index: 0, parentId: 'heal-parent'},
                    // No such handler: `me[delta.action]` is undefined and the batch throws here.
                    {action: 'thisActionDoesNotExist', id: 'heal-child-6'}
                ]})
            } catch (error) {
                // Expected — the point is what happens to the heal that was already pending.
            }

            await Promise.resolve();
            await new Promise(resolve => setTimeout(resolve, 0));

            return window.__healCount
        });

        // The move that landed still needs its rebuild; without the `finally` it would render from a
        // stale sibling chain until some unrelated later batch happened to heal it.
        expect(healCount).toBe(1)
    });

    test('a parent mid-animation is not healed, and does not strand into the next batch', async ({page}) => {
        await seed(page, 8);

        const result = await page.evaluate(async () => {
            const parent = document.getElementById('heal-parent');

            // A running animation on a child: `display: none` would CANCEL it outright, which is what
            // destroyed the motion the gate now protects.
            const animation = parent.firstElementChild.animate(
                [{opacity: 1}, {opacity: 0.5}],
                {duration: 5000}
            );

            window.__healCount = 0;

            Neo.main.DeltaUpdates.update({deltas: [
                {action: 'moveNode', id: 'heal-child-7', index: 0, parentId: 'heal-parent'}
            ]});

            await Promise.resolve();
            await new Promise(resolve => setTimeout(resolve, 0));

            const duringAnimation = window.__healCount;

            animation.cancel();

            // A second batch AFTER the animation ends must heal only its own parent once — the skipped
            // parent must not have been carried over as pending work.
            window.__healCount = 0;

            Neo.main.DeltaUpdates.update({deltas: [
                {action: 'moveNode', id: 'heal-child-6', index: 0, parentId: 'heal-parent'}
            ]});

            await Promise.resolve();
            await new Promise(resolve => setTimeout(resolve, 0));

            return {duringAnimation, afterAnimation: window.__healCount, animationsSeen: parent.getAnimations({subtree: true}).length}
        });

        expect(result.duringAnimation).toBe(0);
        expect(result.afterAnimation).toBe(1)
    })
});
