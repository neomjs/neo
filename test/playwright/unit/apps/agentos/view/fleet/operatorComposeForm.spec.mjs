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
     * Force the mount-dependent field validation to a known verdict, set the fields, and capture the
     * fired `compose` intent — isolating `onSendClick`'s own logic from `form.Container.isValid`.
     */
    const composeWith = async (form, {subject = 'S', body = 'B', wake, valid = true} = {}) => {
        form.isValid = async () => valid;

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
        expect(captured.message.priority).toBe('normal');

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
    })
});
