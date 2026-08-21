import {setup} from '../../../../../setup.mjs';

const appName = 'OperatorComposeFormTest';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: true,
        useDomApiRenderer      : true
    },
    appConfig: {
        name: appName
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../../src/core/_export.mjs';
// registers Neo.get — the ComboBox/Chip fields build an internal source-bound collection whose
// afterSetSourceId calls it; without this the spec crashes in isolation (green only when a sibling
// in the shared worker imported it first). Mirrors fleetCockpit.spec's robust import.
import Instance       from '../../../../../../../src/manager/Instance.mjs';

/**
 * @summary The operator compose surface's load-bearing contract: the wake semantics and the intent
 * seam. These assert the pane's OWN logic (`onSendClick`),
 * not `form.Container` validation (already covered upstream) — so `isValid` is stubbed to isolate the
 * unit under test: does the send button respect validity, and does it translate the operator's
 * "wake now" choice into the transport's `wakeSuppressed` correctly?
 */
test.describe('AgentOS OperatorComposeForm — operator write surface (#15377, D#15372 AC-7)', () => {
    let OperatorComposeForm;

    const createForm = cfg => Neo.create(OperatorComposeForm, {appName, ...cfg});

    /**
     * Force the mount-dependent field validation to a known verdict, SELECT recipients through the real
     * multi-select list (never a hand-fired `to` array), set the fields, and capture the fired `compose`
     * intent — isolating `onSendClick`'s own logic from `form.Container.isValid`.
     */
    const composeWith = async (form, {subject = 'S', body = 'B', wake, valid = true, recipients = ['@neo-opus-ada']} = {}) => {
        form.isValid = async () => valid;

        // feed the roster and select recipients through the REAL selection model — actual picker
        // selection, so the fired `to` array is produced by the component, not asserted into existence
        form.recipientOptions = [
            {id: '@neo-opus-ada',  name: 'Ada'},
            {id: '@neo-opus-vega', name: 'Vega'},
            {id: 'AGENT:*',        name: 'All agents (broadcast)'}
        ];

        const list = form.getReference('compose-recipients');
        list.selectionModel.select(recipients.map(id => list.store.get(id)));

        form.getReference('compose-subject').value = subject;
        form.getReference('compose-body').value    = body;
        wake !== undefined && (form.getReference('compose-wake').checked = wake);

        let captured = null;
        form.on('compose', data => {captured = data});
        await form.onSendClick();
        return captured
    };

    test.beforeAll(async () => {
        OperatorComposeForm = (await import('../../../../../../../apps/agentos/view/fleet/OperatorComposeForm.mjs')).default
    });

    test('the wake control defaults OFF — durable-quiet is the operator-preferred default (AC-7)', () => {
        const form = createForm();

        expect(form.getReference('compose-wake').checked).toBe(false);

        form.destroy()
    });

    test('wake OFF sends wakeSuppressed:true — durable, non-interrupting (AC-7 default)', async () => {
        const form     = createForm(),
              captured = await composeWith(form, {subject: 'Ship it', body: 'now', wake: false});

        expect(captured).toBeTruthy();
        // the inversion is the whole point: "wake now = off" ⇒ suppress the wake, keep it durable-quiet
        expect(captured.message.wakeSuppressed).toBe(true);
        expect(captured.message.subject).toBe('Ship it');

        form.destroy()
    });

    test('priority defaults to HIGH — operator steering ranks first at the recipient turn-start drain (AC-7)', async () => {
        // priority left untouched, so the sent value IS the field default — asserted on the fired
        // intent (the real contract), not the ComboBox's `.value` record
        const form     = createForm(),
              captured = await composeWith(form, {subject: 'steer', body: 'now'});

        // the AC-7 sender-side pairing: HIGH priority (ranked first when the recipient next drains) yet
        // wake OFF by default (durable-quiet) — "top of your queue when you next look, but no interrupt now"
        expect(captured.message.priority).toBe('high');

        form.destroy()
    });

    test('wake ON sends wakeSuppressed:false — the operator explicitly elected the interrupt', async () => {
        const form     = createForm(),
              captured = await composeWith(form, {wake: true});

        expect(captured.message.wakeSuppressed).toBe(false);

        form.destroy()
    });

    test('invalid input fires NO compose — the send button never fabricates a partial message', async () => {
        const form     = createForm(),
              captured = await composeWith(form, {valid: false});

        expect(captured).toBeNull();

        form.destroy()
    });

    test('recipientOptions injection feeds the picker store — same field, no principal-class branch (Vega AC)', () => {
        const form = createForm();

        form.recipientOptions = [
            {id: '@neo-opus-ada', name: 'Ada'},
            {id: 'AGENT:*',       name: 'All agents (broadcast)'}
        ];

        expect(form.getReference('compose-recipients').store.getCount()).toBe(2);

        form.destroy()
    });

    test('SEVERAL selected recipients fire as the `to` ARRAY — a real multi-select, not one scalar', async () => {
        // the whole reason the picker is a list.Base(singleSelect:false) and not a Chip/ComboBox: two
        // selections must survive as two, which the single-select primitive's getSelection()[0] cannot
        const form     = createForm(),
              captured = await composeWith(form, {recipients: ['@neo-opus-ada', '@neo-opus-vega']});

        expect(captured.message.to).toEqual(['@neo-opus-ada', '@neo-opus-vega']);

        form.destroy()
    });

    test('the AGENT:* broadcast row selects as a single-entry `to` — the cockpit sends it once, server-expanded', async () => {
        const form     = createForm(),
              captured = await composeWith(form, {recipients: ['AGENT:*']});

        expect(captured.message.to).toEqual(['AGENT:*']);

        form.destroy()
    });

    test('NO recipient selected → NO compose fired (a recipient is required; no partial message)', async () => {
        const form = createForm();

        // valid fields, but zero recipients selected — the send must refuse, never fabricate a send with
        // no destination (the required gate lives in onSendClick since the list has no field-level required)
        form.getReference('compose-subject').value = 'S';
        form.getReference('compose-body').value    = 'B';
        form.isValid = async () => true;

        let captured = null;
        form.on('compose', data => {captured = data});
        await form.onSendClick();

        expect(captured).toBeNull();

        form.destroy()
    });

    test('composeOutcome renders one verdict row PER recipient — a partial batch (sent + refused) is not collapsed', () => {
        const form = createForm();

        // the outcome the owner writes back after the fan-out settles — Ada sent, ghost refused
        form.composeOutcome = {results: [
            {to: '@neo-opus-ada', outcome: {messageId: 'M:1', status: 'sent'}},
            {to: '@ghost',        outcome: {status: 'rejected', reason: 'recipient unknown'}}
        ]};

        const rows = form.getReference('compose-outcome').vdom.cn;
        expect(rows).toHaveLength(2);
        expect(rows[0].text).toBe('@neo-opus-ada — sent');
        expect(rows[0].cls).toContain('is-sent');
        // the refusal is VISIBLE and carries its reason — the review's P1 (invisible refusals) closed
        expect(rows[1].text).toBe('@ghost — recipient unknown');
        expect(rows[1].cls).toContain('is-refused');

        form.destroy()
    });

    test('composeOutcome not-wired → a visible refusal row; pending → one in-flight line; null → cleared', () => {
        const form = createForm();

        form.composeOutcome = {results: [{to: 'AGENT:*', outcome: {status: 'not-wired', reason: 'x'}}]};
        expect(form.getReference('compose-outcome').vdom.cn[0].text).toBe('AGENT:* — not wired');
        expect(form.getReference('compose-outcome').vdom.cn[0].cls).toContain('is-refused');

        form.composeOutcome = {status: 'pending', count: 3};
        const pending = form.getReference('compose-outcome').vdom.cn;
        expect(pending).toHaveLength(1);
        expect(pending[0].cls).toContain('is-pending');
        expect(pending[0].text).toBe('Sending to 3…');

        form.composeOutcome = null;
        expect(form.getReference('compose-outcome').vdom.cn).toEqual([]);

        form.destroy()
    });

    test('a roster replacement AFTER selection converges chips, picker selection, and the sent to-array', async () => {
        const form  = createForm(),
              list  = form.getReference('compose-recipients'),
              chips = form.getReference('compose-recipient-chips');

        form.recipientOptions = [
            {id: '@neo-opus-ada',  name: 'Ada'},
            {id: '@neo-opus-vega', name: 'Vega'},
            {id: 'AGENT:*',        name: 'All agents (broadcast)'}
        ];

        list.selectionModel.select([list.store.get('@neo-opus-ada'), list.store.get('@neo-opus-vega')]);

        // the chip row is a Store-backed projection: filtered record count, record-driven text,
        // and the action-specific accessible remove name all come from the one record set
        expect(chips.items.length).toBe(2);
        expect(chips.items.map(chip => chip.text)).toEqual(['Ada', 'Vega']);
        expect(chips.items[0].removeLabel).toBe('Remove Ada');

        // the live-roster transition: Vega leaves the roster, Ada is renamed — AFTER selection
        form.recipientOptions = [
            {id: '@neo-opus-ada', name: 'Ada Prime'},
            {id: 'AGENT:*',       name: 'All agents (broadcast)'}
        ];

        // selection pruned to survivors, chips converged (renamed label, removed recipient gone)
        expect(list.selectionModel.items).toHaveLength(1);
        expect(chips.items.length).toBe(1);
        expect(chips.items[0].text).toBe('Ada Prime');
        expect(chips.items[0].removeLabel).toBe('Remove Ada Prime');

        // and the fired intent carries exactly the surviving selection
        form.isValid = async () => true;
        form.getReference('compose-subject').value = 'S';
        form.getReference('compose-body').value    = 'B';

        let captured = null;
        form.on('compose', data => {captured = data});
        await form.onSendClick();

        expect(captured.message.to).toEqual(['@neo-opus-ada']);

        form.destroy()
    });

    test('the chip remove event routes through the selection model — picker rows and chips converge', () => {
        const form  = createForm(),
              list  = form.getReference('compose-recipients'),
              chips = form.getReference('compose-recipient-chips');

        form.recipientOptions = [
            {id: '@neo-opus-ada',  name: 'Ada'},
            {id: '@neo-opus-vega', name: 'Vega'}
        ];

        list.selectionModel.select([list.store.get('@neo-opus-ada'), list.store.get('@neo-opus-vega')]);
        expect(chips.items.length).toBe(2);

        // the delegated close-click reports a recipient id; the form deselects through the ONE truth
        form.onRecipientChipRemove({recipientId: '@neo-opus-ada'});

        expect(list.selectionModel.items).toHaveLength(1);
        expect(chips.items.length).toBe(1);
        expect(chips.items[0].text).toBe('Vega');

        form.destroy()
    });

    test('onSendClick sets the pending outcome before firing — the honest in-flight state the owner overwrites', async () => {
        const form = createForm();

        // AGENT:* is exclusive by contract: batching it with a named pick settles to the broadcast
        // alone (the newly-picked side wins, the other yields), so the pending batch size is 1 and
        // the fired `to` carries exactly the survivor — the selection model is the one truth.
        const captured = await composeWith(form, {recipients: ['@neo-opus-ada', 'AGENT:*']});

        expect(captured.message.to).toEqual(['AGENT:*']);
        expect(form.composeOutcome).toEqual({status: 'pending', count: 1});

        form.destroy()
    })
});
