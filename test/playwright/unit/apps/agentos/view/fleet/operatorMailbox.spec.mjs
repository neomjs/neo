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
// registers Neo.get — the composed compose-form's ComboBox/Chip fields build an internal
// source-bound collection whose afterSetSourceId calls it; without this the spec crashes in
// isolation (green only when a sibling in the shared worker imported it first).
import Instance       from '../../../../../../../src/manager/Instance.mjs';

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
        // Neo stamps the fired `source` as the component id (the owner resolves it via
        // Neo.getComponent); this is the box's id, not the inner form's — the re-source landed
        expect(relayed.source).toBe(box.id)

        box.destroy()
    });

    test('relays the inbox page intent to the owner — the cockpit holds the read seam', () => {
        const box = createBox();

        let relayed = null;
        box.on('inboxPageRequest', data => {relayed = data});

        box.getReference('operator-inbox-pane').fire('pageRequest', {offset: 60, source: 'the-pane'});

        expect(relayed?.offset).toBe(60);
        expect(relayed.source).toBe(box.id);

        box.destroy()
    });

    test('passes the operator snapshot straight to the inbox pane', () => {
        const
            box  = createBox(),
            snap = {capability: {state: 'wired'}, admission: {state: 'granted'}, rows: [], page: {limit: 10, offset: 0, count: 0}};

        box.snapshot = snap;

        // deep-equal, not reference: the shipped MailboxPane clones its snapshot config on set —
        // the passthrough delivers the full content, which is what "straight to the pane" means
        expect(box.getReference('operator-inbox-pane').snapshot).toStrictEqual(snap);

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
    });

    test('passes the compose outcome straight to the compose form — the per-recipient render source', () => {
        const box     = createBox(),
              outcome = {results: [{to: '@neo-opus-ada', outcome: {messageId: 'M:1', status: 'sent'}}]};

        // the cockpit writes the settled outcome onto this surface; it relays straight to the form, which
        // renders the per-recipient verdicts (this surface holds no transport of its own)
        box.composeOutcome = outcome;

        // deep-equal, not reference: the reactive config clones on set (as snapshot does) — the passthrough
        // delivers the full content, which is what "straight to the form" means
        expect(box.getReference('operator-compose-form').composeOutcome).toStrictEqual(outcome);

        box.destroy()
    });

    test('a newly-bound operator record fires the initial own-inbox read (relayed inboxPageRequest, offset 0)', () => {
        const box = createBox();

        let relayed = null;
        box.on('inboxPageRequest', data => {relayed = data});

        // AgentDetail-style read-on-record: a pane materialized after boot, when the operator identity is
        // already resolved owner-side, lands its inbox without a page gesture
        box.record = {agentIdentityNodeId: 'NODE:operator'};

        expect(relayed?.offset).toBe(0);
        expect(relayed.source).toBe(box.id);
        // and the subject still flows to the inbox pane
        expect(box.getReference('operator-inbox-pane').record).toEqual({agentIdentityNodeId: 'NODE:operator'});

        box.destroy()
    });

    test('clearing the record (→ null) fires NO read — there is no subject to read', () => {
        const box = createBox({record: {agentIdentityNodeId: '@neo-opus-grace', githubUsername: 'neo-opus-grace'}});

        let fired = 0;
        box.on('inboxPageRequest', () => {fired++});

        box.record = null;

        expect(fired).toBe(0);

        box.destroy()
    });

    test('reveal-after-boot: state injected as CONSTRUCTION configs reaches the children (real component, review RA-1)', () => {
        // the normal reveal path: the projection materializes the pane with the operator identity, its
        // snapshot, and recipient options ALREADY resolved owner-side, supplied as construction configs.
        // Before the onConstructed flush, afterSet* skipped these (isConstructed false) and the children
        // materialized EMPTY — the pane could not pass possession. This is the real composed component,
        // not a spy or a post-construction assignment.
        const record   = {agentIdentityNodeId: '@neo-opus-grace', githubUsername: 'neo-opus-grace'},
              snapshot = {capability: {state: 'wired'}, admission: {state: 'granted', subjectAgentId: '@neo-opus-grace'}, rows: [], page: {limit: 10, offset: 0, count: 0}},
              options  = [{id: '@neo-opus-ada', name: 'Ada'}, {id: 'AGENT:*', name: 'All agents'}];

        const box = createBox({record, snapshot, recipientOptions: options});

        expect(box.getReference('operator-inbox-pane').record).toEqual(record);
        expect(box.getReference('operator-inbox-pane').snapshot).toStrictEqual(snapshot);
        expect(box.getReference('operator-compose-form').recipientOptions).toEqual(options);

        box.destroy()
    })

    test('the seat-conflation marker renders ONLY a verified conflation — null and clean stay silent', () => {
        const box    = createBox(),
              marker = box.getReference('operator-identity-warning');

        // default: no posture → hidden (unknown is not a warning)
        expect(marker.hidden).toBe(true);

        // a clean posture needs no chrome
        box.identityPosture = {conflated: false, seatIdentity: '@tobiu'};
        expect(marker.hidden).toBe(true);

        // a verified conflation renders the truth beside the compose surface
        box.identityPosture = {conflated: true, seatIdentity: '@neo-fable-clio'};
        expect(marker.hidden).toBe(false);
        expect(marker.text).toContain('@neo-fable-clio');
        expect(marker.text).toContain('operator principal not established');

        // posture withdrawal hides it again — the marker asserts current truth only
        box.identityPosture = null;
        expect(marker.hidden).toBe(true);

        box.destroy()
    });

    test('a construction-time posture flushes to the marker on the reveal path', () => {
        const box    = createBox({identityPosture: {conflated: true, seatIdentity: '@neo-opus-vega'}}),
              marker = box.getReference('operator-identity-warning');

        expect(marker.hidden).toBe(false);
        expect(marker.text).toContain('@neo-opus-vega');

        box.destroy()
    });
});
