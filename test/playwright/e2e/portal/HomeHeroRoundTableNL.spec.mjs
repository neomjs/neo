import {expect, test} from '../../fixtures.mjs';

const
    HOME_URL  = '/apps/portal/index.html#/home',
    STATEMENT = {
        buttons : '.portal-home-hero-content .button-group',
        headline: '.portal-home-hero-content .neo-magic-move-text',
        logo    : '.portal-home-hero-content .logo-container',
        sentence: '.portal-home-hero-content .neo-h3'
    };

/**
 * @summary Opens the home at a size and answers the hero canvas's host: its id and a reader of the renderer's stats.
 * @param {import('@playwright/test').Page} page
 * @param {Object} neuralLink
 * @param {Object} viewport `{width, height}`
 * @returns {Promise<{read: Function, setRecord: Function}>}
 */
async function openHero(page, neuralLink, viewport) {
    await page.setViewportSize(viewport);
    await page.goto(HOME_URL);

    const app = await neuralLink.connectToApp('Portal');

    let id;

    // the app answers before the home's views exist
    await expect.poll(async () => {
        const hit = await app.queryComponent({className: 'Portal.view.home.parts.hero.Canvas'}, ['id']);

        return (id = (Array.isArray(hit) ? hit[0] : hit)?.id) ?? null
    }, {timeout: 20000}).not.toBeNull();

    return {
        read     : () => app.callMethod(id, 'readStats', []),
        setRecord: record => app.callMethod(id, 'set', [{record}])
    }
}

/**
 * @summary The scene's boxes that touch a box of the statement, in viewport pixels: a seat with its name, or the strip.
 * @param {import('@playwright/test').Page} page
 * @param {Object} stats The renderer's stats
 * @returns {Promise<String[]>} `<scene box> over <statement part>` each
 */
async function touching(page, stats) {
    const dom = await page.evaluate(selectors => {
        const rect = selector => {
            const node = document.querySelector(selector);

            if (!node) return null;

            const {height, left, top, width} = node.getBoundingClientRect();

            return [left, top, width, height]
        };

        return {canvas: rect('.portal-home-hero-canvas'), parts: Object.entries(selectors).map(([name, selector]) => [name, rect(selector)])}
    }, STATEMENT);

    const [left, top] = dom.canvas,
          scene       = [
              ...(stats.seats || []).map(seat => [seat.name, seat.box]),
              ...(stats.strip ? [['strip', stats.strip]] : [])
          ];

    return scene.flatMap(([name, box]) => dom.parts
        .filter(([, part]) => part && box[0] + left < part[0] + part[2] && box[0] + left + box[2] > part[0] && box[1] + top < part[1] + part[3] && box[1] + top + box[3] > part[1])
        .map(([part]) => `${name} over ${part}`))
}

test.describe('Portal home hero: the round table stands around the statement (Neural Link)', () => {
    for (const [viewport, mode] of [[{height: 900, width: 1440}, 'table'], [{height: 800, width: 1440}, 'table'], [{height: 700, width: 900}, 'strip'], [{height: 844, width: 390}, 'strip']]) {
        test(`at ${viewport.width}x${viewport.height} the ${mode} draws the record and touches no part of the statement`, async ({neuralLink, page}) => {
            const {read} = await openHero(page, neuralLink, viewport);

            let stats;

            // the statement is measured again once the web font has wrapped its lines
            await expect.poll(async () => {
                stats = await read();

                return stats?.mode === mode && stats.items > 0 ? touching(page, stats) : ['not drawn yet']
            }, {timeout: 20000}).toEqual([]);

            expect(stats.record).toBe(true);
            expect(stats.strip, 'the strip stands at every size').not.toBeNull();
            expect(stats.strip[1] + stats.strip[3], 'inside the canvas').toBeLessThanOrEqual(stats.size.height);

            // where the surface is tall enough, the strip leaves the bottom its room
            viewport.height === 900 && expect(stats.size.height - stats.strip[1] - stats.strip[3], 'the room below the strip').toBe(48);

            // a snapping screen shows the hero whole: the canvas grows with an overflowing hero, so measure the scroller
            viewport.width > 840 && expect(await page.evaluate(() =>
                document.querySelector('.portal-home-hero-container').getBoundingClientRect().height -
                document.querySelector('.portal-home-maincontainer').clientHeight
            ), 'the hero fits its snapping screen').toBeLessThanOrEqual(1);

            if (mode === 'table') {
                expect(stats.seats.map(seat => seat.kind).filter(kind => kind === 'merge')).toHaveLength(1);
                expect(stats.seats.filter(seat => seat.kind === 'seat').length, 'the maintainers').toBeGreaterThan(1)
            } else {
                expect(stats.seats).toBeNull()
            }
        })
    }

    test('a dense day still draws below the phone statement', async ({neuralLink, page}) => {
        await page.emulateMedia({reducedMotion: 'reduce'});
        const {read, setRecord} = await openHero(page, neuralLink, {height: 844, width: 390});
        await expect.poll(async () => (await read())?.record).toBe(true);
        await page.evaluate(() => document.fonts.ready);

        const items = Array.from({length: 100}, (_, i) => [i + 1, 'Example item', 0, null, i, i + 1, []]);
        await setRecord({
            caption: 'Dense test week', from: '2020-01-01T00:00:00Z', groups: [], items,
            seats  : [{id: 'test', kind: 'seat', name: 'Test'}], to: '2020-01-08T00:00:00Z', version: 1
        });

        let stats;
        await expect.poll(async () => (stats = await read())?.items).toBe(items.length);
        expect(stats).toMatchObject({landed: items.length, mode: 'strip', seats: null, still: true});
        expect(await touching(page, stats)).toEqual([]);
        expect(stats.strip[1] + stats.strip[3]).toBeLessThanOrEqual(stats.size.height)
    });

    test.describe('at a pixel ratio of 2', () => {
        test.use({deviceScaleFactor: 2});

        test('the replay runs: frames follow each other and the clock moves', async ({neuralLink, page}) => {
            const {read} = await openHero(page, neuralLink, {height: 900, width: 1440});

            let first;

            await expect.poll(async () => (first = await read())?.mode ?? null, {timeout: 20000}).toBe('table');
            expect(first.still).toBe(false);

            await expect.poll(async () => {
                const next = await read();

                return next.frames > first.frames + 10 && next.clock !== first.clock
            }, {timeout: 10000}).toBe(true);

            // what a frame costs on this machine, for the record of a run: no arm asserts a duration
            test.info().annotations.push({description: `${(await read()).cost.toFixed(2)} ms`, type: 'frame cost at 1440x900, pixel ratio 2'})
        })
    });

    test('the visible header and round table follow live motion changes without reloading', async ({neuralLink, page}) => {
        await page.emulateMedia({reducedMotion: 'reduce'});

        const {read} = await openHero(page, neuralLink, {height: 900, width: 1440}),
              header = page.locator('.app-header-canvas');

        let stats, frames = -1;

        await expect.poll(async () => (stats = await read())?.mode ?? null, {timeout: 20000}).toBe('table');

        expect(stats.still).toBe(true);
        expect(stats.landed, 'every pull request has landed').toBe(stats.items);

        // two reads in a row see the same frame count once the last input has arrived
        await expect.poll(async () => {
            const {frames: now} = await read(), same = now === frames;

            frames = now;
            return same
        }, {intervals: [300, 300, 300, 500], timeout: 10000}).toBe(true);

        await page.emulateMedia({reducedMotion: 'no-preference'});
        await expect.poll(async () => {
            const next = await read();
            return !next.still && next.frames > frames
        }).toBe(true);
        const moving = await header.screenshot();
        await expect.poll(async () => moving.equals(await header.screenshot())).toBe(false);

        await page.emulateMedia({reducedMotion: 'reduce'});
        await expect.poll(async () => (await read()).still).toBe(true);
        await expect.poll(async () => {
            const first = await header.screenshot();
            return first.equals(await header.screenshot())
        }).toBe(true)
    })
});
