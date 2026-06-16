import {test, expect}  from '@playwright/test';
import {readFileSync}  from 'fs';
import {fileURLToPath} from 'url';
import {dirname, join} from 'path';

/**
 * @summary Source-level safe-render + blueprint-path-reuse constraints for the H2 chat intake.
 *
 * The intake submit routes through the Viewport controller, which renders any fail-closed reason as
 * safe vdom `text` (never `html` / `innerHTML`) and projects an accepted request into the EXISTING
 * evidence pane — it must NOT spin up a second widget / grid path. These are source assertions (the
 * Contract Ledger's safe-render + reuse evidence), independent of the App-Worker render pipeline.
 *
 * @see apps/agentos/childapps/widget/view/RequestIntake.mjs
 * @see apps/agentos/childapps/widget/view/ViewportController.mjs
 */
const viewDir = dirname(fileURLToPath(import.meta.url));

const read = name => readFileSync(
    join(viewDir, '../../../../../../../../apps/agentos/childapps/widget/view/', name),
    'utf8'
).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

const intake     = read('RequestIntake.mjs'),
      controller = read('ViewportController.mjs');

test.describe('AgentOSWidget chat intake — safe-render + blueprint-path-reuse source constraints', () => {
    test('intake + controller use no unsafe raw-HTML render path', () => {
        for (const src of [intake, controller]) {
            expect(src).not.toMatch(/innerHTML/);
            expect(src).not.toMatch(/\bhtml\s*:/)
        }
    });

    test('controller validates input and projects into the EXISTING evidence pane', () => {
        expect(controller).toMatch(/validateRequest/);
        expect(controller).toMatch(/evidence-pane/)
    });

    test('introduces no duplicate widget / grid path (reuses the first-widget blueprint path)', () => {
        for (const src of [intake, controller]) {
            expect(src).not.toMatch(/createComponent|grid-container|new\s+Grid/)
        }
    })
});
