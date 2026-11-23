import {expect, test} from '../../fixtures.mjs';

const asArray = value => Array.isArray(value) ? value : [value];

/**
 * @summary Whitebox browser e2e for multi-column + header-group `responsiveLockPolicy` viewport resizes.
 */
test.describe('Grid responsiveLockPolicy multi-column resize (Neural Link)', () => {
    test('resizing across a multi-column + header-group breakpoint keeps target regions intact without duplicate bodies', async ({page, neuralLink}) => {
        await page.setViewportSize({width: 1600, height: 800});
        await page.goto('/examples/grid/headerGroups/index.html');
        await expect(page.locator('.neo-grid-header-group-cell')).toHaveCount(5);

        const app  = await neuralLink.connectToApp('Neo.examples.grid.headerGroups'),
              grid = asArray(await app.queryComponent({className: 'Neo.grid.Container'}, ['id']))[0];

        await page.evaluate(() => {
            Neo.config.logDeltaUpdates       = true;
            Neo.config.useDeltaGrammarGuards = true;
            window.__idlessInserts           = 0;
            window.__deltaGrammarErrors      = 0;
            window.__deltaGrammarDetails     = [];

            const origLog = console.log.bind(console);
            console.log = (...args) => {
                if (typeof args[0] === 'string' && args[0].startsWith('update ')) {
                    const data   = args[3],
                          deltas = Array.isArray(data) ? data : (data?.deltas || []);

                    for (const d of deltas) {
                        if (d.action === 'insertNode' && !d.id && !d.vnode?.id) {
                            window.__idlessInserts++
                        }
                    }
                }
                origLog(...args)
            };

            const origErr = console.error.bind(console);
            console.error = (...args) => {
                if (args[0] === 'Delta grammar validation failed') {
                    window.__deltaGrammarErrors++;
                    window.__deltaGrammarDetails.push(args[1]?.findings)
                }
                origErr(...args)
            }
        });

        await app.setProperties(grid.id, {
            responsiveLockPolicy: {
                breakpoints: [
                    {maxWidth: 900,  columns: {region: null,    jan: null,    total: null}},
                    {maxWidth: 2400, columns: {region: 'start', jan: 'start', total: 'end'}}
                ]
            }
        });

        const snapshot = () => page.evaluate(() => {
            const root     = document.querySelector('.neo-grid-container'),
                  bodies   = [...root.querySelectorAll('.neo-grid-body')],
                  toolbars = [...root.querySelectorAll('.neo-grid-header-toolbar')],
                  seen     = new Set(),
                  dups     = [];

            root.querySelectorAll('[id]').forEach(el => {
                if (seen.has(el.id)) dups.push(el.id);
                seen.add(el.id)
            });

            return {
                bodyCount    : bodies.length,
                toolbarCount : toolbars.length,
                dups         : dups.slice(0, 10),
                idless       : window.__idlessInserts,
                guardErrors  : window.__deltaGrammarErrors,
                guardDetails : window.__deltaGrammarDetails,
                toolbarFields: toolbars.map(tb =>
                    [...tb.querySelectorAll('.neo-grid-header-button')].map(btn => btn.textContent.trim())
                ),
                bodyFields   : bodies.map(body => {
                    const row = body.querySelector('.neo-grid-row');
                    return row ? [...row.querySelectorAll('.neo-grid-cell[data-field]')].map(c => c.dataset.field) : []
                })
            }
        });

        // 1. Trigger wide breakpoint (1580px <= 2400px): `region` + `Q1` (`jan`, `feb`, `mar`) locked start, `Year` (`total`) locked end
        await page.setViewportSize({width: 1580, height: 800});
        await expect.poll(async () => (await snapshot()).toolbarFields[0]).toEqual(['Region', 'Jan', 'Feb', 'Mar']);
        await expect.poll(async () => (await snapshot()).bodyFields[0]).toEqual(['region', 'jan', 'feb', 'mar']);

        let state = await snapshot();
        expect(state.bodyCount, 'wide: exactly 3 region bodies').toBe(3);
        expect(state.toolbarCount, 'wide: exactly 3 header toolbars').toBe(3);
        expect(state.toolbarFields[2], 'wide: Year stays in end toolbar').toEqual(['Total']);
        expect(state.bodyFields[2], 'wide: total renders in end body').toEqual(['total']);
        expect(state.dups, 'wide: zero duplicate DOM ids').toEqual([]);
        expect(state.idless, 'wide: zero id-less insertNode deltas').toBe(0);
        expect(state.guardErrors, `wide: zero delta-grammar errors ${JSON.stringify(state.guardDetails)}`).toBe(0);

        // 2. Resize across compact breakpoint (800px <= 900px): unlocks `region`, `Q1` (`jan`, `feb`, `mar`), and `total` together
        await page.setViewportSize({width: 800, height: 800});
        await expect.poll(async () => (await snapshot()).bodyCount).toBe(1);

        state = await snapshot();
        expect(state.toolbarCount, 'compact: single center header toolbar').toBe(1);
        expect(state.toolbarFields[0].slice(0, 5), 'compact: region + Q1 leaves in center toolbar').toEqual(['Region', 'Jan', 'Feb', 'Mar', 'Apr']);
        expect(state.bodyFields[0].slice(0, 5), 'compact: region + Q1 cells in center body').toEqual(['region', 'jan', 'feb', 'mar', 'apr']);
        expect(state.dups, 'compact: zero duplicate DOM ids').toEqual([]);
        expect(state.idless, 'compact: zero id-less insertNode deltas').toBe(0);
        expect(state.guardErrors, `compact: zero delta-grammar errors ${JSON.stringify(state.guardDetails)}`).toBe(0);

        // 3. Resize back across wide breakpoint (1600px <= 2400px): re-locks `region` + `Q1` to start and `total` to end together
        await page.setViewportSize({width: 1600, height: 800});
        await expect.poll(async () => (await snapshot()).bodyCount).toBe(3);
        await expect.poll(async () => (await snapshot()).bodyFields[0]).toEqual(['region', 'jan', 'feb', 'mar']);
        await expect.poll(async () => (await snapshot()).bodyFields[2]).toEqual(['total']);

        state = await snapshot();
        expect(state.toolbarCount, 're-locked: exactly 3 header toolbars').toBe(3);
        expect(state.toolbarFields[0], 're-locked: region + Q1 leaves in start toolbar').toEqual(['Region', 'Jan', 'Feb', 'Mar']);
        expect(state.toolbarFields[2], 're-locked: total in end toolbar').toEqual(['Total']);
        expect(state.dups, 're-locked: zero duplicate DOM ids').toEqual([]);
        expect(state.idless, 're-locked: zero id-less insertNode deltas').toBe(0);
        expect(state.guardErrors, `re-locked: zero delta-grammar errors ${JSON.stringify(state.guardDetails)}`).toBe(0);

        const bodies = asArray(await app.findInstances({ntype: 'grid-body'}, ['id']));
        for (const b of bodies) {
            const id     = b.id || b.properties?.id,
                  c      = await app.verifyComponentConsistency(id),
                  counts = c?.counts || c?.result?.counts || {};

            expect(counts.dom, `${id}: DOM children match VDOM children`).toBe(counts.vdom)
        }
    })
});
