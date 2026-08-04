import {test, expect} from '@playwright/test';

import {
    ACTIVATION_DECISION,
    authorizeActivation,
    buildActivationReceipt,
    parseInstant,
    REFUSAL_REASON,
    RESTORABLE_VERDICT
} from '../../../../../../ai/services/shared/activationReceipt.mjs';

const
    CONFIG_DIGEST = 'sha256:resolved-container-config-abc',
    MAX_AGE_MS    = 5 * 60 * 1000,
    NOW           = '2026-08-04T10:01:00.000Z',
    OBSERVED_AT   = '2026-08-04T10:00:00.000Z',
    STAGE_ID      = 'stage-receipt:9f2c1a';

/** The receipt every negative case mutates exactly one field of. */
const goodReceipt = () => buildActivationReceipt({
    observedAt        : OBSERVED_AT,
    stageReceiptId    : STAGE_ID,
    targetConfigDigest: CONFIG_DIGEST,
    verdictCode       : RESTORABLE_VERDICT
});

/** The authorizing call. Negative cases override one key. */
const call = overrides => authorizeActivation({
    maxReceiptAgeMs           : MAX_AGE_MS,
    now                       : NOW,
    observedTargetConfigDigest: CONFIG_DIGEST,
    receipt                   : goodReceipt(),
    selectedStageReceiptId    : STAGE_ID,
    ...overrides
});

/**
 * @summary The activation kernel is the only mutation path, and its gate has exactly two outcomes.
 *
 * A guard that is merely reachable is bypassable, so the property under test is not "the happy path
 * authorizes" but "nothing else does". The closure test below is the load-bearing one: every other
 * case in this file is a named instance of it.
 */
test.describe('authorizeActivation — two states, never three', () => {
    test('THE CLOSURE: across the full input cross-product, every outcome is authorize or refuse', () => {
        // Generated rather than enumerated by hand: a hand-written list proves only that the cases
        // I thought of are closed, which is the weaker claim and the one that hides the third state.
        const axes = {
            receipt: [
                ['present',   goodReceipt()],
                ['absent',    null],
                ['undefined', undefined],
                ['notObject', 'a string'],
                ['emptyObj',  {}],
                ['badClock',  {...goodReceipt(), observedAt: 'not-a-date'}],
                // Not merely unparsable — a value `Date.parse` NORMALIZES into a real instant. It
                // belongs in the closure rather than only in its own witness, because that is the
                // shape that reached `authorize`.
                ['normalized', {...goodReceipt(), observedAt: '2026-02-30T10:00:00.000Z'}],
                ['noStageId', {...goodReceipt(), stageReceiptId: ''}],
                ['noDigest',  {...goodReceipt(), targetConfigDigest: ''}],
                ['notRestorable', buildActivationReceipt({
                    observedAt        : OBSERVED_AT,
                    stageReceiptId    : STAGE_ID,
                    targetConfigDigest: CONFIG_DIGEST,
                    verdictCode       : 'REFUSE_NO_VERIFIED_BUNDLE'
                })]
            ],
            // Named for the RECEIPT's position, not the mutation's. `firstMutationAt` is a mutation
            // instant, so a label like "afterReceipt" reads as a claim about the receipt and inverts
            // under a careless read — which is exactly what it did while this test was being written.
            firstMutationAt: [
                ['noMutationYet',       null],
                ['receiptPreMutation',  '2026-08-04T10:00:30.000Z'],
                ['receiptPostMutation', '2026-08-04T09:59:00.000Z'],
                ['unparsableMutation',  'whenever']
            ],
            now: [
                ['fresh',  NOW],
                ['stale',  '2026-08-04T10:30:00.000Z'],
                ['future', '2026-08-04T09:00:00.000Z']
            ],
            selectedStageReceiptId    : [['match', STAGE_ID], ['mismatch', 'stage-receipt:other']],
            observedTargetConfigDigest: [['match', CONFIG_DIGEST], ['mismatch', 'sha256:half-applied']]
        };

        const authorized = [],
              decisions  = new Set(),
              reasons    = new Set();
        let caseCount = 0;

        for (const [receiptLabel, receipt] of axes.receipt) {
            for (const [mutationLabel, firstMutationAt] of axes.firstMutationAt) {
                for (const [nowLabel, now] of axes.now) {
                    for (const [stageLabel, selectedStageReceiptId] of axes.selectedStageReceiptId) {
                        for (const [digestLabel, observedTargetConfigDigest] of axes.observedTargetConfigDigest) {
                            const result = authorizeActivation({
                                firstMutationAt,
                                maxReceiptAgeMs: MAX_AGE_MS,
                                now,
                                observedTargetConfigDigest,
                                receipt,
                                selectedStageReceiptId
                            });

                            caseCount++;
                            decisions.add(result.decision);
                            result.reason !== null && reasons.add(result.reason);

                            if (result.decision === ACTIVATION_DECISION.authorize) {
                                authorized.push([receiptLabel, mutationLabel, nowLabel, stageLabel, digestLabel].join('/'))
                            }
                        }
                    }
                }
            }
        }

        expect(caseCount).toBe(10 * 4 * 3 * 2 * 2);

        // No third state: the decision vocabulary is closed over the entire input space.
        expect([...decisions].sort()).toEqual([ACTIVATION_DECISION.authorize, ACTIVATION_DECISION.refuse]);

        // Every refusal names a reason from the frozen vocabulary — no ad-hoc strings, no nulls.
        const known = new Set(Object.values(REFUSAL_REASON));
        expect([...reasons].filter(reason => !known.has(reason))).toEqual([]);

        // And the authorizing set is EXACTLY the fully-satisfied cases: a present valid receipt,
        // observed before any mutation, fresh, with both bindings matching. Asserting the full list
        // rather than a count, so a new authorizing combination fails loudly instead of shifting a number.
        expect(authorized.sort()).toEqual([
            'present/noMutationYet/fresh/match/match',
            'present/receiptPreMutation/fresh/match/match'
        ]);
    });

    test('no receipt at all refuses — absence of proof is the refusal, not a silence', () => {
        // The defect this module exists for: a mutation path that simply never ran the preflight
        // inherited no refusal, because nothing positively said no.
        for (const receipt of [null, undefined, 'string', 42, []]) {
            const result = call({receipt});

            expect(result.decision).toBe(ACTIVATION_DECISION.refuse);
            expect([REFUSAL_REASON.noReceipt, REFUSAL_REASON.receiptMalformed]).toContain(result.reason);
        }
    });

    test('a non-RESTORABLE preflight cannot carry an activation', () => {
        const result = call({
            receipt: buildActivationReceipt({
                observedAt        : OBSERVED_AT,
                stageReceiptId    : STAGE_ID,
                targetConfigDigest: CONFIG_DIGEST,
                verdictCode       : 'REFUSE_NO_VERIFIED_BUNDLE'
            })
        });

        expect(result.decision).toBe(ACTIVATION_DECISION.refuse);
        expect(result.reason).toBe(REFUSAL_REASON.preflightNotRestorable);
    });

    test('a receipt minted AFTER the first mutation refuses, however recent it is', () => {
        // AC3. The receipt must describe the PRE-transition state; one produced after the plane was
        // touched describes something else entirely, and recency cannot repair that.
        const result = call({firstMutationAt: '2026-08-04T09:59:59.999Z'});

        expect(result.decision).toBe(ACTIVATION_DECISION.refuse);
        expect(result.reason).toBe(REFUSAL_REASON.receiptNotPreMutation);
    });

    test('a receipt minted at the EXACT mutation instant refuses — the boundary is closed', () => {
        // Simultaneity proves nothing about ordering, so `>=` rather than `>`.
        const result = call({firstMutationAt: OBSERVED_AT});

        expect(result.decision).toBe(ACTIVATION_DECISION.refuse);
        expect(result.reason).toBe(REFUSAL_REASON.receiptNotPreMutation);
    });

    test('ORDERING: a receipt that is both post-mutation AND stale reports post-mutation', () => {
        // Deliberate precedence. If staleness were reported first, the operator-visible fix would be
        // "re-run the preflight" — which would mint a fresh receipt that is STILL post-mutation, and
        // the second attempt would authorize a plane that had already been touched.
        const result = call({
            firstMutationAt: '2026-08-04T09:59:59.999Z',
            now            : '2026-08-04T11:00:00.000Z'
        });

        expect(result.reason).toBe(REFUSAL_REASON.receiptNotPreMutation);
    });

    test('a stale receipt refuses, and so does a future-dated one', () => {
        expect(call({now: '2026-08-04T10:30:00.000Z'}).reason).toBe(REFUSAL_REASON.receiptStale);
        // Future-dated is not fresh, it is unexplained. Accepting it would let clock skew or a forged
        // instant buy unlimited validity.
        expect(call({now: '2026-08-04T09:00:00.000Z'}).reason).toBe(REFUSAL_REASON.receiptStale);
    });

    test('a receipt bound to a DIFFERENT selected candidate refuses', () => {
        // AC4.
        const result = call({selectedStageReceiptId: 'stage-receipt:some-other-cohort'});

        expect(result.decision).toBe(ACTIVATION_DECISION.refuse);
        expect(result.reason).toBe(REFUSAL_REASON.stageBindingMismatch);
    });

    test('THE HALF-APPLIED CASE: a target whose resolved container config differs refuses', () => {
        // Measured on our own plane: image rebuilt at the target revision, revision label current,
        // merged code present inside the image — and the RUNNING container still executing the
        // pre-change healthcheck, because compose freezes it at create time. Every cheap probe reads
        // "landed". A receipt bound to an image digest is satisfied by exactly that state; this one
        // is not, because it binds the resolved container config.
        const result = call({observedTargetConfigDigest: 'sha256:containers-never-recreated'});

        expect(result.decision).toBe(ACTIVATION_DECISION.refuse);
        expect(result.reason).toBe(REFUSAL_REASON.targetBindingMismatch);
    });

    test('the fully satisfied case authorizes, and reports the age it was judged on', () => {
        // Positive control. Without it every assertion above is satisfied by a function that always
        // refuses — which would be a closed gate and a useless one.
        const result = call({});

        expect(result.decision).toBe(ACTIVATION_DECISION.authorize);
        expect(result.reason).toBeNull();
        expect(result.receiptAgeMs).toBe(60_000);
    });

    test('parseInstant returns null for anything that is not a timestamp', () => {
        // null rather than NaN or 0: both of those compare as numbers and would let an unparsable
        // instant participate in a freshness comparison instead of failing it.
        expect(parseInstant(OBSERVED_AT)).toBe(Date.parse(OBSERVED_AT));
        for (const value of ['', 'not-a-date', null, undefined, 42, {}]) {
            expect(parseInstant(value)).toBeNull()
        }
    });

    test('STRICT INSTANT: every value Date.parse would normalize is refused AT THE AUTHORIZATION LEVEL', () => {
        // `Date.parse` answers "can this engine normalize the string", not "is this a portable
        // instant". Each of these reached `authorize` before the grammar was enforced — asserted here
        // through authorizeActivation rather than through parseInstant, because the escape that
        // matters is the one that ends in a mutated plane, not the one that ends in a null.
        const escapes = {
            'impossible calendar day': '2026-02-30T10:00:00.000Z',  // normalized to Mar 2, then fresh
            'zone-less (local time)' : '2026-08-04T10:00:00',       // decision depended on host TZ
            'locale form'            : 'August 4, 2026 10:00:00 UTC',
            'bare year'              : '2026',
            'date only'              : '2026-08-04',
            'leap second'            : '2026-08-04T10:00:60.000Z',  // Date rolls :60 into the next minute
            'hour 24'                : '2026-08-04T24:00:00.000Z',
            'month 13'               : '2026-13-04T10:00:00.000Z',
            'offset hour 99'         : '2026-08-04T10:00:00.000+99:00'
        };

        for (const [label, observedAt] of Object.entries(escapes)) {
            const result = call({
                receipt: buildActivationReceipt({
                    observedAt,
                    stageReceiptId    : STAGE_ID,
                    targetConfigDigest: CONFIG_DIGEST,
                    verdictCode       : RESTORABLE_VERDICT
                }),
                // A clock the normalized value would have looked fresh against, so a pass here cannot
                // be an accident of the default `now` being far away.
                now: '2026-03-02T10:01:00.000Z'
            });

            expect(result.decision, `${label} must not authorize`).toBe(ACTIVATION_DECISION.refuse);
            expect(result.reason,   `${label} must be malformed, not stale`).toBe(REFUSAL_REASON.receiptMalformed);
        }
    });

    test('a zone-less instant is refused, which is what makes the decision host-independent', () => {
        // Measured before the fix: the identical receipt returned `authorize` under TZ=UTC and
        // `refuse` under TZ=Europe/Berlin, because Date.parse reads a zone-less string as LOCAL time.
        // A mutation-authority decision that depends on the consumer's TZ is not a decision. Rejecting
        // the zone-less form outright is what removes the dependency, so this pins the cause.
        expect(parseInstant('2026-08-04T10:00:00')).toBeNull();
        expect(parseInstant('2026-08-04T10:00:00.000')).toBeNull();
    });

    test('valid portable instants still parse — Z, offsets, and fractional seconds', () => {
        // Positive control for the grammar. Without it, "reject everything" passes every assertion
        // above and the module becomes a gate nothing can open.
        for (const value of [
            '2026-08-04T10:00:00Z',
            '2026-08-04T10:00:00.000Z',
            '2026-08-04T10:00:00.123456Z',
            '2026-08-04T10:00:00+02:00',
            '2026-08-04T10:00:00.500-08:00',
            '2024-02-29T10:00:00.000Z'      // a leap day that DOES exist
        ]) {
            expect(parseInstant(value), value).toBe(Date.parse(value))
        }

        // And the offset forms carry an authorization, so the grammar did not merely stop rejecting.
        const result = call({
            receipt: buildActivationReceipt({
                observedAt        : '2026-08-04T12:00:00+02:00',   // === 10:00:00Z
                stageReceiptId    : STAGE_ID,
                targetConfigDigest: CONFIG_DIGEST,
                verdictCode       : RESTORABLE_VERDICT
            })
        });

        expect(result.decision).toBe(ACTIVATION_DECISION.authorize);
        expect(result.receiptAgeMs).toBe(60_000);
    });
});

test.describe('buildActivationReceipt — records observations, derives one thing', () => {
    test('derives preflightRestorable from the verdict rather than accepting it as an argument', () => {
        expect(buildActivationReceipt({
            observedAt        : OBSERVED_AT,
            stageReceiptId    : STAGE_ID,
            targetConfigDigest: CONFIG_DIGEST,
            verdictCode       : RESTORABLE_VERDICT
        }).preflightRestorable).toBe(true);

        for (const verdictCode of ['REFUSE_NO_VERIFIED_BUNDLE', 'PROCEED_INITIALIZING', 'restorable', '', undefined]) {
            expect(buildActivationReceipt({
                observedAt        : OBSERVED_AT,
                stageReceiptId    : STAGE_ID,
                targetConfigDigest: CONFIG_DIGEST,
                verdictCode
            }).preflightRestorable).toBe(false)
        }
    });

    test('PROCEED_INITIALIZING is not restorable — a declared first install proves no recoverable state', () => {
        // The preflight may legitimately proceed on an initialization declaration, and that decision
        // says the opposite of what an activation receipt must assert: there is nothing to restore.
        // Treating any PROCEED_* as sufficient would authorize mutation of a plane with no bundle.
        const receipt = buildActivationReceipt({
            observedAt        : OBSERVED_AT,
            stageReceiptId    : STAGE_ID,
            targetConfigDigest: CONFIG_DIGEST,
            verdictCode       : 'PROCEED_INITIALIZING'
        });

        expect(receipt.preflightRestorable).toBe(false);
        expect(authorizeActivation({
            maxReceiptAgeMs           : MAX_AGE_MS,
            now                       : NOW,
            observedTargetConfigDigest: CONFIG_DIGEST,
            receipt,
            selectedStageReceiptId    : STAGE_ID
        }).reason).toBe(REFUSAL_REASON.preflightNotRestorable);
    });
});
