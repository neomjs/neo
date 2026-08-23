import {test, expect} from '../../fixtures.mjs';

/**
 * @summary Proven on the MOUNTED cockpit: **focus order IS DOM order**.
 *
 * The invariant holds iff no `tabindex > 0` exists in the rendered tree. A positive tabindex pulls its
 * element to the front of the tab sequence regardless of where it sits in the document, so a single one
 * silently detaches keyboard order from visual order — the classic a11y trap, and the one thing that
 * would make this cockpit's "no explicit tab topology, just DOM order" design a lie.
 *
 * **Why this is an e2e and not a source grep.** A grep of `FleetCockpit.mjs` for `tabIndex` would be a
 * guard aimed at a *filename*: any composed component can introduce a tabindex from its own config, a
 * mixin, or a framework default without the shell's source ever containing the string. The claim is
 * about the rendered tree, so the witness has to walk the rendered tree.
 *
 * **Why it asserts the invariant and not a tab SEQUENCE.** The old AC asked for
 * `grid → card → controls → stream → rails`. Dock zones are document-driven — `resolveDockComponentRef`
 * resolves each `componentRef` at runtime from `cockpitDockDocument` — so pinning an expected sequence
 * would pin a *layout preset*: red on every preset change, silent on every real regression. The
 * invariant is preset-independent; the sequence never was.
 *
 * The `scanned` assertion is not decoration: a walk that reaches an empty tree also finds no tabindex,
 * so without proof the tree was really there, "no overrides" is a vacuous pass.
 *
 * @see apps/agentos/view/fleet/cockpit/Container.mjs
 * @see apps/agentos/util/CockpitDockDocument.mjs
 * @see test/playwright/e2e/agentos/FleetGridKeyboardA11y.spec.mjs — AC2(b)/(d), the drill path
 * @see test/playwright/unit/apps/agentos/cockpitDockDocument.spec.mjs — AC2(c), the autoHidden zones
 */
test.describe('AgentOS FM cockpit — focus order IS DOM order (#14619 AC2a)', () => {
    test.setTimeout(90000);

    test('no tabindex > 0 anywhere in the mounted shell, and the shell is genuinely keyboard-reachable', async ({page}) => {
        const pageErrors = [];
        page.on('pageerror', err => pageErrors.push(err.message));

        await page.goto('/apps/agentos/index.html');
        await expect(page.locator('.agent-shell')).toBeVisible({timeout: 60000});
        await expect(page.locator('.fm-fleet-grid')).toBeVisible({timeout: 30000});

        const audit = await page.evaluate(() => {
            const shell    = document.querySelector('.agent-shell'),
                  all      = [...shell.querySelectorAll('*')],
                  tabbable = ['a[href]', 'button', 'input', 'select', 'textarea', '[tabindex]']
                      .flatMap(sel => [...shell.querySelectorAll(sel)]);

            return {
                scanned  : all.length,
                focusable: new Set(tabbable).size,
                // every explicit tabindex, with enough identity to name the offender in the failure
                tabIndexed : all
                    .filter(el => el.hasAttribute('tabindex'))
                    .map(el => ({
                        tag  : el.tagName.toLowerCase(),
                        cls  : (typeof el.className === 'string' ? el.className : '').trim().slice(0, 60),
                        value: el.getAttribute('tabindex')
                    }))
            }
        });

        // the positive controls: an empty tree, or a tree with nothing tabbable, would pass the
        // invariant below while proving nothing at all
        expect(audit.scanned, 'the walk must reach a real mounted tree — otherwise "no overrides" is vacuous')
            .toBeGreaterThan(50);
        expect(audit.focusable, 'a cockpit with zero focusable elements is not keyboard-drivable')
            .toBeGreaterThan(0);

        // the invariant itself: tabindex 0 / -1 are fine (they opt in / out without reordering);
        // ONLY a positive value detaches focus order from DOM order
        const reordering = audit.tabIndexed.filter(entry => Number(entry.value) > 0);

        expect(reordering, 'a tabindex > 0 detaches keyboard order from visual order — the cockpit has no explicit tab topology, so DOM order must BE the topology')
            .toEqual([]);

        expect(pageErrors, 'the cockpit must mount clean').toEqual([])
    })
});
