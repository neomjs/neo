import {test, expect} from '@playwright/test';

/**
 * A guide's ```mermaid fence must reach the reader as an SVG, on a route where Monaco is BUSY.
 *
 * The portal preloads `main.addon.MonacoEditor`, so Monaco's AMD loader is live on every route and
 * a global `define` exists app-wide. Mermaid's published chunks carry vendored UMD wrappers —
 * `fastdom` among them — which hand that loader an ANONYMOUS factory and get refused with
 * `Can only have one anonymous define call per script file`. Checking `define.amd` does not save
 * them: Monaco's `define` HAS `.amd`, so the guarded majority take the AMD branch too.
 *
 * ⚠️ **`define.amd === true` is NOT the discriminator, and believing it was is what let the
 * previous version of this arm pass while the defect shipped.** It is true on every portal route,
 * including the ones that render perfectly. The collision needs the loader to be *resolving a
 * module* when a chunk arrives, which only happens where a live preview instantiates an editor —
 * so the route pair below is the assertion, and `MONACO_EDITOR` is what makes it one.
 *
 * Measured on this branch in one session, as `.neo-mermaid svg` per authored fence — the addon
 * repointed between the two right-hand columns and nothing else:
 *
 *                                        editors   → node_modules   → dist/mermaid.mjs
 *   tutorials/DockLayoutsFirstLayout           2   0/1 ❌            1/1 ✅
 *   guides/uibuildingblocks/DockLayouts        0   2/2 ✅            2/2 ✅
 *
 * The control row is why it stays: it is green in BOTH columns, so it is what keeps a future "fix"
 * from passing by breaking mermaid everywhere equally — and it is also the shape of every route an
 * observer is likely to open by hand. A diagram rendering on a page with no live preview is not
 * evidence the collision is fixed.
 */

/**
 * An INSTANTIATED Monaco editor — `component/wrapper/MonacoEditor.mjs:54` `baseCls`.
 *
 * ⚠️ Not `typeof window.monaco === 'object'`, and not `typeof window.require === 'function'`.
 * @neo-opus-grace measured both across the two routes and **both are identical on the route that
 * renders fine**: Monaco's modules load everywhere the portal does. They are `define.amd` one layer
 * further in — necessary, never sufficient. What separates the routes is an editor having been
 * *created*: measured 0 on the control and 2 on the reproducer.
 *
 * A `readonly` fence is NOT one of these. `component/Markdown.mjs:515` hands those to HighlightJs
 * and emits `<pre class="hljs">`, so a page can carry a dozen code blocks and still instantiate no
 * editor — which is exactly what `guides/uibuildingblocks/DockLayoutsAdoption` does. Only a
 * `live-preview` fence builds a `code.LivePreview`, and that is what owns the editor.
 */
const MONACO_EDITOR = '.neo-monaco-editor';

/**
 * A diagram that actually RENDERED — not mermaid's own error graphic.
 *
 * ⚠️ A plain `.neo-mermaid svg` count cannot tell the two apart, and the previous version of this
 * arm used one. Measured against `dist/mermaid.mjs` in a browser: a fence with a syntax error makes
 * `mermaid.run()` reject AND still emits one svg, so counting svgs reports a broken fence as a
 * rendered one. The arm was not useless — the collision it was built for emitted ZERO svgs, so it
 * discriminated that — but it could not distinguish a correct render from an error graphic, which
 * is half of what it claims.
 *
 *   good fence  ->  aria-roledescription="flowchart-v2"  class="flowchart"
 *   bad fence   ->  aria-roledescription="error"         class=null
 *
 * `aria-roledescription` is the discriminator because mermaid sets it deliberately. Searching the
 * text for "error" does NOT work: it matches both, since the svg carries embedded CSS that contains
 * the word. That false discriminator is what measuring instead of guessing caught.
 */
const RENDERED_DIAGRAM = '.neo-mermaid svg:not([aria-roledescription="error"])';

const ROUTES = [{
    editors: true,
    name   : 'a live-preview route — Monaco BUSY, the state the collision needs',
    source : '/learn/tutorials/DockLayoutsFirstLayout.md',
    url    : '/apps/portal/index.html#/learn/tutorials/DockLayoutsFirstLayout'
}, {
    editors: false,
    name   : 'a diagram-only route — Monaco loaded but idle (control)',
    source : '/learn/guides/uibuildingblocks/DockLayouts.md',
    url    : '/apps/portal/index.html#/learn/guides/uibuildingblocks/DockLayouts'
}];

test.describe('learn guide mermaid rendering', () => {
    for (const route of ROUTES) {
        test(`every diagram renders on ${route.name}`, async ({page, request}) => {
            // Derived from the SAME markdown the page renders, rather than pinned to a number.
            //
            // Both alternatives are worse in a way this arm has already been bitten by. A hardcoded
            // count reds on an ordinary content edit. Asserting "every container holds an svg"
            // reds on nothing when a fence is DELETED — and it also mis-reports, because each
            // diagram is two NESTED `.neo-mermaid` divs around one svg, so counting containers
            // reads 4 where the page shows 2.
            const markdown = await (await request.get(route.source)).text(),
                  expected = (markdown.match(/^```mermaid/gm) || []).length;

            expect(expected, `${route.source} must author a mermaid fence for this arm to mean anything`).toBeGreaterThan(0);

            await page.goto(route.url);

            // Auto-waits: an empty article makes every locator below match nothing and pass vacuously.
            await expect(page.locator('.neo-app-content-component').locator('h1')).toBeVisible();

            // The precondition, asserted BEFORE the diagram assertion rather than assumed — so a
            // route that stops instantiating editors fails HERE, rather than passing by having
            // removed the very conflict this arm exists to reproduce.
            if (route.editors) {
                await expect(page.locator(MONACO_EDITOR).first(), 'this arm is meaningless without an instantiated editor on the page').toBeVisible()
            } else {
                await expect(page.locator(MONACO_EDITOR), 'the control arm must NOT instantiate one').toHaveCount(0)
            }

            // Rendering is async and staggered — poll for the settled count rather than sampling it,
            // or a mid-render read reports a partial failure that is not one.
            await expect.poll(() => page.locator(RENDERED_DIAGRAM).count(), {
                message: `every mermaid fence in ${route.source} must reach the reader as an SVG`,
                timeout: 30000
            }).toBe(expected)
        })
    }
});

/**
 * @summary AC-2's second control: a fence the author got WRONG must fail the check.
 *
 * The route arms above assert that every authored fence renders. On their own they cannot separate
 * "the renderer works" from "the renderer renders nothing" — the condition that shipped once
 * already — so this drives a deliberate syntax error through the same addon and asserts the check
 * reports it as unrendered. Without it, `RENDERED_DIAGRAM` is an untested predicate.
 *
 * It also covers the author-facing half: `main.addon.Mermaid#render` awaits `mermaid.run`, so a
 * parse failure reaches its `catch` and the message reaches the page. Un-awaited it did not, and the
 * `Mermaid Error` div was unreachable code.
 */
test.describe('mermaid render verification — both controls', () => {
    test('a correct fence counts as rendered and a syntax error does NOT', async ({page}) => {
        // The control route, so the addon has really loaded through its own lazy path rather than
        // being poked before `loadFiles` ran — `this.mermaid` would be null and BOTH cases would
        // fail identically, which is a control that cannot fail.
        await page.goto(ROUTES[1].url);
        await expect(page.locator('.neo-app-content-component').locator('h1')).toBeVisible();
        await expect.poll(() => page.locator(RENDERED_DIAGRAM).count()).toBeGreaterThan(0);

        // `RENDERED_DIAGRAM` is passed IN rather than restated. Hardcoding the selector here made
        // the arm independent of the constant it exists to witness: mutating the constant left this
        // green, which is the duplicate-predicate trap with the third copy in the test oracle.
        const outcome = await page.evaluate(async selector => {
            const addon = Neo.main.addon.Mermaid,
                  make  = id => {
                      const el = document.createElement('div');

                      el.className = 'neo-mermaid';
                      el.id        = id;
                      document.body.appendChild(el);
                      return el
                  },
                  count = (id, css) => document.getElementById(id).querySelectorAll(css).length;

            make('probe-good');
            make('probe-bad');

            const raw = make('probe-raw');

            await addon.render({id: 'probe-good', code: 'graph TD;\n  A-->B;'});
            await addon.render({id: 'probe-bad',  code: 'graph TD;\n  A--@@>>B[[[unclosed'});

            // Straight through the library, BYPASSING the addon's catch, so mermaid's own error
            // graphic survives in the DOM. That graphic is the only thing that can witness the
            // selector: once the addon reports the failure as text there is no svg left to exclude.
            raw.textContent = 'graph TD;\n  A--@@>>B[[[unclosed';

            try {
                await addon.mermaid.run({nodes: [raw]})
            } catch (error) {
                // Expected: the parse error. The DOM it left behind is the measurement.
            }

            return {
                good        : count('probe-good', selector),
                bad         : count('probe-bad',  selector),
                badReport   : document.getElementById('probe-bad').textContent.includes('Mermaid Error'),
                rawAnySvg   : count('probe-raw', 'svg'),
                rawRendered : count('probe-raw', selector)
            }
        }, RENDERED_DIAGRAM.replace('.neo-mermaid ', ''));

        expect(outcome.good, 'a correct fence renders').toBe(1);
        expect(outcome.bad,  'and a syntax error is NOT counted as rendered — the control the route arms lack').toBe(0);
        expect(outcome.badReport, 'and the author is told why, at the point of authoring').toBe(true);

        // The selector itself, witnessed: mermaid's error graphic IS an svg and must not count.
        expect(outcome.rawAnySvg,  'mermaid emits an svg even for a parse error').toBe(1);
        expect(outcome.rawRendered, 'and the selector excludes it — a plain svg count cannot').toBe(0)
    })
});
