import {test, expect} from '../../fixtures.mjs';

/**
 * @summary The compose controls journey: removable recipient selection + the priority radio group.
 *
 * Covers the three control contracts on the operator compose surface:
 * - toggle-deselect: clicking a selected recipient row unselects it (the `toggleOnClick`
 *   selection-model affordance — a multi-select whose selections are irrevocable is half a control);
 * - the chip row: the CURRENT selection renders as chips projected over the picker's own Store —
 *   each chip's native close button (action-named, keyboard-activatable) removes exactly its
 *   recipient through the selection model, and a LIVE roster replacement (rename/removal after
 *   selection) converges into the standing chips — one truth, two renders;
 * - broadcast exclusivity: `AGENT:*` and named recipients never co-exist — whichever side is newly
 *   picked wins and the other yields;
 * - priority: a three-option radio group, `high` preset, picking another moves the check.
 *
 * Recipient options are injected through the App Worker (the whitebox idiom): the offline static
 * roster feeds no named identities, and the surface contract under test is selection behavior,
 * not roster sourcing.
 *
 * Run: npx playwright test agentos/OperatorComposeControlsNL -c test/playwright/playwright.config.e2e.mjs
 */
test.describe('AgentOS operator compose — removable recipients + priority radios', () => {
    test.setTimeout(90000);

    test('toggle-deselect, chip remove, broadcast exclusivity and the radio group hold through real clicks', async ({page, neuralLink}) => {
        await page.goto('/apps/agentos/index.html');
        await expect(page.locator('.fm-fleet-cockpit')).toBeVisible({timeout: 60000});

        // open the Mailbox south tab (the compose surface's resident home)
        const mailboxTab = page.locator('.fm-fleet-cockpit .neo-tab-header-toolbar.neo-dock-top .neo-tab-header-button', {hasText: 'Mailbox'});

        await expect(mailboxTab).toBeVisible({timeout: 30000});
        await mailboxTab.click();

        const form = page.locator('.fm-operator-compose-form');

        await expect(form).toBeVisible({timeout: 30000});

        // inject named recipients through the worker — the roster seam, not the contract under test
        const
            app    = await neuralLink.connectToApp('AgentOS'),
            forms  = await app.findInstances({className: 'AgentOS.view.fleet.mailbox.ComposeForm'}, ['id']),
            formId = (Array.isArray(forms) ? forms[0] : forms)?.id;

        expect(formId, 'the compose form must exist in the App Worker').toBeTruthy();

        await app.setProperties(formId, {
            recipientOptions: [
                {id: 'AGENT:*', name: 'All agents (broadcast)'},
                {id: '@peer-a', name: 'Peer A'},
                {id: '@peer-b', name: 'Peer B'}
            ]
        });

        const
            row      = name => form.locator('.fm-operator-compose-recipients-list .neo-list-item', {hasText: name}),
            selected = form.locator('.fm-operator-compose-recipients-list .neo-list-item.neo-selected'),
            chips    = form.locator('.fm-compose-recipient-chip');

        await expect(row('Peer A')).toBeVisible();

        // ── select → chip; second click → toggle-deselect ────────────────────────────────────────
        await row('Peer A').click();
        await expect(selected).toHaveCount(1);
        await expect(chips).toHaveCount(1);
        await expect(chips.first()).toContainText('Peer A');

        await row('Peer A').click();
        await expect(selected, 'clicking a selected row unselects it (toggleOnClick)').toHaveCount(0);
        await expect(chips,    'the chip row follows the emptied selection').toHaveCount(0);

        // ── chip close removes exactly its recipient — mouse AND keyboard, action-named ─────────
        await row('Peer A').click();
        await row('Peer B').click();
        await expect(chips).toHaveCount(2);

        const removeOf = name => chips.filter({hasText: name}).locator('.neo-chip-close-button');

        // the remove affordance announces its ACTION, not just the recipient
        await expect(removeOf('Peer A')).toHaveAttribute('aria-label', 'Remove Peer A');

        await removeOf('Peer A').click();
        await expect(chips, 'the close button removed exactly one recipient').toHaveCount(1);
        await expect(chips.first()).toContainText('Peer B');
        await expect(selected).toHaveCount(1);

        // keyboard path: the close affordance is a native button — focus + Enter activates
        await removeOf('Peer B').focus();
        await page.keyboard.press('Enter');
        await expect(chips, 'keyboard activation removes the focused chip').toHaveCount(0);
        await expect(selected).toHaveCount(0);

        // ── broadcast exclusivity: AGENT:* wins over standing named picks… ───────────────────────
        await row('Peer B').click();
        await row('broadcast').click();
        await expect(chips, 'AGENT:* newly picked — named picks yield').toHaveCount(1);
        await expect(chips.first()).toContainText('broadcast');

        // …and a named pick wins over standing AGENT:* ──────────────────────────────────────────
        await row('Peer A').click();
        await expect(chips, 'a named pick newly made — AGENT:* yields').toHaveCount(1);
        await expect(chips.first()).toContainText('Peer A');

        // ── live roster replacement AFTER selection: rename + removal converge ──────────────────
        await app.setProperties(formId, {
            recipientOptions: [
                {id: 'AGENT:*', name: 'All agents (broadcast)'},
                {id: '@peer-a', name: 'Peer A Prime'}
            ]
        });

        await expect(chips.first(), 'a roster rename reaches the standing chip').toContainText('Peer A Prime');
        await expect(removeOf('Peer A Prime'), 'the remove name follows the rename').toHaveAttribute('aria-label', 'Remove Peer A Prime');
        await expect(selected, 'the picker selection survives, re-keyed onto the new record').toHaveCount(1);

        await app.setProperties(formId, {
            recipientOptions: [{id: 'AGENT:*', name: 'All agents (broadcast)'}]
        });

        await expect(chips,    'a recipient removed from the roster prunes its chip').toHaveCount(0);
        await expect(selected, 'and its picker selection').toHaveCount(0);

        // ── priority: three radios, high preset, picking another moves the check ─────────────────
        const radios = form.locator('.fm-compose-priority .neo-radiofield');

        await expect(radios).toHaveCount(3);
        await expect(radios.filter({hasText: 'high'}).locator('input'), 'high is the preset').toBeChecked();

        // the native input is visually hidden — the field surface is the click target
        await radios.filter({hasText: 'low'}).click();
        await expect(radios.filter({hasText: 'low'}).locator('input')).toBeChecked();
        await expect(radios.filter({hasText: 'high'}).locator('input')).not.toBeChecked()
    });
});
