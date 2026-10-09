import {test, expect} from '../../fixtures.mjs';

/**
 * @summary A dock commit keeps the workspace's panes on screen through its staged re-projection.
 *
 * The Reconciler stages each projection as a second shell and swaps it in over separate host updates.
 * Sampled at every painted frame, the visible pane area must not collapse while that happens. A shell
 * left in the host's flex row beside the incoming one pushes the swapped-in panes past the host's
 * edge until the outgoing shell is destroyed, and a real compositor paints that frame blank. The
 * sampler reads layout, so a headless run sees it too.
 */
test.describe('Workstation — a dock commit keeps its panes on screen', () => {
    test.setTimeout(120000);

    test('the dense tour\'s first commits never paint the workspace empty', async ({page}) => {
        await page.goto('/apps/workstation/index.html');
        await page.waitForSelector('.workstation-dock-host', {timeout: 60000});
        await page.waitForFunction(() => {
            return document.querySelector('.workstation-dock-host')?.getBoundingClientRect().height > 300
        }, null, {timeout: 60000});

        await page.evaluate(() => {
            const host    = document.querySelector('.workstation-dock-host'),
                  probe   = window.__commitContinuity = {swaps: 0, ticks: [], touring: false},
                  channel = new MessageChannel();

            // A message posted from requestAnimationFrame arrives after that frame's rendering update.
            channel.port1.onmessage = () => {
                const box     = host.getBoundingClientRect();
                let   visible = 0;

                for (const tabs of host.querySelectorAll('.neo-tab-container')) {
                    if (tabs.checkVisibility({visibilityProperty: true})) {
                        const rect = tabs.getBoundingClientRect(),
                              w    = Math.max(0, Math.min(rect.right,  box.right)  - Math.max(rect.left, box.left)),
                              h    = Math.max(0, Math.min(rect.bottom, box.bottom) - Math.max(rect.top,  box.top));

                        visible += w * h
                    }
                }

                probe.touring && probe.ticks.push({swaps: probe.swaps, visible: Math.round(visible / (box.width * box.height) * 100)})
            };

            const tick = () => {
                channel.port2.postMessage(0);
                requestAnimationFrame(tick)
            };

            requestAnimationFrame(tick);

            // Every re-projection appends its staged shell to the host.
            new MutationObserver(records => {
                for (const record of records) {
                    for (const node of record.addedNodes) {
                        node.nodeType === 1 && node.classList.contains('neo-dashboard-dock-edge-zone') && probe.swaps++
                    }
                }
            }).observe(host, {childList: true})
        });

        await page.evaluate(() => {window.__commitContinuity.touring = true});
        await page.getByText('Start dense tour').click();

        // Three commits, the last one's cleanup landed: the host holds a single shell again.
        await page.waitForFunction(() => {
            return window.__commitContinuity.swaps >= 3 &&
                document.querySelectorAll('.workstation-dock-host > .neo-dashboard-dock-edge-zone').length === 1
        }, null, {timeout: 60000});

        const {swaps, ticks} = await page.evaluate(() => window.__commitContinuity),
              settled        = Math.max(...ticks.map(tick => tick.visible)),
              collapsed      = ticks.filter(tick => tick.visible < settled / 2);

        expect(swaps).toBeGreaterThanOrEqual(3);
        expect(collapsed, `the visible pane area collapsed across a commit (settled at ${settled}%)`).toEqual([])
    })
});
