import {test, expect}  from '@playwright/test';
import {readFileSync}  from 'fs';
import {fileURLToPath} from 'url';
import {dirname, join} from 'path';

/**
 * @summary Source-level safe-render + single-create-path constraints for the H2 chat intake.
 *
 * The intake submit routes through the Viewport controller, which renders any fail-closed reason as
 * safe vdom `text` (never `html` / `innerHTML`) and projects an accepted request into the EXISTING
 * evidence pane. The first widget is created exactly once — through the stage's `add → insert` seam,
 * projected into the evidence pane — so there is no forked second grid/demo path: the intake form
 * itself never instantiates a widget. These are source assertions (the Contract Ledger's safe-render
 * + single-path evidence), independent of the App-Worker render pipeline.
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

    test('creates the first widget once through the stage insert seam (no forked demo path)', () => {
        // the controller boots the grid through the stage's add/insert seam and projects it — one path
        expect(controller).toMatch(/widget-stage/);
        expect(controller).toMatch(/projectCreatedGrid/);
        // ...not a direct `new Grid(...)` instantiation that would bypass the create seam
        expect(controller).not.toMatch(/new\s+Grid/);
        // and the intake FORM itself never spins up a widget / grid path
        expect(intake).not.toMatch(/createComponent|grid-container|new\s+Grid/)
    })
});
