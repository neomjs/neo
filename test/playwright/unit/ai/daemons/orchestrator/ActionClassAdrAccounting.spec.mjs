import {setup} from '../../../../setup.mjs';

// The diagnosis module pulls in the Neo class system at load, so the harness must be armed before the
// dynamic import in `beforeAll` — otherwise the import fails with `Neo is not defined` and the spec
// reports a red that is about the fixture rather than about the ADR.
setup({
    neoConfig: {unitTestMode: true},
    appConfig: {name: 'ActionClassAdrAccountingTest', isMounted: () => true, vnodeInitialising: false}
});

import {test, expect} from '@playwright/test';
import fs             from 'node:fs';
import path           from 'node:path';
import process        from 'node:process';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';

const
    repoRoot = path.resolve(process.cwd()),
    adrPath  = path.join(repoRoot, 'learn/agentos/decisions/0026-recovery-actuator.md'),
    adrText  = fs.readFileSync(adrPath, 'utf8'),

    /** The dispositions an emitted action class may hold against ADR-0026 §2.4. */ // ticket-ref-ok: the ADR this spec's subject IS
    DISPOSITIONS = Object.freeze(['admitted', 'terminal', 'disclosed-unimplemented']),

    /**
     * The curated enum → ADR accounting. **Deliberately hand-written, not derived.**
     *
     * A grep cannot do this job: the ADR spells `throttle` and `shed` as two separate specified-but-
     * unimplemented actions while the diagnosis enum carries one hyphenated `throttle-shed`, so a
     * string search reports a naming difference as a divergence and a real divergence as a match.
     * The curation IS the content; the two assertions below stop it from drifting in either direction.
     *
     * `anchor` must be text actually present in the ADR — that is what keeps a stale mapping from
     * claiming an accounting the ADR does not give.
     */
    ACTION_CLASS_ACCOUNTING = Object.freeze({
        'raise-ceiling': {
            disposition: 'admitted',
            anchor     : 'raise-ceiling',
            note       : 'Admitted for store-classed compose services only (§2.4 matrix + AC-12). ' +
                         'Executor shipped in #16637.'
        },
        'record': {
            disposition: 'terminal',
            anchor     : 'record-with-diagnosis',
            note       : 'Not a lifecycle action at all — the durable async-audit terminal (AC-6, ' +
                         'amended #14191). Correctly absent from the admitted-action matrix.'
        },
        'restart': {
            disposition: 'admitted',
            anchor     : 'restart',
            note       : 'Admitted for every target kind that has a lifecycle.'
        },
        'throttle-shed': {
            disposition: 'disclosed-unimplemented',
            anchor     : 'recycle`, `throttle` and `shed` remain specified but UNIMPLEMENTED',
            note       : 'The LIFECYCLE actuator has no throttle/shed operation. The only shipped ' +
                         'implementation of that name is collection-keyed in ADR-0027\'s ' +
                         'data-recovery world, so a lifecycle `throttle-shed` diagnosis is a ' +
                         'forward declaration consumed by nothing. Disclosed in §2.4.'
        },
        'warm-provider': {
            disposition: 'admitted',
            anchor     : 'warm-provider',
            note       : 'Admitted for supervised tasks and compose services (config/readiness repair).'
        }
    });

/**
 * Every action class the container-health diagnosis can emit is accounted for in the recovery-actuator ADR's admitted-action matrix.
 *
 * **Why this exists.** That matrix was amended specifically so that *"a reader of this section must be
 * able to tell which of the listed actions they can actually call"* — and when this guard's ticket was
 * filed, **two of the five emitted classes appeared nowhere in the ADR at all**:
 * `grep -rn 'raiseCeiling' learn/` returned zero while the enum shipped it, and `throttle-shed`'s only
 * implementation turned out to live in a different ADR's world entirely. The section could not do the
 * job it was amended to do.
 *
 * The gap is now closed in the ADR. **This spec is what stops the next one opening**, and it guards
 * the general property rather than the two instances that motivated it: an action class added to the
 * enum without an ADR disposition fails here, at the moment it is added, rather than being found by a
 * reviewer's grep months later.
 *
 * Two assertions, and each closes a different drift direction:
 *
 * 1. **Enum totality** — every emitted class has an accounting entry. Adding an enum member without
 *    deciding its ADR status fails.
 * 2. **Anchor liveness** — every accounting entry's `anchor` is text actually present in that ADR.
 *    A mapping cannot claim an accounting the ADR does not give, and an ADR rewrite that drops the
 *    text a disposition rests on fails here too.
 */
test.describe('container-health action classes are accounted for in ADR-0026', () => {
    let CONTAINER_HEALTH_ACTION_CLASSES;

    test.beforeAll(async () => {
        ({CONTAINER_HEALTH_ACTION_CLASSES} =
            await import('../../../../../../ai/daemons/orchestrator/services/ContainerHealthDiagnosisService.mjs'));
    });

    test('ENUM TOTALITY: every emitted action class has an ADR accounting entry', () => {
        const emitted      = Object.values(CONTAINER_HEALTH_ACTION_CLASSES).sort(),
              accountedFor = Object.keys(ACTION_CLASS_ACCOUNTING).sort();

        // Set-equality in BOTH directions. A missing entry is an unaccounted action class; a surplus
        // entry is a mapping that outlived the enum member it describes, which would let a deleted
        // class keep a green accounting forever.
        expect(emitted, 'an action class is emitted with no ADR-0026 disposition — decide it, do not add it here blindly')
            .toEqual(accountedFor);
    });

    test('ANCHOR LIVENESS: every disposition rests on text actually present in ADR-0026', () => {
        const missing = Object.entries(ACTION_CLASS_ACCOUNTING)
            .filter(([, entry]) => !adrText.includes(entry.anchor))
            .map(([name, entry]) => `${name} → "${entry.anchor}"`);

        expect(missing, 'a disposition claims ADR text that is not in the ADR — the mapping has drifted or the ADR was rewritten')
            .toEqual([]);
    });

    test('every disposition is one of the closed set', () => {
        for (const [name, entry] of Object.entries(ACTION_CLASS_ACCOUNTING)) {
            expect(DISPOSITIONS, `${name} carries an unrecognised disposition "${entry.disposition}"`)
                .toContain(entry.disposition);
        }
    });

    test('POSITIVE CONTROL: the totality check detects an unaccounted class', () => {
        // Without this, the totality assertion could be vacuous — it would pass just as green if the
        // enum import silently yielded an empty object, or if `Object.values` were pointed at the
        // wrong symbol. Prove the comparison actually discriminates before trusting its silence.
        const withExtra = [...Object.values(CONTAINER_HEALTH_ACTION_CLASSES), 'invented-action'].sort();

        expect(withExtra).not.toEqual(Object.keys(ACTION_CLASS_ACCOUNTING).sort());
        // And the enum must be non-empty, or "every member is accounted for" is trivially true.
        expect(Object.values(CONTAINER_HEALTH_ACTION_CLASSES).length,
            'an empty enum would make the totality assertion vacuous').toBeGreaterThan(0);
    });

    test('POSITIVE CONTROL: the anchor check detects text absent from the ADR', () => {
        // Same discipline for the second assertion: prove `adrText.includes` can say no.
        expect(adrText.includes('this sentence is not in ADR-0026'),
            'the anchor check must be able to report an absent anchor').toBe(false);
        expect(adrText.length, 'the ADR must actually have been read').toBeGreaterThan(1000);
    });
});
