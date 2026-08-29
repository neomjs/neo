import {test, expect} from '../../fixtures.mjs';

/**
 * @summary Whitebox E2E witness for resident-card container sizing (pane-keyed, not viewport-keyed).
 *
 * The resident cards size their type from container units against their pane, so two panes of
 * materially different height in the same window must resolve materially different type — and a
 * declared trim element (the sparkline wave) must never silently resolve to a used height of 0:
 * it either renders, or an explicit container-query rule hides it. The assertions bind the
 * relationships, never pixel values or the disclosure thresholds themselves, so a design retune
 * that preserves the contract stays green.
 *
 * Run: NEO_E2E_PORT=8152 npx playwright test workstation/WorkstationResidentCardSizingNL -c test/playwright/playwright.config.e2e.mjs --workers=1
 */

/**
 * Boots the workstation app and waits for the resident cards to be laid out.
 * @param {Object} page Playwright page
 * @returns {Promise<void>}
 */
async function bootWorkstation(page) {
    await page.goto('/apps/workstation/index.html');
    await page.waitForSelector('.workstation-dock-host', {timeout: 60000});
    await page.waitForSelector('.workstation-resident-card', {timeout: 60000});
    await page.waitForFunction(() => {
        const panes = [...document.querySelectorAll('.workstation-placeholder')];

        return panes.length > 1 && panes.every(pane => pane.getBoundingClientRect().height > 0)
    }, {timeout: 60000});
    await page.waitForTimeout(1200)
}

/**
 * Collects the per-card sizing facts the assertions consume.
 * @param {Object} page Playwright page
 * @returns {Promise<Object[]>}
 */
function collectCards(page) {
    return page.evaluate(() => [...document.querySelectorAll('.workstation-resident-card')].map(card => {
        const pane     = card.closest('.workstation-placeholder'),
              cardCs   = getComputedStyle(card),
              cardRect = card.getBoundingClientRect(),
              metric   = card.querySelector('.workstation-resident-metric'),
              wave     = card.querySelector('.workstation-resident-wave'),
              visible  = [...card.children].filter(child => getComputedStyle(child).display !== 'none'),
              lastVis  = visible.at(-1)?.getBoundingClientRect();

        return {
            title      : card.querySelector('.workstation-resident-title')?.textContent?.trim(),
            paneHeight : pane.getBoundingClientRect().height,
            metricFs   : parseFloat(getComputedStyle(metric).fontSize),
            waveDisplay: getComputedStyle(wave).display,
            waveHeight : wave.getBoundingClientRect().height,
            // Positive values mean the last visible child escapes the card's content box —
            // the flex layout was asked to absorb negative slack.
            slackOverrun: lastVis ? lastVis.bottom - (cardRect.bottom - parseFloat(cardCs.paddingBottom)) : 0
        }
    }))
}

/**
 * Asserts the three sizing relationships on a collected card set.
 * @param {Object[]} cards
 */
function assertSizingContract(cards) {
    expect(cards.length, 'resident cards must be present').toBeGreaterThan(1);

    const byHeight = [...cards].sort((a, b) => a.paneHeight - b.paneHeight),
          shortest = byHeight.at(0),
          tallest  = byHeight.at(-1);

    // Precondition, not an assertion target: the dock layout hands this app materially
    // different pane heights. If it ever stops doing so, the relationship below is vacuous
    // and the spec must fail loudly rather than pass silently.
    expect(
        tallest.paneHeight / shortest.paneHeight,
        `pane heights must differ materially (tallest ${tallest.paneHeight}, shortest ${shortest.paneHeight})`
    ).toBeGreaterThan(1.5);

    expect(
        tallest.metricFs,
        `metric type must track the pane: tallest pane ${tallest.paneHeight}px (${tallest.title}) vs shortest ${shortest.paneHeight}px (${shortest.title})`
    ).toBeGreaterThan(shortest.metricFs);

    cards.forEach(card => {
        if (card.waveDisplay !== 'none') {
            expect(
                card.waveHeight,
                `${card.title}: a rendered wave must never resolve to 0 height (pane ${card.paneHeight}px)`
            ).toBeGreaterThan(0)
        }

        expect(
            card.slackOverrun,
            `${card.title}: visible content must fit the card's content box (pane ${card.paneHeight}px)`
        ).toBeLessThanOrEqual(0.5)
    })
}

test.describe('Workstation resident cards — pane-keyed sizing at a roomy viewport', () => {
    test.setTimeout(90000);
    test.use({
        contextOptions: {screen: {height: 1080, width: 1920}},
        viewport      : {height: 840, width: 1180}
    });

    test('unequal panes resolve unequal type; declared trim never renders at 0', async ({page}) => {
        await bootWorkstation(page);

        const cards = await collectCards(page);

        assertSizingContract(cards);

        // At this viewport every resident pane clears the disclosure thresholds: the wave is
        // part of the composition and must be present on every card, tall and short alike.
        cards.forEach(card => {
            expect(card.waveDisplay, `${card.title}: wave must render at ${card.paneHeight}px pane height`).not.toBe('none')
        })
    })
});

test.describe('Workstation resident cards — film-stage density from the committed document', () => {
    test.setTimeout(90000);
    test.use({
        contextOptions: {screen: {height: 1440, width: 2560}},
        viewport      : {height: 1440, width: 2560}
    });

    test('the opening extents keep both the scale grid and dense resident group usable', async ({page, neuralLink}) => {
        await bootWorkstation(page);

        const app         = await neuralLink.connectToApp('Workstation'),
              workspaces  = await app.findInstances({className: 'Workstation.view.Workspace'}, ['id']),
              workspaceId = (Array.isArray(workspaces) ? workspaces : [workspaces])[0]?.id;

        expect(workspaceId, 'the film stage owns a Workstation workspace').toBeTruthy();

        const {dockModel} = await app.getComponent(workspaceId, ['dockModel']),
              geometry    = await page.evaluate(() => {
                  const
                      rect       = element => element?.getBoundingClientRect(),
                      host       = document.querySelector('.workstation-dock-host'),
                      hostRect   = rect(host),
                      hostStyle  = getComputedStyle(host),
                      number     = property => Number.parseFloat(hostStyle[property]) || 0,
                      left       = rect(document.querySelector('.neo-dashboard-dock-edge-band-left')),
                      right      = rect(document.querySelector('.neo-dashboard-dock-edge-band-right')),
                      bottom     = rect(document.querySelector('.neo-dashboard-dock-edge-band-bottom')),
                      heavy      = rect([...document.querySelectorAll('.neo-tab-header-toolbar')]
                          .find(element => element.textContent?.includes('Priority Alert Observatory'))
                          ?.closest('.neo-tab-container')),
                      scale      = document.querySelector('.workstation-scale-pane .neo-grid-header-toolbar'),
                      scaleRect  = rect(scale),
                      lastHeader = rect([...scale?.querySelectorAll('.neo-grid-header-button') || []].at(-1));

                  return {
                      bottomHeight    : bottom?.height,
                      contentBlockSize: hostRect.height
                          - number('borderTopWidth') - number('borderBottomWidth')
                          - number('paddingTop') - number('paddingBottom'),
                      contentInlineSize: hostRect.width
                          - number('borderLeftWidth') - number('borderRightWidth')
                          - number('paddingLeft') - number('paddingRight'),
                      heavyWidth        : heavy?.width,
                      leftWidth         : left?.width,
                      rightWidth        : right?.width,
                      scaleTrailingSpace: scaleRect?.right - lastHeader?.right
                  }
              });

        expect(dockModel.nodes.root.zones).toMatchObject({
            left  : {extent: 0.11, resizable: true},
            right : {extent: 0.14, resizable: true},
            bottom: {extent: 0.17, resizable: true}
        });
        expect(geometry.leftWidth).toBeCloseTo(geometry.contentInlineSize * 0.11, 1);
        expect(geometry.rightWidth).toBeCloseTo(geometry.contentInlineSize * 0.14, 1);
        expect(geometry.bottomHeight).toBeCloseTo(geometry.contentBlockSize * 0.17, 1);
        expect(geometry.rightWidth, 'the evidence band stays wider than the queue band')
            .toBeGreaterThan(geometry.leftWidth);
        expect(geometry.heavyWidth, 'the dense twelve-tab resident group keeps its working width')
            .toBeGreaterThanOrEqual(700);
        expect(geometry.scaleTrailingSpace, 'the 100k grid headers fit without wasting a second panel')
            .toBeGreaterThanOrEqual(0);
        expect(geometry.scaleTrailingSpace).toBeLessThanOrEqual(140)
    })
});

test.describe('Workstation resident cards — progressive disclosure at a short viewport', () => {
    test.setTimeout(90000);
    test.use({
        contextOptions: {screen: {height: 1080, width: 1920}},
        viewport      : {height: 700, width: 900}
    });

    test('short panes drop trim by rule instead of shrinking it to nothing', async ({page}) => {
        await bootWorkstation(page);

        const cards = await collectCards(page);

        assertSizingContract(cards);

        // The short band of this layout sits below the wave threshold: at least one card must
        // have taken the explicit-hide branch, proving disclosure is a rule, not an accident.
        expect(
            cards.some(card => card.waveDisplay === 'none'),
            'at least one short pane must hide its wave via the container query'
        ).toBe(true)
    })
});

/**
 * Collects the containment and disclosure facts the degradation contract consumes.
 * @param {Object} page Playwright page
 * @returns {Promise<Object[]>}
 */
function collectDegradation(page) {
    return page.evaluate(() => [...document.querySelectorAll('.workstation-resident-card')].map(card => {
        const pane     = card.closest('.workstation-placeholder'),
              paneRect = pane.getBoundingClientRect(),
              cardRect = card.getBoundingClientRect(),
              paneId   = [...pane.classList].find(cls => cls.startsWith('workstation-pane-')) ?? 'workstation-pane-unknown';

        return {
            cardBottom: cardRect.bottom,
            cardHeight: cardRect.height,
            cardTop   : cardRect.top,
            children  : [...card.children].map(child => {
                const rect = child.getBoundingClientRect();

                return {
                    bottom : rect.bottom,
                    display: getComputedStyle(child).display,
                    height : rect.height,
                    name   : [...child.classList].find(cls => cls.startsWith('workstation-resident-')) ?? child.tagName,
                    top    : rect.top
                }
            }),
            paneHeight: paneRect.height,
            paneId
        }
    }))
}

/**
 * Asserts the below-content-height degradation contract on one collected station.
 *
 * Three relationships, no threshold values: a visible child never resolves to 0 height
 * (its disappearance is a declared rule, not slack math), a visible child never paints
 * outside the card's own box, and the card is never taller than the pane containing it.
 * @param {Object[]} cards Collected via collectDegradation()
 * @param {String} station Label for failure messages
 */
function assertDegradationContract(cards, station) {
    expect(cards.length, `${station}: resident cards must be present`).toBeGreaterThan(1);

    cards.forEach(card => {
        expect(
            card.cardHeight,
            `${station} ${card.paneId}: the card must never be taller than its pane (card ${card.cardHeight}, pane ${card.paneHeight})`
        ).toBeLessThanOrEqual(card.paneHeight + 0.5);

        card.children.forEach(child => {
            if (child.display !== 'none') {
                expect(
                    child.height,
                    `${station} ${card.paneId}/${child.name}: a visible child must never resolve to 0 height (pane ${card.paneHeight}px)`
                ).toBeGreaterThan(0);

                expect(
                    child.bottom,
                    `${station} ${card.paneId}/${child.name}: a visible child must not paint below the card box (child bottom ${child.bottom}, card bottom ${card.cardBottom}, pane ${card.paneHeight}px)`
                ).toBeLessThanOrEqual(card.cardBottom + 0.5);

                expect(
                    child.top,
                    `${station} ${card.paneId}/${child.name}: a visible child must not paint above the card box`
                ).toBeGreaterThanOrEqual(card.cardTop - 0.5)
            }
        })
    })
}

/**
 * Asserts that disclosure is monotone in pane height across every collected sample:
 * whatever is visible at a shorter pane must also be visible at a materially taller one.
 * Binds the ORDER of the ladder, never its threshold values, so a retune stays green.
 * Pairs closer than the guard band are skipped — they may legitimately straddle a boundary.
 * @param {Object[]} samples Union of collectDegradation() results across stations
 */
function assertMonotoneDisclosure(samples) {
    const sorted    = [...samples].sort((a, b) => a.paneHeight - b.paneHeight),
          guardBand = 8,
          visSet    = card => new Set(card.children.filter(c => c.display !== 'none').map(c => c.name));

    sorted.forEach((short, i) => {
        const shortVis = visSet(short);

        sorted.slice(i + 1).forEach(tall => {
            if (tall.paneHeight - short.paneHeight <= guardBand) return;

            const tallVis = visSet(tall);

            shortVis.forEach(name => {
                expect(
                    tallVis.has(name),
                    `${name} is visible at a ${short.paneHeight}px pane (${short.paneId}) but hidden at a taller ` +
                    `${tall.paneHeight}px pane (${tall.paneId}) — disclosure must shed monotonically with height`
                ).toBe(true)
            })
        })
    })
}

test.describe('Workstation resident cards — declared degradation below content height', () => {
    test.setTimeout(120000);
    test.use({
        contextOptions: {screen: {height: 1080, width: 1920}},
        viewport      : {height: 880, width: 1282}
    });

    // The three stations walk the reported degradation table (1282×880 / ×560 / ×420): healthy,
    // below-content-height, and pane-shorter-than-the-box-model-floor. The resize path between
    // them is the same journey a film-paced window resize sweeps through.
    test('a card degrades as a declared unit, never by shedding children or escaping its boxes', async ({page}) => {
        await bootWorkstation(page);

        const settle = async () => {
            await page.waitForFunction(() => {
                const panes = [...document.querySelectorAll('.workstation-placeholder')];

                return panes.length > 1 && panes.every(pane => pane.getBoundingClientRect().width > 0)
            }, {timeout: 30000});
            await page.waitForTimeout(900)
        };

        const stations = [];

        stations.push({label: '1282x880', cards: await collectDegradation(page)});

        await page.setViewportSize({height: 560, width: 1282});
        await settle();
        stations.push({label: '1282x560', cards: await collectDegradation(page)});

        await page.setViewportSize({height: 420, width: 1282});
        await settle();
        stations.push({label: '1282x420', cards: await collectDegradation(page)});

        stations.forEach(({label, cards}) => assertDegradationContract(cards, label));

        assertMonotoneDisclosure(stations.flatMap(({cards}) => cards));

        // The journey must actually reach the below-content-height band, or the contract
        // assertions above are vacuous: at the shortest station at least one pane must sit
        // below the taller trim thresholds with its card still bound by the contract.
        const shortest = stations.at(-1).cards.map(card => card.paneHeight).sort((a, b) => a - b).at(0);

        expect(
            shortest,
            `the shortest station must produce a below-content-height pane (measured ${shortest}px)`
        ).toBeLessThan(100)
    })
});
