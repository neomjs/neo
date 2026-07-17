import {setup} from '../../../../../setup.mjs';

const appName = 'OperatorMailboxTest';

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
 * @summary The OperatorMailbox container's own contract: it COMPOSES the inbox pane + compose form
 * and RELAYS their intents up to the owner (never doing
 * transport itself), and it passes its injected state straight through to the right child. These
 * assert the relay/passthrough seams — the pieces that hold without the server halves wired.
 */
test.describe('AgentOS OperatorMailbox — the operator mailbox surface (#15377)', () => {
    let OperatorMailbox;

    const createBox = cfg => Neo.create(OperatorMailbox, {appName, ...cfg});

    test.beforeAll(async () => {
        OperatorMailbox = (await import('../../../../../../../apps/agentos/view/fleet/OperatorMailbox.mjs')).default
    });

    test('composes the read-half inbox pane above the write-half compose form', () => {
        const box = createBox();

        expect(box.getReference('operator-inbox-pane')).toBeTruthy();
        expect(box.getReference('operator-compose-form')).toBeTruthy();

        box.destroy()
    });

    test('relays the compose intent to the owner — re-sourced to the container, not the form', () => {
        const box = createBox();

        let relayed = null;
        box.on('compose', data => {relayed = data});

        box.getReference('operator-compose-form').fire('compose', {
            message: {to: ['@neo-opus-ada'], subject: 'S', body: 'B', priority: 'normal', wakeSuppressed: true},
            source : 'the-form'
        });

        expect(relayed).toBeTruthy();
        expect(relayed.message.subject).toBe('S');
        expect(relayed.message.wakeSuppressed).toBe(true);
        expect(relayed.source).toBe(box); // the owner sees the surface, not the inner field

        box.destroy()
    });

    test('relays the inbox page intent to the owner — the cockpit holds the read seam', () => {
        const box = createBox();

        let relayed = null;
        box.on('inboxPageRequest', data => {relayed = data});

        box.getReference('operator-inbox-pane').fire('pageRequest', {offset: 60, source: 'the-pane'});

        expect(relayed?.offset).toBe(60);
        expect(relayed.source).toBe(box);

        box.destroy()
    });

    test('passes the operator snapshot straight to the inbox pane', () => {
        const
            box  = createBox(),
            snap = {capability: {state: 'wired'}, admission: {state: 'granted'}, rows: [], page: {limit: 10, offset: 0, count: 0}};

        box.snapshot = snap;

        expect(box.getReference('operator-inbox-pane').snapshot).toBe(snap);

        box.destroy()
    });

    test('passes recipientOptions straight to the compose form', () => {
        const box = createBox();

        box.recipientOptions = [{id: '@neo-opus-ada', name: 'Ada'}, {id: 'AGENT:*', name: 'All agents'}];

        expect(box.getReference('operator-compose-form').recipientOptions).toEqual([
            {id: '@neo-opus-ada', name: 'Ada'},
            {id: 'AGENT:*',       name: 'All agents'}
        ]);

        box.destroy()
    })
});
