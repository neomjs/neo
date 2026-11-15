import {expect, test}                   from '../../fixtures.mjs';
import {readComponentRects, withinRect} from '../utils/dockGeometry.mjs';

const HOME_URL  = '/apps/portal/index.html#/home';
const HERO_COPY = "Neo.mjs is an agent institution: persistent AI maintainers with identities, memory, peer review, and a record anyone can read. Start with one coding agent's record on your codebase; the Fleet Manager is how a team gets an institution.";

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
 * Smoothly scrolls the Home container to a referenced part and waits until scroll motion settles.
 * @param {import('@playwright/test').Page} page
 * @param {Object} app
 * @param {String} homeId
 * @param {String} reference
 * @param {String} targetId
 */
async function scrollHomeToReference(page, app, homeId, reference, targetId) {
    await app.callMethod(homeId, 'scrollToPart', [reference]);

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
 * @summary Whitebox Neural Link verification for the Portal Home AudienceDoors stage,
 * reference-based scroll routing, proof destinations, and responsive viewport geometry.
 */
test.describe('Portal Home AudienceDoors (Neural Link)', () => {
    test('renders audience doors in canonical order, resolves proof links, and routes all three CTAs', async ({page, neuralLink}) => {
        await page.setViewportSize({width: 1440, height: 900});
        await page.goto(HOME_URL);

        const app = await neuralLink.connectToApp('Portal');
        await expect(page.locator('.portal-home-parts-audiencedoors').getByRole('heading', {level: 2})).toHaveText('Who Neo.mjs Is For');

        const home      = await queryOne(app, {className: 'Portal.view.home.MainContainer'});
        const hero      = await queryOne(app, {className: 'Portal.view.home.parts.hero.Content'});
        const doors     = await queryOne(app, {reference: 'home-audience-doors'});
        const bodyEntry = await queryOne(app, {reference: 'home-body-entry'});
        const agentOs   = await queryOne(app, {reference: 'home-agent-os'});

        expect(home?.id).toBeTruthy();
        expect(hero?.id).toBeTruthy();
        expect(doors?.className).toBe('Portal.view.home.parts.AudienceDoors');
        expect(bodyEntry?.className).toBe('Portal.view.home.parts.Colors');
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
        expect(doorBuildCta?.properties?.text ?? doorBuildCta?.text).toBe('Explore the Engine ↓');
        expect(doorAgentsCta?.properties?.text ?? doorAgentsCta?.text).toBe('Explore the Agent OS ↓');
        expect(doorStudyCta?.properties?.text ?? doorStudyCta?.text).toBe('Read What Is Neo.mjs? →');
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
        expect(recordHref).toBe('#/news/pulls/15123');
        expect(essayHref).toBe('#/learn/benefits/Introduction');

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
        await expect(page.locator(`#${bodyEntry.id}`)).toHaveClass(/portal-home-parts-colors/);
        await expect(page.locator(`#${agentOs.id}`)).toHaveClass(/portal-home-parts-aitoolchain/);

        // Scroll AudienceDoors into view and click Door 1 CTA -> Body entry stage while keeping #/home hash
        await scrollHomeToReference(page, app, home.id, 'home-audience-doors', doors.id);
        const doorsScrollTop = await page.locator(`#${home.id}`).evaluate(el => el.scrollTop);
        expect(doorsScrollTop).toBeGreaterThan(0);

        await buildCtaEl.click();
        await expect.poll(async () => {
            return page.locator(`#${home.id}`).evaluate(el => el.scrollTop)
        }, {timeout: 10000}).toBeGreaterThan(doorsScrollTop + 200);
        await expect(page.locator(`#${bodyEntry.id}`)).toBeInViewport();
        await expect(page).toHaveURL(/#\/home$/);

        // Return to AudienceDoors and click Door 2 CTA -> Agent OS Brain stage while keeping #/home hash
        await scrollHomeToReference(page, app, home.id, 'home-audience-doors', doors.id);
        await agentsCtaEl.click();
        await expect(page.locator(`#${agentOs.id}`)).toBeInViewport({timeout: 10000});
        await expect(page.locator(`#${agentOs.id}`).getByRole('heading', {name: 'The Agent OS Brain'})).toBeVisible();
        await expect(page).toHaveURL(/#\/home$/);

        // Return to AudienceDoors and click Door 3 CTA -> What Is Neo.mjs? guide
        await scrollHomeToReference(page, app, home.id, 'home-audience-doors', doors.id);
        await page.locator(`#${doorStudyCta.id}`).click();
        await expect(page).toHaveURL(/#\/learn\/benefits\/Introduction$/);
        await expect(page.getByRole('heading', {level: 1, name: 'What Is Neo.mjs?'})).toBeVisible({timeout: 15000})
    });

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
        ).toBe(true)
    });

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

            expect(snapshot.text).toContain(HERO_COPY);
            expect(snapshot.text).toContain('$ npx neo-app@latest');
            expect(snapshot.text).toContain('neo-agent-brain · neo-agent-institution');
            expect(snapshot.text).toContain('MX · Two Hemispheres · Gated RSI');
            expect(snapshot.text).toContain('Explore the Engine ↓');
            expect(snapshot.text).toContain('Explore the Agent OS ↓');
            expect(snapshot.text).toContain('Read What Is Neo.mjs? →');

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
            expect(snapshot.html).toContain('#/news/pulls/15123');
            expect(snapshot.html).toContain('#/learn/benefits/Introduction')
        }
    })
});
