import {test, expect} from '@playwright/test';

/**
 * The splitter's affordance, measured on a rendered splitter rather than on stylesheet text.
 *
 * The sibling `dockSplitterLayering.spec.mjs` censuses SCSS source: it proves no application
 * stylesheet paints a splitter and that the engine's identity slots ship empty. That is the
 * ownership question. It cannot answer the one this ticket is actually about — whether a consumer
 * that sets nothing gets a *findable* drag target — because a source guard sees declarations, not
 * resolved values, and the reported defect was a splitter whose declarations all existed and
 * resolved to nothing a user could see.
 *
 * **The controls are the point.** Every arm asserts an exact token-derived value (`36px`, `2px`)
 * rather than "not zero", and pairs each measurement with a probe that must move when the token
 * moves. A stylesheet that failed to load cannot produce 36px by accident, and a value identical
 * before and after an override proves the override never arrived — which is the shape a
 * comfortable green takes here.
 *
 * @see https://github.com/neomjs/neo/issues/17538
 */

const THEMES = ['neo-theme-neo-dark', 'neo-theme-neo-light'];

let dashboardId, splitterId;

test.beforeEach(async ({page}) => {
    await page.goto('test/playwright/component/apps/dock-splitter/index.html');
    await page.waitForSelector('#dock-splitter-test-viewport', {state: 'attached'});

    const ids = await page.evaluate(async () => {
        // The REAL dashboard container, not a plain one wearing `.neo-dashboard`. Neo loads a
        // class's stylesheet when the class is instantiated, so faking the ancestor class leaves
        // `src/dashboard/Container.css` — the file carrying every rule under test — out of the
        // document entirely, and each arm below then measures an unstyled div.
        const dashboard = await Neo.worker.App.createNeoInstance({
            importPath: '../dashboard/Container.mjs',
            // `createNeoInstance` imports the module but resolves the class through the ntype
            // registry — a config without one reaches `parent.add()` with nothing to construct.
            ntype   : 'dashboard',
            parentId: 'dock-splitter-test-viewport'
        });

        if (!dashboard.success) throw new Error(`dashboard: ${dashboard.error.message}`);

        const splitter = await Neo.worker.App.createNeoInstance({
            importPath : '../dashboard/DockSplitter.mjs',
            ntype      : 'dashboard-dock-splitter',
            orientation: 'horizontal',
            parentId   : dashboard.id
        });

        if (!splitter.success) throw new Error(`splitter: ${splitter.error.message}`);

        return {dashboardId: dashboard.id, splitterId: splitter.id}
    });

    ({dashboardId, splitterId} = ids);

    await page.waitForSelector('.neo-dashboard-dock-splitter', {state: 'attached'})
});

test.afterEach(async ({page}) => {
    await page.evaluate(async ids => {
        for (const id of ids) id && await Neo.worker.App.destroyNeoInstance(id)
    }, [splitterId, dashboardId])
});

/** Swap the active theme class on the document element and read back what took effect. */
const applyTheme = (page, theme) => page.evaluate(name => {
    for (const el of [document.body, document.documentElement]) {
        el.classList.forEach(c => c.startsWith('neo-theme-') && el.classList.remove(c))
    }

    document.body.classList.add(name);

    return document.body.className
}, theme);

test.describe('Neo.dashboard.DockSplitter — the rendered affordance floor', () => {
    for (const theme of THEMES) {
        test(`a consumer that sets NO tokens gets a findable splitter — ${theme}`, async ({page}) => {
            await applyTheme(page, theme);

            const measured = await page.evaluate(() => {
                const splitter = document.querySelector('.neo-dashboard-dock-splitter'),
                      band     = getComputedStyle(splitter),
                      handle   = getComputedStyle(splitter, '::after');

                // A plain div in the same document and theme, with no dock class. It fixes what
                // "unpainted" computes to here, so the band's value is read against a real zero
                // rather than an assumption about how this browser serialises transparency.
                const control = document.createElement('div');

                document.body.appendChild(control);

                const result = {
                    bandBackground   : band.backgroundColor,
                    controlBackground: getComputedStyle(control).backgroundColor,
                    handleBackground : handle.backgroundColor,
                    handleContent    : handle.content,
                    handleHeight     : handle.height,
                    handleWidth      : handle.width
                };

                control.remove();

                return result
            });

            // The invisible-splitter defect stated as a measurement: before the promotion the engine
            // declared no paint at all, so this value WAS the control's value.
            expect(measured.bandBackground,
                'the engine floor must paint a band a consumer can see')
                .not.toBe(measured.controlBackground);

            // The handle exists as a real box, at exactly the token defaults. Asserting the exact
            // 36/2 pair rather than "non-zero" is what makes an unloaded stylesheet impossible to
            // mistake for a pass — nothing else in the document produces that pair.
            expect(measured.handleContent, 'the grab handle is rendered').toBe('""');
            expect(measured.handleHeight, 'the long axis is --dock-splitter-handle-size').toBe('36px');
            expect(measured.handleWidth, 'the short axis is --dock-splitter-handle-thickness').toBe('2px');
            expect(measured.handleBackground,
                'and the handle is painted, not merely present').not.toBe('rgba(0, 0, 0, 0)')
        })
    }

    test('the ACTIVE handle colour comes from the engine token an app sets', async ({page}) => {
        await applyTheme(page, 'neo-theme-neo-dark');

        // The rendered half of RA-2. Before this change the engine had `--dock-splitter-handle-color`
        // and `-hover` but no `-active`, so an app wanting a distinct drag colour had nowhere to put
        // it except `&:active::after { background: ... }` in its own stylesheet — precisely the
        // app-layer paint this promotion exists to end. If the engine consumer is missing, the token
        // has no effect and `withToken` below equals `withoutToken`.
        await page.evaluate(() => {
            // The engine rule TRANSITIONS `background`. Reading straight after a state change
            // returns the start value and a frame later returns a blend — both green-looking wrong
            // answers, and a fixed sleep would only make the flake slower.
            const freeze = document.createElement('style');

            freeze.id          = 'freeze-transitions';
            freeze.textContent = '*, *::after, *::before { transition: none !important }';
            document.head.appendChild(freeze)
        });

        const box = await page.locator('.neo-dashboard-dock-splitter').boundingBox();

        const activeHandle = async () => {
            await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
            await page.mouse.down();

            const value = await page.evaluate(() => {
                const el = document.querySelector('.neo-dashboard-dock-splitter');

                return {
                    handle  : getComputedStyle(el, '::after').backgroundColor,
                    isActive: el.matches(':active')
                }
            });

            await page.mouse.up();

            return value
        };

        const withoutToken = await activeHandle();

        // Shaped the way a consuming app writes one: the token lands on the SPLITTER's own selector
        // under an app-root class, which is what `Workspace.scss` and `FleetCockpit.scss` both do.
        // Setting it on an ancestor instead would test a mechanism no app uses — and would not even
        // work, because the engine re-declares its token defaults on every `.neo-dashboard`.
        await page.evaluate(() => {
            const style = document.createElement('style');

            style.textContent =
                '.test-app-a .neo-dashboard-dock-splitter { --dock-splitter-handle-color-active: rgb(255, 0, 0) }';
            document.head.appendChild(style);
            document.querySelector('.neo-dashboard').classList.add('test-app-a')
        });

        const withToken = await activeHandle();

        // Precondition: without a live `:active` both reads return the resting value for a reason
        // that has nothing to do with the token, and the comparison below is vacuous.
        expect(withoutToken.isActive, 'precondition: the pointer press must put the splitter in :active').toBe(true);
        expect(withToken.isActive, 'precondition: and again for the second read').toBe(true);

        expect(withToken.handle, 'the app token must reach the active handle').toBe('rgb(255, 0, 0)');
        expect(withoutToken.handle,
            'and the engine floor must differ from it — equal values would mean the token never arrived')
            .not.toBe(withToken.handle)
    });

    test('the flat opt-out collapses the handle and keeps the band', async ({page}) => {
        await applyTheme(page, 'neo-theme-neo-light');

        // `--dock-splitter-handle-size: 0` is a design statement that greps, not an omission. It
        // must remove the HANDLE without removing the affordance: a consumer opting out of the grip
        // still gets a visible band, or the opt-out would silently re-ship the invisible-splitter
        // defect this floor exists to end.
        const measured = await page.evaluate(() => {
            const splitter = document.querySelector('.neo-dashboard-dock-splitter'),
                  read     = () => ({
                      band  : getComputedStyle(splitter).backgroundColor,
                      handle: getComputedStyle(splitter, '::after').height
                  });

            const before = read(),
                  style  = document.createElement('style');

            style.textContent =
                '.test-app-fm .neo-dashboard-dock-splitter { --dock-splitter-handle-size: 0 }';
            document.head.appendChild(style);
            document.querySelector('.neo-dashboard').classList.add('test-app-fm');

            const after = read();

            style.remove();

            return {before, after}
        });

        expect(measured.before.handle, 'precondition: the handle was there to opt out of').toBe('36px');
        expect(measured.after.handle, 'the opt-out collapses the handle').toBe('0px');
        expect(measured.after.band, 'and the band survives it — flat is not invisible')
            .toBe(measured.before.band)
    })
});
