import {test, expect} from '@playwright/test';

let formId;

/**
 * @summary The mounted credential-boundary witness for the S5 add-agent surface (the fleet
 * credential matrix): credential bytes typed into the PAT field must exist NOWHERE outside that field —
 * not in localStorage, not in sessionStorage, not in the URL, not on the console — and an absent
 * bridge must render the honest `gated` affordance (submit disabled-with-reason, never hidden).
 *
 * The round-trip half (clear-on-settle, readback event) is witnessed in the Node unit spec, where
 * a bridge stub can cross into the instance; a function cannot cross the worker boundary here, so
 * this file owns exactly the half only a real browser can witness: the storage/URL/console sinks.
 *
 * All assertions are platform-independent string checks — no fonts, no colors, no geometry.
 */
test.describe('AgentOS.view.fleet.AddAgentForm — mounted credential boundary (#13058 matrix)', () => {
    const SENTINEL = 'github_pat_MOUNTED_WITNESS_98761234abcd';

    test.beforeEach(async ({page}) => {
        await page.goto('test/playwright/component/apps/empty-viewport/index.html');
        await page.waitForSelector('#component-test-viewport', {state: 'attached'});
    });

    test.afterEach(async ({page}) => {
        if (formId) {
            await page.evaluate(id => Neo.worker.App.destroyNeoInstance(id), formId);
            formId = null;
        }
    });

    test('typed credential bytes reach no sink: storage, URL, console — and the gated affordance is honest', async ({page}) => {
        const consoleLines = [];
        page.on('console', message => consoleLines.push(message.text()));

        const result = await page.evaluate(config => Neo.worker.App.createNeoInstance(config), {
            importPath: '../../apps/agentos/view/fleet/instances/AddAgentForm.mjs',
            ntype     : 'fm-add-agent-form',
            parentId  : 'component-test-viewport'
        });

        if (!result.success) {
            throw new Error(`Component creation failed: ${result.error.message}`);
        }

        formId = result.id;

        const form = page.locator(`#${formId}`);
        await expect(form).toBeVisible();

        // the gated affordance: no bridge exists in this harness, so the submit control must be
        // DISABLED (not hidden) and the reason must be rendered text, not a tooltip-only fact
        const submit = form.locator('.fm-add-submit');
        await expect(submit).toBeVisible();
        await expect(submit).toBeDisabled();
        await expect(form.locator('.fm-add-status')).toContainText('fails closed');

        // type the sentinel into the PAT field — the ONE place credential bytes may exist
        const patInput = form.locator('input[type="password"]');
        await patInput.fill(SENTINEL);
        await expect(patInput).toHaveValue(SENTINEL);

        // the matrix: every sink outside the field stays clean
        const sinks = await page.evaluate(() => {
            const dump = storage => {
                const entries = [];
                for (let i = 0; i < storage.length; i++) {
                    const key = storage.key(i);
                    entries.push(`${key}=${storage.getItem(key)}`)
                }
                return entries.join('\n')
            };

            return {
                href          : location.href,
                localStorage  : dump(localStorage),
                sessionStorage: dump(sessionStorage)
            }
        });

        expect(sinks.href).not.toContain(SENTINEL);
        expect(sinks.localStorage).not.toContain(SENTINEL);
        expect(sinks.sessionStorage).not.toContain(SENTINEL);
        expect(consoleLines.join('\n')).not.toContain(SENTINEL);

        // positive control for the console sink: the capture pipe must demonstrably carry page
        // console output, or the "no echo" verdict above is a blind instrument, not a clean pass
        await page.evaluate(() => console.log('console-capture-control-alive'));
        await expect.poll(() => consoleLines.join('\n')).toContain('console-capture-control-alive');
    });
});
