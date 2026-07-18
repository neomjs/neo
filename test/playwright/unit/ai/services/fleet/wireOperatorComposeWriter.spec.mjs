import {setup}                     from '../../../../setup.mjs';
import {test, expect}              from '@playwright/test';
import Neo                         from '../../../../../../src/Neo.mjs';
import * as core                   from '../../../../../../src/core/_export.mjs';
import {wireOperatorComposeWriter} from '../../../../../../ai/services/fleet/wireOperatorComposeWriter.mjs';
import FleetControlBridge          from '../../../../../../ai/services/fleet/FleetControlBridge.mjs';

/**
 * @summary Contract of the compose-writer wiring + the composeOperatorMessage verb: the wire's
 * first WRITE seam installs a real injected writer (never an imported singleton), refuses honestly
 * when unwired, and is smuggling-proof by construction — the verb's payload is whitelisted
 * field-by-field, so caller-supplied identity fields never reach the mailbox primitive; the sender
 * is exclusively the ambient request identity the authenticated ingress stamped, resolved inside
 * `MailboxService.addMessage` as the server-stamped principal. This unit pins the pure
 * wiring + verb decisions with injected doubles; the live stamped-chain receipt is the running
 * devFleetServer's concern.
 */
test.describe('Neo.ai.services.fleet.wireOperatorComposeWriter', () => {
    const stubBridge = () => ({composeWriter: null});

    test.afterEach(() => {
        FleetControlBridge.composeWriter = null;
    });

    test('fail-soft: no addMessage function → returns null and leaves the bridge unwired (never fabricates a writer)', () => {
        const bridge = {composeWriter: 'UNTOUCHED'};

        expect(wireOperatorComposeWriter({bridge})).toBeNull();
        expect(wireOperatorComposeWriter({bridge, addMessage: 'not-a-function'})).toBeNull();
        // the honest not-wired default must stand — no fabricated writer installed
        expect(bridge.composeWriter).toBe('UNTOUCHED');
    });

    test('installs the injected writer on the bridge and returns it', () => {
        const bridge     = stubBridge();
        const addMessage = () => ({messageId: 'MESSAGE:x'});

        const writer = wireOperatorComposeWriter({bridge, addMessage});

        expect(writer).toBe(bridge.composeWriter);
        expect(bridge.composeWriter.addMessage).toBe(addMessage);
    });

    test('composeOperatorMessage answers an honest not-wired refusal when no writer is installed', () => {
        const result = FleetControlBridge.composeOperatorMessage({to: 'AGENT:*', subject: 's', body: 'b'});

        expect(result.status).toBe('not-wired');
        expect(result.reason).toContain('not wired');
    });

    test('#15379 smuggling negative: caller-supplied identity fields NEVER reach the writer — the payload is whitelisted by construction', async () => {
        let captured = null;
        wireOperatorComposeWriter({addMessage: payload => { captured = payload; return {messageId: 'MESSAGE:ok'}; }});

        const result = await FleetControlBridge.composeOperatorMessage({
            to            : 'AGENT:*',
            subject       : 'weekend focus',
            body          : 'steer payload',
            priority      : 'high',
            wakeSuppressed: false,
            relatedTickets: ['#15379'],
            // The smuggling attempt: every sender-shaped field a hostile caller could try. None of
            // these may reach the mailbox primitive — the author is the transport-stamped ambient
            // identity, resolved inside addMessage, never a wire parameter.
            from                : '@mallory',
            sender              : '@mallory',
            senderPrincipalClass: 'human',
            agentIdentityNodeId : '@mallory',
            userId              : 'mallory'
        });

        expect(result.messageId).toBe('MESSAGE:ok');

        // Whitelisted fields pass through exactly...
        expect(captured).toEqual({
            to            : 'AGENT:*',
            subject       : 'weekend focus',
            body          : 'steer payload',
            priority      : 'high',
            wakeSuppressed: false,
            relatedTickets: ['#15379']
        });
        // ...and the assertion above is exhaustive (toEqual): no identity-shaped key survived.
        for (const smuggled of ['from', 'sender', 'senderPrincipalClass', 'agentIdentityNodeId', 'userId']) {
            expect(Object.hasOwn(captured, smuggled), `${smuggled} must never cross the seam`).toBe(false);
        }
    });

    test('omitted priority/wakeSuppressed are NOT sent as undefined — the sender-class defaults stay the primitive\'s decision', async () => {
        let captured = null;
        wireOperatorComposeWriter({addMessage: payload => { captured = payload; return {messageId: 'MESSAGE:ok'}; }});

        await FleetControlBridge.composeOperatorMessage({to: '@neo-fable', subject: 's', body: 'b'});

        // Absent keys (not undefined values): addMessage's sender-class default resolution
        // (human ⇒ quiet + high) must see a genuinely-omitted field, not an explicit undefined.
        expect(Object.hasOwn(captured, 'priority')).toBe(false);
        expect(Object.hasOwn(captured, 'wakeSuppressed')).toBe(false);
        expect(Object.hasOwn(captured, 'relatedTickets')).toBe(false);
    });

    test('#15400 shape-guard: a non-array relatedTickets is REJECTED and the writer is NEVER invoked', async () => {
        // Finding-1 of the compose verb's break-it review: the fleet wire has no schema layer, and
        // MailboxService.addMessage spreads relatedTickets — so a string would CHAR-SPLIT into garbage
        // WAL refs (e.g. '15379' stores ['1','5','3','7','9']) and a number would THROW mid-send. The
        // verb rejects at the seam, before the writer is ever invoked. undefined (omit) + a real array
        // pass-through are pinned by the sibling witnesses above.
        for (const bad of ['15379', 42, {0: '15379'}]) {
            let invoked = false;
            wireOperatorComposeWriter({addMessage: () => { invoked = true; return {messageId: 'MESSAGE:x'}; }});

            const result = await FleetControlBridge.composeOperatorMessage({to: 'AGENT:*', subject: 's', body: 'b', relatedTickets: bad});

            expect(result.status, `${JSON.stringify(bad)} must be rejected`).toBe('rejected');
            expect(result.reason).toContain('relatedTickets must be an array');
            expect(invoked, `the writer must NEVER be invoked for a non-array relatedTickets (${JSON.stringify(bad)})`).toBe(false);
        }
    });
});
