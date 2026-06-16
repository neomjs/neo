import {test, expect}  from '@playwright/test';
import {readFileSync}  from 'fs';
import {fileURLToPath} from 'url';
import {dirname, join} from 'path';

/**
 * @summary Source-level safe-render constraints for the H2 first-widget evidence pane.
 *
 * The EvidencePane renders agent- or user-authored request / response / blueprint-evidence text.
 * Per the safe-transcript constraint, that text must reach the DOM only through bounded Neo vdom
 * `text` nodes — never an unsafe raw-HTML path (`html` / `innerHTML`), which Neo treats as trusted
 * markup. This is a source
 * assertion (the Contract Ledger's rendering-safety evidence), so it stays a fast deterministic
 * unit check independent of the App-Worker render pipeline (a live render is the e2e's job).
 *
 * @see apps/agentos/childapps/widget/view/EvidencePane.mjs
 */
const source = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '../../../../../../../../apps/agentos/childapps/widget/view/EvidencePane.mjs'),
    'utf8'
);

// Strip block + line comments so the assertions check the executable CODE, not the JSDoc prose that
// deliberately NAMES the forbidden patterns it guards against.
const code = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');

test.describe('AgentOSWidget.view.EvidencePane — safe-render source constraints', () => {
    test('uses no unsafe raw-HTML render path', () => {
        // `innerHTML` and a vdom `html:` property both inject trusted markup — forbidden for the
        // agent/user-authored evidence text.
        expect(code).not.toMatch(/innerHTML/);
        expect(code).not.toMatch(/\bhtml\s*:/);
    });

    test('renders evidence as bounded vdom text routed through the safe projection', () => {
        // request / response / metadata reach the view as `text` (the safe vdom node) ...
        expect(code).toMatch(/\btext\s*:/);
        // ... and the blueprint is projected to scalar metadata, never rendered raw.
        expect(code).toMatch(/projectBlueprintEvidence/);
    });
});
