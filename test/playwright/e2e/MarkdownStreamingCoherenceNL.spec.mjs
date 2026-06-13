import {test, expect} from '../fixtures.mjs';

/**
 * @summary The markdown component's registry observe-run: a real multi-chunk streaming session.
 *
 * Streams the demo source chunk-wise through the REAL pipeline (App Worker parse → VDom diff →
 * serialized batches → Main apply) with `useDeltaCoherenceRegistry` enabled — the exact
 * producer class the coherence ledger exists to police (a streaming incremental parser with
 * id-reuse logic). ANY coherence finding here is either a parser id-discipline bug or a
 * registry false positive; both block their respective promotion paths, so this run is
 * load-bearing for two contracts at once.
 *
 * Whitebox anchors: the App-Worker component's `value` must settle to the complete source
 * (engine truth), and the rendered output must contain ZERO live script elements while the
 * hostile payload renders as visible text (the no-innerHTML security contract, asserted
 * against the real DOM).
 */
test.describe('Markdown streaming coherence observe-run (real pipeline)', () => {
    test.setTimeout(90000);

    test('a full chunk-streamed replay produces zero coherence findings and inert hostile content', async ({page, neuralLink}) => {
        const coherenceWarnings = [];

        page.on('console', msg => {
            const text = msg.text();

            if (text.includes('Delta coherence findings')) {
                coherenceWarnings.push(text.slice(0, 500))
            }
        });

        await page.goto('/examples/component/markdown/index.html');

        const app = await neuralLink.connectToApp('Neo.examples.component.markdown');

        await page.waitForSelector('.neo-markdown-vdom', {state: 'visible', timeout: 30000});
        await page.waitForTimeout(500);

        // Enable the coherence registry in the MAIN realm via the runtime-flip path.
        await page.evaluate(async () => {
            Neo.config.useDeltaCoherenceRegistry = true;
            await Neo.main.DeltaUpdates.importDeltaInstruments()
        });

        const baseline = await page.evaluate(() => Neo.main.DeltaUpdates.coherenceRegistry.batchCount);

        // Drive the chunk-streaming replay — the LLM-response producer shape.
        await page.locator('.neo-button', {hasText: 'Stream demo'}).first().click();

        // The replay settles when the final paragraph (the hostile-content line) renders.
        await page.waitForSelector('text=render as plain text', {timeout: 60000});
        await page.waitForTimeout(300); // drain the last batch

        const state = await page.evaluate(() => {
            const registry = Neo.main.DeltaUpdates.coherenceRegistry;

            return {
                batches: registry.batchCount,
                live   : registry.liveSnapshot.size,
                retired: registry.retiredSnapshot.size
            }
        });

        // Activity proof: the chunked replay must have produced substantial batch traffic.
        expect(state.batches - baseline).toBeGreaterThan(20);
        expect(state.live).toBeGreaterThan(30);

        // THE observe-run assertion: zero coherence findings across the streaming session.
        expect(coherenceWarnings).toEqual([]);

        // Whitebox engine truth: the App-Worker component settled on the complete source.
        const components = await app.queryComponent({ntype: 'markdown-vdom'}, ['value']);

        expect(components.length).toBe(1);

        const value = components[0].properties?.value ?? components[0].value;

        expect(value).toContain('# Streaming Markdown, VDOM-native');
        expect(value).toContain('render as plain text');

        // Security contract against the real DOM: the hostile payload is visible TEXT,
        // and no script element exists anywhere inside the rendered output.
        const domFacts = await page.evaluate(() => {
            const host = document.querySelector('.neo-markdown-vdom');

            return {
                scripts   : host.querySelectorAll('script').length,
                anchors   : Array.from(host.querySelectorAll('a')).map(a => a.getAttribute('href')),
                hostileTxt: host.textContent.includes("alert('nope')")
            }
        });

        expect(domFacts.scripts).toBe(0);
        expect(domFacts.hostileTxt).toBe(true);
        domFacts.anchors.forEach(href => {
            // Allowlist mirror of the parser's SAFE_DESTINATION contract: a scheme may only be
            // https/http/mailto; everything else must be scheme-less or a fragment. Asserting
            // the allowlist (not a scheme denylist) keeps the check complete by construction —
            // javascript:, data:, vbscript:, file: and any future scheme all fail it.
            expect(href).toMatch(/^(?:https?:|mailto:)[^\s]*$|^[^:]*$|^#/)
        });

        console.log(`[MarkdownStreamingCoherenceNL] batches: ${state.batches - baseline}, live: ${state.live}, retired: ${state.retired}, findings: ${coherenceWarnings.length}`)
    });

    test('marathon windowing: bounded DOM through a 40× stream + scroll battery, zero coherence findings', async ({page, neuralLink}) => {
        const coherenceWarnings = [];

        page.on('console', msg => {
            const text = msg.text();

            if (text.includes('Delta coherence findings')) {
                coherenceWarnings.push(text.slice(0, 500))
            }
        });

        await page.goto('/examples/component/markdown/index.html');
        await neuralLink.connectToApp('Neo.examples.component.markdown');
        await page.waitForSelector('.neo-markdown-vdom', {state: 'visible', timeout: 30000});
        await page.waitForTimeout(500);

        await page.evaluate(async () => {
            Neo.config.useDeltaCoherenceRegistry = true;
            await Neo.main.DeltaUpdates.importDeltaInstruments()
        });

        // The marathon: 40 repetitions of the full-grammar source streamed in coarse chunks.
        await page.locator('.neo-button', {hasText: 'Stream marathon'}).first().click();
        await page.waitForSelector('text=Marathon section 40', {timeout: 60000}).catch(() => {});
        await page.waitForTimeout(2000); // settle the tail

        const domFacts = () => page.evaluate(() => {
            const host = document.querySelector('.neo-markdown-vdom');

            return {
                children: host.children.length,
                spacers : host.querySelectorAll(':scope > .neo-md-spacer').length,
                topPx   : parseInt(host.querySelector(':scope > .neo-md-spacer')?.style.height) || 0
            }
        });

        const streamed = await domFacts();

        // The windowing claim: hundreds of estimated pages streamed, the DOM holds only the
        // mounted window + 2 spacers — NOT the thousands of blocks the marathon parsed.
        expect(streamed.spacers).toBe(2);
        expect(streamed.children).toBeLessThan(400);
        expect(streamed.topPx).toBeGreaterThan(1000); // the evicted prefix lives in the spacer

        // Scroll battery: jump towards the top, then back down — the window slides through
        // eviction/re-birth cycles the registry treats as the LEGAL remove→insert lifecycle.
        const scrollHost = page.locator('.neo-markdown-vdom');

        await scrollHost.evaluate(node => { node.scrollTop = 0 });
        await page.waitForTimeout(600);

        const atTop = await domFacts();

        expect(atTop.topPx).toBe(0);
        expect(atTop.children).toBeLessThan(400);

        await scrollHost.evaluate(node => { node.scrollTop = node.scrollHeight });
        await page.waitForTimeout(600);

        // THE corpus assertion: the full stream + window churn produced zero findings.
        expect(coherenceWarnings).toEqual([]);

        const registry = await page.evaluate(() => ({
            batches: Neo.main.DeltaUpdates.coherenceRegistry.batchCount,
            retired: Neo.main.DeltaUpdates.coherenceRegistry.retiredSnapshot.size
        }));

        // Eviction happened for real: retired ids accumulated from window slides.
        expect(registry.retired).toBeGreaterThan(0);

        console.log(`[MarkdownMarathonNL] dom children: ${streamed.children}, top spacer: ${streamed.topPx}px, retired: ${registry.retired}, findings: ${coherenceWarnings.length}`)
    });
});
