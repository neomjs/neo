import {setup} from '../../../../../../setup.mjs';

setup({
    appConfig: {
        name: 'FleetTelltaleTest'
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../../../src/core/_export.mjs';

import {describeTelltale, describeTelltaleReadout, TELLTALE_CARD_DEVIANT, TELLTALE_NOMINAL} from '../../../../../../../../apps/agentos/util/telltale.mjs';

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
            .toEqual({ariaLabel: null, hidden: true, text: '', title: null})
    });

    test('the nominal vocabulary is the producers\', not this module\'s invention', () => {
        // If a producer's nominal value ever drifts, this fails here rather than silently rendering
        // every healthy agent as an exception.
        expect(TELLTALE_NOMINAL).toEqual({throttle: 'none', wake: 'on'})
    });

    test('`unknown` is card-SILENT and detail-visible — the ledger\'s density resolution', () => {
        // The producer looked and could not see. That is a fact the operator must be told — in the
        // DETAIL. On the card it is silent, and this is the one rule that looks like a regression and
        // is not: the throttle adapter ships a contract and a SEAM, with no truth source in the
        // platform yet, so it honestly answers `unknown` for EVERY row. Chipping on it means every
        // card chips forever, which inverts the density contract the chip exists to serve.
        //
        // Measured against the default adapter: 3 agents, 3 `unknown`s, 3 chips. "The producers
        // landed" was true and did not imply the producers can see.
        expect(describeTelltale({wake: {state: 'unknown'}, throttle: {state: 'none'}}))
            .toEqual({ariaLabel: null, hidden: true, text: '', title: null});

        expect(describeTelltale({wake: {state: 'on'}, throttle: {state: 'unknown'}}))
            .toEqual({ariaLabel: null, hidden: true, text: '', title: null});

        // …and the fact still reaches the operator, unhidden, where there is room for it
        expect(describeTelltaleReadout({wake: {state: 'on'}, throttle: {state: 'unknown', reason: 'no reader'}}))
            .toContainEqual({axis: 'throttle', state: 'unknown', nominal: false, reported: true, reason: 'no reader'})
    });

    test('the card chips on an ENUMERATED deviation, never on "not nominal"', () => {
        // The two read identically today and diverge on every state added later: negation promotes any
        // new or out-of-contract producer value straight onto every card at once, which is precisely
        // how `unknown` got there. Silent on the card, loud in the detail, is the right way round for
        // a surface whose budget is pixels.
        expect(TELLTALE_CARD_DEVIANT).toEqual({throttle: ['overage', 'rate-limited'], wake: ['off', 'suppressed']});

        // an out-of-contract answer earns no card pixels — but is still stated verbatim in the detail
        expect(describeTelltale({wake: {state: 'wat'}, throttle: {state: 'none'}})).toEqual({ariaLabel: null, hidden: true, text: '', title: null});
        expect(describeTelltaleReadout({wake: {state: 'wat'}, throttle: null})[0].state).toBe('wat')
    });

    test('`null` is the ABSENCE of an observation — no chip, and no manufactured unknown', () => {
        // The row carried no axis. Defaulting to 'unknown' here would report blindness the producer
        // never claimed — an invented observation, which is the inverse defect of hiding a real one.
        expect(describeTelltale({wake: null, throttle: null})).toEqual({ariaLabel: null, hidden: true, text: '', title: null});
        expect(describeTelltale({})).toEqual({ariaLabel: null, hidden: true, text: '', title: null});
        expect(describeTelltale()).toEqual({ariaLabel: null, hidden: true, text: '', title: null})
    });

    test('a null axis alongside a non-nominal one reports ONLY what was observed', () => {
        // The un-stamped axis contributes nothing — it is not 'unknown', it is absent.
        expect(describeTelltale({wake: {state: 'suppressed'}, throttle: null}))
            .toEqual({
                ariaLabel: 'Telltale: wake suppressed',
                hidden   : false,
                text     : 'wake suppressed',
                // the title states BOTH axes — including the one that reported nothing, which is a
                // different fact from a nominal one and must not read as "throttle is fine"
                title    : 'wake: suppressed · throttle: not reported'
            })
    });

    test('BOTH axes non-nominal → exactly ONE compound chip — the incident this answers', () => {
        // The lived failure: wake daemon hand-disabled AND a session rate limit, at once, both
        // invisible. Two simultaneous exceptions must not cost two chips, and a single enum could
        // only ever have reported one of them.
        // BOTH deviations name their axis. The first cut emitted a bare `rate-limited`: six characters
        // saved, and the reader left to know which of two disjoint vocabularies the word came from —
        // on the one surface that exists to be read at a glance.
        expect(describeTelltale({wake: {state: 'off'}, throttle: {state: 'rate-limited'}}))
            .toEqual({
                ariaLabel: 'Telltale: wake off, throttle rate-limited',
                hidden   : false,
                text     : 'wake off · throttle rate-limited',
                title    : 'wake: off · throttle: rate-limited'
            })
    });

    test('the full predicate matrix: every ACTIONABLE deviation chips, and every unactionable state does not', () => {
        // A closed vocabulary is only honest if none of its ACTIONABLE members can go silently missing —
        // and if the unactionable ones cannot silently flood. Both halves are asserted here, because
        // the first half alone is what put `unknown` on every card in the fleet.
        ['off', 'suppressed'].forEach(state => {
            expect(describeTelltale({wake: {state}}).hidden, `wake ${state} must chip`).toBe(false)
        });

        ['overage', 'rate-limited'].forEach(state => {
            expect(describeTelltale({throttle: {state}}).hidden, `throttle ${state} must chip`).toBe(false)
        });

        // the other half of the matrix: nominal, blind and absent all cost zero pixels, for three
        // different reasons the detail keeps apart
        [{wake: {state: 'on'}}, {wake: {state: 'unknown'}}, {wake: null},
         {throttle: {state: 'none'}}, {throttle: {state: 'unknown'}}, {throttle: null}
        ].forEach(record => {
            expect(describeTelltale(record).hidden, `${JSON.stringify(record)} must cost zero card pixels`).toBe(true)
        })
    });

    test('the whole observation travels — confidence and reason do not change the chip decision', () => {
        // The chip reads `state` only. `confidence`/`reason` are the producer's evidence and belong in
        // the detail readout; a chip that changed with confidence would make two different producers'
        // 'unknown' render differently for no operator-visible reason.
        expect(describeTelltale({wake: {state: 'on', confidence: 'none', reason: 'noisy'}}))
            .toEqual({ariaLabel: null, hidden: true, text: '', title: null})
    })

    test('the DETAIL readout states BOTH axes — the opposite of the card, deliberately', () => {
        // The card is exception-based: 20 cards cannot spend a line each on "fine". The detail shows
        // ONE resident, so omitting a nominal axis leaves the operator unable to tell "wake is on"
        // from "nobody looked at wake". Same data, opposite rule.
        const readout = describeTelltaleReadout({wake: {state: 'on'}, throttle: {state: 'none'}});

        expect(readout.map(row => [row.axis, row.state, row.nominal]))
            .toEqual([['wake', 'on', true], ['throttle', 'none', true]]);

        // and the card says nothing at all for that same record
        expect(describeTelltale({wake: {state: 'on'}, throttle: {state: 'none'}}).hidden).toBe(true)
    });

    test('`reported: false` is not a state — an unobserved axis never borrows `unknown`', () => {
        // 'unknown' means the producer LOOKED and could not see. An absent axis means nobody looked.
        // Collapsing them makes the detail claim an observation that was never made.
        const [wake] = describeTelltaleReadout({wake: null, throttle: {state: 'none'}});

        expect(wake.reported).toBe(false);
        expect(wake.state).toBeNull();
        expect(wake.nominal).toBe(false)
    });

    test('the producer\'s reason travels to the detail — the chip has no room for it', () => {
        // This is what makes a degraded chip a prompt to drill in rather than a dead end.
        const [, throttle] = describeTelltaleReadout({
            throttle: {state: 'rate-limited', reason: 'session cap reached 01:12Z'}
        });

        expect(throttle.reason).toBe('session cap reached 01:12Z');

        // the chip carries the AXIS + state, and nothing the producer wrote
        const chip = describeTelltale({throttle: {state: 'rate-limited', reason: 'session cap reached 01:12Z'}});

        expect(chip.text).toBe('throttle rate-limited');

        // the reason reaches NEITHER the chip text, its label, nor its hover: it is the producer's
        // prose, it is unbounded, and on the card there is no room and no need for it
        expect(chip.text).not.toContain('session cap');
        expect(chip.ariaLabel).not.toContain('session cap');
        expect(chip.title).not.toContain('session cap')
    });

    test('an observed `unknown` is reported and NOT nominal — blindness is not health', () => {
        const [wake] = describeTelltaleReadout({wake: {state: 'unknown', reason: 'daemon pid-file unreadable'}});

        expect(wake.reported).toBe(true);
        expect(wake.nominal).toBe(false);
        expect(wake.reason).toBe('daemon pid-file unreadable')
    });

    test('the readout is ALWAYS both axes, wake first — a stable shape the view can render blind', () => {
        [{}, {wake: {state: 'off'}}, {throttle: {state: 'overage'}}, {wake: {state: 'on'}, throttle: {state: 'none'}}]
            .forEach(input => {
                const readout = describeTelltaleReadout(input);
                expect(readout).toHaveLength(2);
                expect(readout.map(row => row.axis)).toEqual(['wake', 'throttle'])
            })
    })
});
