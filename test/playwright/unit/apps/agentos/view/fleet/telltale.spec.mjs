import {setup} from '../../../../../setup.mjs';

setup({
    appConfig: {
        name: 'FleetTelltaleTest'
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../../src/core/_export.mjs';

import {describeTelltale, TELLTALE_NOMINAL} from '../../../../../../../apps/agentos/view/fleet/telltale.mjs';

/**
 * @summary The S2 telltale contract.
 *
 * The load-bearing distinction is `unknown` vs `null`, and it is the reason the module exists: the
 * producer's `unknown` means it LOOKED and could not see — an observation the operator must be told —
 * while `null` means the roster row carried no axis, which is the absence of an observation. Collapse
 * them and the card either reports blindness nobody claimed, or renders a real blindness as healthy.
 */
test.describe('AgentOS.view.fleet.telltale — two orthogonal axes, one compound chip', () => {
    test('nominal on both axes earns ZERO card pixels', () => {
        expect(describeTelltale({wake: {state: 'on'}, throttle: {state: 'none'}}))
            .toEqual({hidden: true, text: ''})
    });

    test('the nominal vocabulary is the producers\', not this module\'s invention', () => {
        // If a producer's nominal value ever drifts, this fails here rather than silently rendering
        // every healthy agent as an exception.
        expect(TELLTALE_NOMINAL).toEqual({throttle: 'none', wake: 'on'})
    });

    test('`unknown` is an OBSERVATION and earns a chip — never rendered as healthy', () => {
        // The producer looked and could not see. That is a fact, and hiding it is the exact failure
        // the taxonomy exists to prevent.
        expect(describeTelltale({wake: {state: 'unknown'}, throttle: {state: 'none'}}))
            .toEqual({hidden: false, text: 'wake unknown'});

        expect(describeTelltale({wake: {state: 'on'}, throttle: {state: 'unknown'}}))
            .toEqual({hidden: false, text: 'unknown'})
    });

    test('`null` is the ABSENCE of an observation — no chip, and no manufactured unknown', () => {
        // The row carried no axis. Defaulting to 'unknown' here would report blindness the producer
        // never claimed — an invented observation, which is the inverse defect of hiding a real one.
        expect(describeTelltale({wake: null, throttle: null})).toEqual({hidden: true, text: ''});
        expect(describeTelltale({})).toEqual({hidden: true, text: ''});
        expect(describeTelltale()).toEqual({hidden: true, text: ''})
    });

    test('a null axis alongside a non-nominal one reports ONLY what was observed', () => {
        // The un-stamped axis contributes nothing — it is not 'unknown', it is absent.
        expect(describeTelltale({wake: {state: 'suppressed'}, throttle: null}))
            .toEqual({hidden: false, text: 'wake suppressed'})
    });

    test('BOTH axes non-nominal → exactly ONE compound chip — the incident this answers', () => {
        // The lived failure: wake daemon hand-disabled AND a session rate limit, at once, both
        // invisible. Two simultaneous exceptions must not cost two chips, and a single enum could
        // only ever have reported one of them.
        expect(describeTelltale({wake: {state: 'off'}, throttle: {state: 'rate-limited'}}))
            .toEqual({hidden: false, text: 'wake off · rate-limited'})
    });

    test('every non-nominal state in each axis vocabulary is reportable', () => {
        // A closed vocabulary is only honest if none of its members can go silently missing.
        ['off', 'suppressed', 'unknown'].forEach(state => {
            expect(describeTelltale({wake: {state}}).hidden, `wake ${state} must report`).toBe(false)
        });

        ['overage', 'rate-limited', 'unknown'].forEach(state => {
            expect(describeTelltale({throttle: {state}}).hidden, `throttle ${state} must report`).toBe(false)
        })
    });

    test('the whole observation travels — confidence and reason do not change the chip decision', () => {
        // The chip reads `state` only. `confidence`/`reason` are the producer's evidence and belong in
        // the detail readout; a chip that changed with confidence would make two different producers'
        // 'unknown' render differently for no operator-visible reason.
        expect(describeTelltale({wake: {state: 'on', confidence: 'none', reason: 'noisy'}}))
            .toEqual({hidden: true, text: ''})
    })
});
