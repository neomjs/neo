import {test, expect} from '../../fixtures.mjs';

// ArrowRight moves "survey" one hour later; its links carry "design" and then "materials" one hour later too.
const moved = ['survey', 'design', 'materials'];

/**
 * Samples every frame for `ms`: each moving bar's inline `left`, and how far each link of a moving task
 * ends from the bar edges it attaches to (all links of the basic plan run finish to start).
 */
const sample = (page, ms) => page.evaluate(({ids, ms}) => new Promise(resolve => {
    const bar    = id => document.querySelector(`.neo-timeline-bar[data-event-id="${id}"]`),
          frames = [],
          t0     = performance.now(),
          tick   = () => {
              const lefts = Object.fromEntries(ids.map(id => [id, parseFloat(bar(id)?.style.left)])), gaps = [];

              for (const path of document.querySelectorAll('.neo-gantt-dependency-arrow')) {
                  const {fromId, toId} = path.dataset;
                  if (!ids.includes(fromId) && !ids.includes(toId) || !bar(fromId) || !bar(toId)) continue;
                  const source = bar(fromId).getBoundingClientRect(), target = bar(toId).getBoundingClientRect(),
                        matrix = path.getScreenCTM(),
                        first  = path.getPointAtLength(0).matrixTransform(matrix),
                        last   = path.getPointAtLength(path.getTotalLength()).matrixTransform(matrix);
                  gaps.push(Math.max(Math.abs(first.x - source.right), Math.abs(last.x - target.left)))
              }

              frames.push({lefts, gaps});
              performance.now() - t0 < ms ? requestAnimationFrame(tick) : resolve(frames)
          };

    requestAnimationFrame(tick)
}), {ids: moved, ms});

// A bar outside the buffered window is not rendered: null.
const lefts = page => page.evaluate(ids => Object.fromEntries(ids.map(id => {
    const bar = document.querySelector(`.neo-timeline-bar[data-event-id="${id}"]`);
    return [id, bar ? parseFloat(bar.style.left) : null]
})), moved);

/**
 * Opens the basic plan, with the panel tier lengthened on the chart when `tier` is given: a loaded runner still
 * samples the steps of a lengthened tier. The chart reads its tier when it mounts, so the rule is in place first.
 */
const openPlan = async (page, neuralLink, tier) => {
    if (tier) await page.addInitScript(value => document.addEventListener('DOMContentLoaded', () => {
        const style = document.createElement('style');
        style.textContent = `.neo-gantt {--motion-panel: ${value}}`;
        document.head.append(style)
    }), tier);
    await page.goto('/examples/gantt/basic/index.html');
    await expect(page.locator('.neo-timeline-bar[data-event-id="survey"]')).toBeVisible();
    await expect(page.getByText('Edits stay on this device')).toBeVisible();
    const app     = await neuralLink.connectToApp('GanttBasic');
    const [gantt] = await app.findInstances({className: 'Neo.gantt.Container'}, ['id', 'animateCascade']);
    return {app, gantt}
};

test('a cascade moves its bars and their links together, from the previous dates to the final ones', async ({page, neuralLink}) => {
    const {gantt} = await openPlan(page, neuralLink, '1600ms');
    const before  = await lefts(page);

    await page.locator('.neo-timeline-bar[data-event-id="survey"]').focus();
    const sampling = sample(page, 2400);
    await page.keyboard.press('ArrowRight');
    const frames = await sampling, after = await lefts(page);

    for (const id of moved) {
        const series  = frames.map(frame => frame.lefts[id]),
              between = new Set(series.filter(left => left > before[id] && left < after[id]));

        expect(after[id], `${id} moved later`).toBeGreaterThan(before[id]);
        expect(between.size, `${id}: distinct intermediate lefts`).toBeGreaterThanOrEqual(3);
        series.forEach((left, i) => i && expect(left, `${id} frame ${i} never moves back`).toBeGreaterThanOrEqual(series[i - 1]));
        expect(series.at(-1), `${id} ends exactly at its final left`).toBe(after[id])
    }

    expect(Math.max(...frames.flatMap(frame => frame.gaps)), 'a link never leaves its bars').toBeLessThanOrEqual(1);
    expect(gantt.properties.animateCascade, 'the example switches the transition on').toBe(true)
});

test('under reduced motion the cascade lands in one update', async ({page, neuralLink}) => {
    await page.emulateMedia({reducedMotion: 'reduce'});
    await openPlan(page, neuralLink);
    const before = await lefts(page);

    await page.locator('.neo-timeline-bar[data-event-id="survey"]').focus();
    const sampling = sample(page, 800);
    await page.keyboard.press('ArrowRight');
    const frames = await sampling, after = await lefts(page);

    for (const id of moved) {
        expect(after[id]).toBeGreaterThan(before[id]);
        expect(frames.filter(frame => frame.lefts[id] !== before[id] && frame.lefts[id] !== after[id]), `${id}: no intermediate geometry`)
            .toEqual([])
    }
});

test('reduced motion switched on after an animated cascade leaves the next one in one update', async ({page, neuralLink}) => {
    await openPlan(page, neuralLink);
    const bar = page.locator('.neo-timeline-bar[data-event-id="survey"]');

    // A first move that animates: the chart holds a positive tier
    await bar.focus();
    const first0    = await lefts(page),
          sampling0 = sample(page, 1200);
    await page.keyboard.press('ArrowRight');
    const frames0 = await sampling0, first1 = await lefts(page);

    expect(frames0.some(frame => moved.some(id => frame.lefts[id] > first0[id] && frame.lefts[id] < first1[id])), 'the first move animates')
        .toBe(true);

    // The system preference changes; main relays it to the App worker
    await page.emulateMedia({reducedMotion: 'reduce'});
    await page.waitForTimeout(300);

    const before   = await lefts(page),
          sampling = sample(page, 800);
    await page.keyboard.press('ArrowRight');
    const frames = await sampling, after = await lefts(page);

    for (const id of moved) {
        expect(after[id]).toBeGreaterThan(before[id]);
        expect(frames.filter(frame => frame.lefts[id] !== before[id] && frame.lefts[id] !== after[id]), `${id}: no intermediate geometry`)
            .toEqual([])
    }
});

test('a zoom during the steps ends them at the final geometry', async ({page, neuralLink}) => {
    const {app, gantt} = await openPlan(page, neuralLink, '6000ms');
    const before       = await lefts(page);

    await page.locator('.neo-timeline-bar[data-event-id="survey"]').focus();
    await page.keyboard.press('ArrowRight');
    // Mid-move: the cascade's last successor has left its place.
    await expect.poll(async () => (await lefts(page)).materials).toBeGreaterThan(before.materials);

    await page.getByRole('button', {name: 'Day', exact: true}).click();
    const [chart] = await app.findInstances({className: 'Neo.gantt.Container'}, ['timeAxis.id']);
    const final   = {};
    for (const id of moved) {
        const task = await app.callMethod(gantt.id, 'resolveTaskRecord', [id]);
        final[id]  = await app.callMethod(chart.properties['timeAxis.id'], 'dateToOffset', [task.startDate])
    }
    // The day scale renders only the bars inside its buffered window; each one stands at its final place.
    const rendered = async () => Object.fromEntries(Object.entries(await lefts(page)).filter(([, left]) => left !== null));
    await expect.poll(async () => (await rendered()).survey).toBe(final.survey);
    const shown = await rendered();
    for (const id of Object.keys(shown)) expect(shown[id], `${id} at its final place`).toBe(final[id]);

    // The steps ended: nothing moves afterwards.
    const frames = await sample(page, 1500);
    for (const id of Object.keys(shown)) {
        expect(new Set(frames.map(frame => frame.lefts[id])), `${id} at rest`).toEqual(new Set([final[id]]))
    }
});
