import {expect, test}                   from '../../fixtures.mjs';
import {readComponentRects, withinRect} from '../utils/dockGeometry.mjs';

const HOME_URL  = '/apps/portal/index.html#/home';
const HERO_COPY = 'Neo.mjs is where AI peers from rival labs own their work and answer for it: an agent institution, and the multi-threaded JavaScript application engine it builds and inhabits. Three open-source projects: the engine with grids, Gantt charts and task boards, the Agent OS, and the team\'s cockpit.';

/**
 * Queries a single component through the Neural Link bridge and normalizes array vs object replies.
 * @param {Object} app
 * @param {Object} selector
 * @param {String[]} [properties=['id', 'className', 'mounted']]
 * @returns {Promise<Object|null>}
 */
async function queryOne(app, selector, properties = ['id', 'className', 'mounted']) {
    const matches = await app.queryComponent(selector, properties);

    if (Array.isArray(matches)) {
        return matches[0] || null
    }

    return matches?.id ? matches : null
}

/**
 * Waits until a smooth scroll on the Home container settles at a stage whose top aligns with the scroller.
 * @param {import('@playwright/test').Page} page
 * @param {String} homeId
 * @param {String} targetId
 */
async function waitForStageTop(page, homeId, targetId) {
    await expect.poll(async () => {
        return page.evaluate(({scrollerId, partId}) => {
            const scroller = document.getElementById(scrollerId);
            const part     = document.getElementById(partId);

            if (!scroller || !part) {
                return false
            }

            const rect         = part.getBoundingClientRect();
            const scrollerRect = scroller.getBoundingClientRect();

            return Math.abs(rect.top - scrollerRect.top) <= 4
        }, {scrollerId: homeId, partId: targetId})
    }, {timeout: 10000}).toBe(true)
}

/**
 * Waits until scroll motion on the Home container has settled across two samples.
 * @param {import('@playwright/test').Page} page
 * @param {String} homeId
 */
async function waitForScrollSettled(page, homeId) {
    let previousTop = null;

    await expect.poll(async () => {
        const currentTop = await page.locator(`#${homeId}`).evaluate(el => Math.round(el.scrollTop));
        const settled    = previousTop !== null && currentTop === previousTop;

        previousTop = currentTop;
        return settled
    }, {intervals: [100, 100, 150], timeout: 10000}).toBe(true)
}

/**
 * Waits until Portal Home's dynamically injected theme/part stylesheets and web fonts have settled
 * so smooth scrollIntoView targets post-swap Hero geometry rather than fallback font line-wrapping.
 * @param {import('@playwright/test').Page} page
 */
async function waitForHomeStylesAndFonts(page) {
    await expect.poll(async () => {
        return page.evaluate(() => {
            const heroCopy  = document.querySelector('.portal-home-hero-content .neo-h3');
            const heroTitle = document.querySelector('.portal-home-hero-content .neo-h1');
            const doors     = document.querySelector('.portal-home-parts-audiencedoors');

            if (!heroCopy || !heroTitle || !doors) {
                return false
            }

            if (!getComputedStyle(heroCopy).fontFamily.includes('Source Sans 3')) {
                return false
            }

            const links = [...document.querySelectorAll('link[rel="stylesheet"]')];
            return links.length > 0 && links.every(link => Boolean(link.sheet))
        })
    }, {timeout: 10000}).toBe(true);

    await page.evaluate(() => document.fonts.ready)
}

/**
 * Smoothly scrolls the Home container to a referenced part and waits until scroll motion settles.
 * @param {import('@playwright/test').Page} page
 * @param {Object} app
 * @param {String} homeId
 * @param {String} reference
 * @param {String} targetId
 */
async function scrollHomeToReference(page, app, homeId, reference, targetId) {
    await waitForHomeStylesAndFonts(page);
    await app.callMethod(homeId, 'scrollToPart', [reference]);
    await waitForStageTop(page, homeId, targetId)
}

/**
 * @summary Whitebox Neural Link verification for the Portal Home AudienceDoors stage,
 * reference-based scroll routing, proof destinations, and responsive viewport geometry.
 */
test.describe('Portal Home AudienceDoors (Neural Link)', () => {
    test('renders audience doors in canonical order, resolves proof links, and routes all three CTAs', async ({page, neuralLink}) => {
        await page.setViewportSize({width: 1440, height: 900});
        await page.goto(HOME_URL);

        const app = await neuralLink.connectToApp('Portal');
        await expect(page.locator('.portal-home-parts-audiencedoors').getByRole('heading', {level: 2})).toHaveText('Who Neo.mjs Is For');

        const header    = await queryOne(app, {className: 'Portal.view.HeaderToolbar'});
        const home      = await queryOne(app, {className: 'Portal.view.home.MainContainer'});
        const hero      = await queryOne(app, {className: 'Portal.view.home.parts.hero.Content'});
        const doors     = await queryOne(app, {reference: 'home-audience-doors'});
        const bodyEntry = await queryOne(app, {reference: 'home-body-entry'});
        const planning  = await queryOne(app, {className: 'Portal.view.home.parts.Planning'});
        const agentOs   = await queryOne(app, {reference: 'home-agent-os'});

        expect(header?.id).toBeTruthy();
        expect(home?.id).toBeTruthy();
        expect(hero?.id).toBeTruthy();
        expect(planning?.id).toBeTruthy();
        expect(doors?.className).toBe('Portal.view.home.parts.AudienceDoors');
        expect(bodyEntry?.className).toBe('Portal.view.home.parts.Planning');
        expect(agentOs?.className).toBe('Portal.view.home.parts.AiToolchain');

        const doorBuild     = await queryOne(app, {reference: 'door-build'});
        const doorAgents    = await queryOne(app, {reference: 'door-agents'});
        const doorStudy     = await queryOne(app, {reference: 'door-study'});
        const doorBuildCta  = await queryOne(app, {reference: 'door-build-cta'}, ['id', 'text']);
        const doorAgentsCta = await queryOne(app, {reference: 'door-agents-cta'}, ['id', 'text']);
        const doorStudyCta  = await queryOne(app, {reference: 'door-study-cta'}, ['id', 'text', 'route']);

        expect(doorBuild?.id).toBeTruthy();
        expect(doorAgents?.id).toBeTruthy();
        expect(doorStudy?.id).toBeTruthy();
        expect(doorBuildCta?.properties?.text ?? doorBuildCta?.text).toBe('Explore the Engine');
        expect(doorAgentsCta?.properties?.text ?? doorAgentsCta?.text).toBe('Explore the Agent OS');
        await expect(page.locator(`#${doorBuildCta.id} .neo-button-glyph`)).toHaveClass(/fa-arrow-down/);
        await expect(page.locator(`#${doorAgentsCta.id} .neo-button-glyph`)).toHaveClass(/fa-arrow-down/);
        expect(doorStudyCta?.properties?.text ?? doorStudyCta?.text).toBe('Read What Is Neo.mjs?');
        await expect(page.locator(`#${doorStudyCta.id} .neo-button-glyph`)).toHaveClass(/fa-arrow-right/);
        expect(doorStudyCta?.properties?.route ?? doorStudyCta?.route).toBe('/learn/benefits/Introduction');

        const heroRoot  = page.locator(`#${hero.id}`);
        const doorsRoot = page.locator(`#${doors.id}`);

        await expect(heroRoot.locator('.neo-h3')).toHaveText(HERO_COPY);
        await expect(doorsRoot.getByRole('heading', {level: 2})).toHaveText('Who Neo.mjs Is For');
        await expect(doorsRoot.getByRole('heading', {level: 3})).toHaveText([
            'Build an application',
            'Run an agent team',
            'Study the model'
        ]);
        await expect(doorsRoot.locator('.portal-door-command code')).toHaveText([
            '$ npx neo-app@latest',
            'neo-agent-brain · neo-agent-institution',
            'MX · Two Hemispheres · Gated RSI'
        ]);

        const proofLinks = doorsRoot.locator('.portal-door-proof a');
        await expect(proofLinks).toHaveCount(3);

        const bigDataHref = await proofLinks.nth(0).getAttribute('href');
        const recordHref  = await proofLinks.nth(1).getAttribute('href');
        const essayHref   = await proofLinks.nth(2).getAttribute('href');

        expect(bigDataHref).toContain('examples/grid/bigData/index.html');
        expect(recordHref).toBe('/news/pulls/15123');
        expect(essayHref).toBe('/learn/benefits/Introduction');

        const bigDataUrl      = new URL(bigDataHref, page.url()).toString();
        const bigDataResponse = await page.request.get(bigDataUrl);
        expect(bigDataResponse.status()).toBe(200);

        const buildCtaEl  = page.locator(`#${doorBuildCta.id}`);
        const agentsCtaEl = page.locator(`#${doorAgentsCta.id}`);

        await expect(buildCtaEl).toHaveJSProperty('tagName', 'A');
        await expect(agentsCtaEl).toHaveJSProperty('tagName', 'A');
        await expect(buildCtaEl).toHaveClass(/portal-door-scroll-cta/);
        await expect(agentsCtaEl).toHaveClass(/portal-door-scroll-cta/);
        await expect(buildCtaEl).toHaveAttribute('href', `#${bodyEntry.id}`);
        await expect(agentsCtaEl).toHaveAttribute('href', `#${agentOs.id}`);
        expect(await buildCtaEl.getAttribute('target')).toBeNull();
        expect(await agentsCtaEl.getAttribute('target')).toBeNull();
        await expect(page.locator(`#${bodyEntry.id}`)).toHaveClass(/portal-home-parts-planning/);
        await expect(page.locator(`#${agentOs.id}`)).toHaveClass(/portal-home-parts-aitoolchain/);

        const initialHeaderHeight = await page.locator(`#${header.id}`).evaluate(el => el.getBoundingClientRect().height);

        // Scroll AudienceDoors into view and click Door 1 CTA -> Body entry stage while keeping #/home hash
        await scrollHomeToReference(page, app, home.id, 'home-audience-doors', doors.id);
        const doorsScrollTop = await page.locator(`#${home.id}`).evaluate(el => el.scrollTop);
        expect(doorsScrollTop).toBeGreaterThan(0);

        await buildCtaEl.click();
        await expect.poll(async () => {
            return page.locator(`#${home.id}`).evaluate(el => el.scrollTop)
        }, {timeout: 10000}).toBeGreaterThan(doorsScrollTop + 200);
        await expect(page.locator(`#${bodyEntry.id}`)).toBeInViewport();
        await waitForScrollSettled(page, home.id);
        await expect(page).toHaveURL(/\/home$/);

        // Return to AudienceDoors and click Door 2 CTA -> Agent OS Brain stage while keeping /home route
        await scrollHomeToReference(page, app, home.id, 'home-audience-doors', doors.id);
        await agentsCtaEl.click();
        await expect(page.locator(`#${agentOs.id}`)).toBeInViewport({timeout: 10000});
        await waitForScrollSettled(page, home.id);
        await expect(page.locator(`#${agentOs.id}`).getByRole('heading', {name: 'The Agent OS Brain'})).toBeVisible();
        await expect(page).toHaveURL(/\/home$/);

        // Embedded Viewport previews inside LivePreview must keep their theme scoped instead of hijacking document.body.
        // The home's own snippets mount no themed Viewport, so this witness hands one to a preview in tab mode.
        const previewId = await page.locator(`#${planning.id} .neo-code-live-preview`).getAttribute('id');
        expect(previewId).toBeTruthy();
        await app.setProperties(previewId, {activeView: 'source'});
        await app.setProperties(previewId, {value: [
            "import Viewport from '../container/Viewport.mjs';",
            "",
            "class MainView extends Viewport {",
            "    static config = {",
            "        className: 'Portal.view.ThemedPreview',",
            "        theme    : 'neo-theme-dark'",
            "    }",
            "}",
            "MainView = Neo.setupClass(MainView);"
        ].join('\n')});
        await app.setProperties(previewId, {activeView: 'preview'});
        await expect(page.locator(`#${planning.id} .neo-viewport.neo-theme-dark`)).toBeAttached({timeout: 15000});
        await expect(page.locator('body')).toHaveClass(/neo-theme-neo-dark/);
        await expect(page.locator('body')).not.toHaveClass(/(^|\s)neo-theme-dark(\s|$)/);
        expect(await page.locator(`#${header.id}`).evaluate(el => el.getBoundingClientRect().height)).toBe(initialHeaderHeight);

        // Return to AudienceDoors and click Door 3 CTA -> What Is Neo.mjs? guide
        await scrollHomeToReference(page, app, home.id, 'home-audience-doors', doors.id);
        await page.locator(`#${doorStudyCta.id}`).click();
        await expect(page).toHaveURL(/\/learn\/benefits\/Introduction$/);
        await expect(page.getByRole('heading', {level: 1, name: 'What Is Neo.mjs?'})).toBeVisible({timeout: 15000})
    });

    for (const viewport of [{width: 1440, height: 900}, {width: 390, height: 844}]) {
        test(`at ${viewport.width}x${viewport.height} the hero's second button is the cue and scrolls to the doors`, async ({page, neuralLink}) => {
            await page.setViewportSize(viewport);
            await page.goto(HOME_URL);

            const app = await neuralLink.connectToApp('Portal');
            await expect(page.locator('.portal-home-parts-audiencedoors').getByRole('heading', {level: 2})).toHaveText('Who Neo.mjs Is For');

            const doors   = await queryOne(app, {reference: 'home-audience-doors'}),
                  buttons = page.locator('.portal-home-hero-content .button-group .neo-button');

            // Screen 1 keeps two controls, the cue shows without a scroll, and the doors start below it
            await expect(buttons).toHaveText(['Get started', 'Who it\'s for']);
            await expect(buttons.last().locator('.neo-button-glyph')).toHaveClass(/fa-arrow-down/);
            await expect(buttons.last()).toBeInViewport();
            await expect(page.locator(`#${doors.id}`)).not.toBeInViewport();

            await buttons.last().click();
            await expect(page.locator(`#${doors.id}`)).toBeInViewport({timeout: 10000});
            await expect(page).toHaveURL(/\/home$/)
        })
    }

    for (const viewport of [{width: 1440, height: 900}, {width: 646, height: 844}]) {
        test(`at ${viewport.width}x${viewport.height} a keyboard visitor who takes the cue lands on the doors' header and stays there with Tab`, async ({page, neuralLink}) => {
            await page.setViewportSize(viewport);
            await page.goto(HOME_URL);

            const app = await neuralLink.connectToApp('Portal');
            await expect(page.locator('.portal-home-parts-audiencedoors').getByRole('heading', {level: 2})).toHaveText('Who Neo.mjs Is For');

            const home  = await queryOne(app, {className: 'Portal.view.home.MainContainer'}),
                  doors = await queryOne(app, {reference: 'home-audience-doors'});

            await page.locator('.portal-home-hero-content .hero-audience-cue').focus();
            await page.keyboard.press('Enter');
            await expect(page.locator(`#${doors.id}`)).toBeInViewport({timeout: 10000});
            await waitForScrollSettled(page, home.id);

            // Focus follows the scroll: a cue left holding focus off-screen would hide where the visitor now is
            await expect(page.locator(`#${doors.id} .portal-audience-header`)).toBeFocused();

            // The next stop is inside the doors, and the screen does not jump back to the cue's sibling
            await page.keyboard.press('Tab');
            await expect.poll(() => page.evaluate(id => document.getElementById(id).contains(document.activeElement), doors.id)).toBe(true);
            await expect(page.locator(`#${doors.id}`)).toBeInViewport()
        })
    }

    test('fits all three cards without clipping at 900x700 snap-active and stacks cleanly at 390x844 mobile', async ({page, neuralLink}) => {
        await page.setViewportSize({width: 900, height: 700});
        await page.goto(HOME_URL);

        const app = await neuralLink.connectToApp('Portal');
        await expect(page.locator('.portal-home-parts-audiencedoors').getByRole('heading', {level: 2})).toHaveText('Who Neo.mjs Is For');

        const header     = await queryOne(app, {className: 'Portal.view.HeaderToolbar'});
        const home       = await queryOne(app, {className: 'Portal.view.home.MainContainer'});
        const doors      = await queryOne(app, {reference: 'home-audience-doors'});
        const doorBuild  = await queryOne(app, {reference: 'door-build'});
        const doorAgents = await queryOne(app, {reference: 'door-agents'});
        const doorStudy  = await queryOne(app, {reference: 'door-study'});

        await scrollHomeToReference(page, app, home.id, 'home-audience-doors', doors.id);

        const snapRects  = await readComponentRects(app, [header.id, doors.id, doorBuild.id, doorAgents.id, doorStudy.id]);
        const headerRect = snapRects[header.id];
        const doorsRect  = snapRects[doors.id];

        for (const cardId of [doorBuild.id, doorAgents.id, doorStudy.id]) {
            const rect = snapRects[cardId];
            expect(rect.width).toBeGreaterThan(0);
            expect(rect.height).toBeGreaterThan(0);
            expect(rect.top, `card ${cardId} top stays below header`).toBeGreaterThanOrEqual(headerRect.bottom - 1);
            expect(rect.bottom, `card ${cardId} bottom stays inside 700px viewport`).toBeLessThanOrEqual(700 + 1);
            expect(withinRect(rect, doorsRect, 1), `card ${cardId} stays inside AudienceDoors`).toBe(true)
        }

        expect(
            await page.locator(`#${home.id}`).evaluate(node => node.scrollWidth <= node.clientWidth + 1),
            '900x700 viewport has zero horizontal overflow'
        ).toBe(true);

        // Switch to 390x844 mobile free-scroll layout and verify vertical stack + zero horizontal overflow
        await page.setViewportSize({width: 390, height: 844});
        await page.locator(`#${doors.id}`).scrollIntoViewIfNeeded();

        await expect.poll(async () => {
            const mobileRects = await readComponentRects(app, [doorBuild.id, doorAgents.id, doorStudy.id]);
            return mobileRects[doorBuild.id].bottom <= mobileRects[doorAgents.id].top + 1
                && mobileRects[doorAgents.id].bottom <= mobileRects[doorStudy.id].top + 1
        }, {timeout: 10000}).toBe(true);

        const mobileRects = await readComponentRects(app, [doors.id, doorBuild.id, doorAgents.id, doorStudy.id]);

        for (const cardId of [doorBuild.id, doorAgents.id, doorStudy.id]) {
            const rect = mobileRects[cardId];
            expect(rect.left).toBeGreaterThanOrEqual(0);
            expect(rect.right).toBeLessThanOrEqual(390 + 1);
            expect(withinRect(rect, mobileRects[doors.id], 1)).toBe(true)
        }

        expect(
            await page.locator(`#${home.id}`).evaluate(node => node.scrollWidth <= node.clientWidth + 1),
            '390x844 mobile viewport has zero horizontal overflow'
        ).toBe(true);

        for (const chip of await page.locator(`#${doors.id} .portal-door-command`).all()) {
            expect(
                await chip.evaluate(node => node.scrollWidth <= node.clientWidth + 1),
                '390x844 command chip fits without horizontal clipping'
            ).toBe(true)
        }

        // A proof link's icon stays after its label's last word: an icon alone on a line reads as a stray mark
        for (const proof of await page.locator(`#${doors.id} .portal-door-proof a`).all()) {
            expect(await proof.evaluate(link => {
                const last = [...link.querySelector('span').getClientRects()].at(-1),
                      icon = link.querySelector('.fa').getBoundingClientRect();

                return icon.left >= last.right - 1 && Math.abs(icon.top + icon.height / 2 - (last.top + last.height / 2)) < last.height / 2
            }), 'the proof icon shares its label\'s last line').toBe(true)
        }

        await page.setViewportSize({width: 360, height: 800});
        await page.locator(`#${doors.id}`).scrollIntoViewIfNeeded();
        expect(
            await page.locator(`#${home.id}`).evaluate(node => node.scrollWidth <= node.clientWidth + 1),
            '360x800 mobile viewport has zero horizontal overflow'
        ).toBe(true);

        for (const chip of await page.locator(`#${doors.id} .portal-door-command`).all()) {
            expect(
                await chip.evaluate(node => node.scrollWidth <= node.clientWidth + 1),
                '360x800 command chip fits without horizontal clipping'
            ).toBe(true)
        }
    });

    test('a hovered or keyboard-focused door lights in place: it never moves, its border stays whole, and reduced motion skips the glint and the lap', async ({page, neuralLink}) => {
        await page.setViewportSize({width: 1440, height: 900});
        await page.goto(HOME_URL);

        const app = await neuralLink.connectToApp('Portal');
        await expect(page.locator('.portal-home-parts-audiencedoors').getByRole('heading', {level: 2})).toHaveText('Who Neo.mjs Is For');

        const home      = await queryOne(app, {className: 'Portal.view.home.MainContainer'});
        const doors     = await queryOne(app, {reference: 'home-audience-doors'});
        const doorStudy = await queryOne(app, {reference: 'door-study'});
        const studyCta  = await queryOne(app, {reference: 'door-study-cta'});

        await scrollHomeToReference(page, app, home.id, 'home-audience-doors', doors.id);

        const card = page.locator(`#${doorStudy.id}`);

        // A clipped border hit-tests to the ancestor that clips it, not to the card
        const read = () => card.evaluate(async node => {
            await Promise.all(node.getAnimations().map(animation => animation.finished));

            const rect = node.getBoundingClientRect();

            return {
                border      : getComputedStyle(node).borderTopColor,
                motions     : Object.fromEntries(node.getAnimations({subtree: true}).filter(a => a.animationName?.startsWith('portal-glass-card-')).map(a => [a.animationName, a.effect.getComputedTiming().duration])),
                light       : getComputedStyle(node, '::after').opacity,
                position    : {left: rect.left, top: rect.top},
                topBorderHit: node.contains(document.elementFromPoint(rect.left + rect.width / 2, rect.top + 0.5))
            }
        });

        await page.mouse.move(5, 895);
        const rest = await read();
        expect(rest.topBorderHit).toBe(true);

        const box = await card.boundingBox();
        await page.mouse.move(box.x + box.width / 2, box.y + box.height - 12);

        const hovered = await read();
        expect(hovered.position, 'a hovered door stays where it was').toEqual(rest.position);
        expect(hovered.topBorderHit, 'its whole top border stays visible').toBe(true);
        expect(rest.light).toBe('0');
        expect(hovered.border).not.toBe(rest.border);
        expect(hovered.light).toBe('1');
        expect(Object.keys(hovered.motions).sort(), 'a glint crosses the glass and a lap runs the border').toEqual(['portal-glass-card-glint', 'portal-glass-card-sweep']);
        expect(Object.values(hovered.motions).every(duration => duration > 0)).toBe(true);

        // Keyboard focus inside the door gets the same treatment
        await page.mouse.move(5, 895);
        await expect.poll(async () => (await read()).light).toBe('0');
        await page.locator(`#${doorStudy.id} .portal-door-proof a`).focus();
        await page.keyboard.press('Tab');
        await expect(page.locator(`#${studyCta.id}`)).toBeFocused();

        const focused = await read();
        expect(focused.border).toBe(hovered.border);
        expect(focused.light).toBe('1');
        expect(focused.position).toEqual(rest.position);

        // Reduced motion keeps the static light and skips the glint and the lap
        await page.locator(`#${studyCta.id}`).blur();
        await page.emulateMedia({reducedMotion: 'reduce'});
        await page.mouse.move(box.x + box.width / 2, box.y + box.height - 12);

        const reduced = await read();
        expect(reduced.light).toBe('1');
        expect(Object.values(reduced.motions).every(duration => duration === 0)).toBe(true)
    });

    for (const theme of ['neo-theme-neo-dark', 'neo-theme-neo-light']) {
        test(`${theme}: Features and AI Toolchain cards carry the glass card and light in place without moving (#22063)`, async ({page, neuralLink}) => {
            await page.setViewportSize({width: 1440, height: 900});
            await page.addInitScript(theme => localStorage.setItem('portalTheme', theme), theme);
            await page.goto(HOME_URL);

            const app = await neuralLink.connectToApp('Portal');
            await expect(page.locator(`.neo-viewport.${theme}`)).toBeVisible();
            await expect(page.locator('.portal-home-parts-audiencedoors').getByRole('heading', {level: 2})).toHaveText('Who Neo.mjs Is For');

            const home = await queryOne(app, {className: 'Portal.view.home.MainContainer'});

            const featureCards   = page.locator('.portal-home-features a.portal-content-box');
            const toolchainCards = page.locator('.portal-home-parts-aitoolchain .card-container a.portal-content-box');

            await expect(featureCards).toHaveCount(6);
            await expect(toolchainCards).toHaveCount(6);

            // Every lower card now carries the shared glass chrome
            for (const cards of [featureCards, toolchainCards]) {
                for (const card of await cards.all()) {
                    await expect(card).toHaveClass(/(^|\s)portal-glass-card(\s|$)/)
                }
            }

            await waitForHomeStylesAndFonts(page);

            for (const cards of [featureCards, toolchainCards]) {
                const card = cards.first();
                await card.scrollIntoViewIfNeeded();
                await waitForScrollSettled(page, home.id);

                // A clipped border hit-tests to the ancestor that clips it, not to the card
                const read = () => card.evaluate(async node => {
                    await Promise.all(node.getAnimations().map(animation => animation.finished));

                    const rect = node.getBoundingClientRect();

                    return {
                        border      : getComputedStyle(node).borderTopColor,
                        light       : getComputedStyle(node, '::after').opacity,
                        motions     : Object.fromEntries(node.getAnimations({subtree: true}).filter(a => a.animationName?.startsWith('portal-glass-card-')).map(a => [a.animationName, a.effect.getComputedTiming().duration])),
                        position    : {left: rect.left, top: rect.top},
                        topBorderHit: node.contains(document.elementFromPoint(rect.left + rect.width / 2, rect.top + 0.5)),
                        transform   : getComputedStyle(node).transform
                    }
                });

                await page.mouse.move(5, 895);
                const rest = await read();
                expect(rest.light).toBe('0');
                expect(rest.transform).toBe('none');
                expect(rest.topBorderHit).toBe(true);

                const box = await card.boundingBox();
                await page.mouse.move(box.x + box.width / 2, box.y + box.height - 12);

                const hovered = await read();
                expect(hovered.position, 'a hovered card stays where it was').toEqual(rest.position);
                expect(hovered.transform, 'a hovered card does not lift').toBe('none');
                expect(hovered.topBorderHit, 'its whole top border stays visible').toBe(true);
                expect(hovered.border).not.toBe(rest.border);
                expect(hovered.light).toBe('1');
                expect(Object.keys(hovered.motions).sort(), 'a glint crosses the glass and a lap runs the border').toEqual(['portal-glass-card-glint', 'portal-glass-card-sweep']);
                expect(Object.values(hovered.motions).every(duration => duration > 0)).toBe(true);

                // Keyboard focus on the card root itself gets the same treatment
                await page.mouse.move(5, 895);
                await expect.poll(async () => (await read()).light).toBe('0');
                await cards.nth(1).evaluate(node => node.focus({preventScroll: true}));
                await page.keyboard.press('Shift+Tab');
                await expect(card).toBeFocused();

                const focused = await read();
                expect(focused.position).toEqual(rest.position);
                expect(focused.transform).toBe('none');
                expect(focused.border).toBe(hovered.border);
                expect(focused.light).toBe('1');
                expect(Object.keys(focused.motions).sort(), 'focus runs the same glint and lap').toEqual(['portal-glass-card-glint', 'portal-glass-card-sweep']);

                // Reduced motion keeps the static light and skips the glint and the lap
                await card.evaluate(node => node.blur());
                await page.emulateMedia({reducedMotion: 'reduce'});
                await page.mouse.move(box.x + box.width / 2, box.y + box.height - 12);

                const reduced = await read();
                expect(reduced.light).toBe('1');
                expect(reduced.transform).toBe('none');
                expect(Object.values(reduced.motions).every(duration => duration === 0)).toBe(true);
                await page.emulateMedia({reducedMotion: null})
            }
        })
    }

    test('exposes crawler and agent DOM snapshot parity across root entry and #/home', async ({page, neuralLink}) => {
        for (const entryUrl of ['/apps/portal/index.html', HOME_URL]) {
            if (page.url() !== 'about:blank') {
                await page.goto('about:blank')
            }

            await page.goto(entryUrl);
            const app = await neuralLink.connectToApp('Portal');
            await expect(page.locator('.portal-home-parts-audiencedoors').getByRole('heading', {level: 2})).toHaveText('Who Neo.mjs Is For');

            const doors     = await queryOne(app, {reference: 'home-audience-doors'});
            const bodyEntry = await queryOne(app, {reference: 'home-body-entry'});
            const agentOs   = await queryOne(app, {reference: 'home-agent-os'});
            expect(doors?.mounted ?? doors?.properties?.mounted).toBe(true);
            expect(bodyEntry?.id).toBeTruthy();
            expect(agentOs?.id).toBeTruthy();

            const snapshot = await page.locator('.neo-viewport').evaluate(el => ({
                html: el.innerHTML,
                text: el.innerText
            }));

            // The hero's sentence renders as two block lines, so innerText breaks where textContent has a space
            expect(snapshot.text.replace(/\s+/g, ' ')).toContain(HERO_COPY);
            expect(snapshot.text).toContain('$ npx neo-app@latest');
            expect(snapshot.text).toContain('neo-agent-brain · neo-agent-institution');
            expect(snapshot.text).toContain('MX · Two Hemispheres · Gated RSI');
            expect(snapshot.text).toContain('Explore the Engine');
            expect(snapshot.text).toContain('Explore the Agent OS');
            expect(snapshot.text).toContain('Read What Is Neo.mjs?');

            const buildIdx  = snapshot.text.indexOf('Build an application');
            const agentsIdx = snapshot.text.indexOf('Run an agent team');
            const studyIdx  = snapshot.text.indexOf('Study the model');

            expect(buildIdx).toBeGreaterThanOrEqual(0);
            expect(agentsIdx).toBeGreaterThan(buildIdx);
            expect(studyIdx).toBeGreaterThan(agentsIdx);

            expect(snapshot.html).toContain('examples/grid/bigData/index.html');
            expect(snapshot.html).toContain(`href="#${bodyEntry.id}"`);
            expect(snapshot.html).toContain(`id="${bodyEntry.id}"`);
            expect(snapshot.html).toContain(`href="#${agentOs.id}"`);
            expect(snapshot.html).toContain(`id="${agentOs.id}"`);
            expect(snapshot.html).toContain('/news/pulls/15123');
            expect(snapshot.html).toContain('/learn/benefits/Introduction')
        }
    })
});
