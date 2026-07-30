import {test, expect} from '@playwright/test';
import fs             from 'node:fs/promises';
import {mkdtemp, rm}  from 'node:fs/promises';
import os             from 'node:os';
import path           from 'node:path';
import {
    ELIGIBILITY_EFFECT,
    OVERLAY_TAGGING_PRODUCER,
    PILOT_TERMINALS,
    PROMOTION_REPLAY_PRODUCER,
    deriveDemotionTerminal,
    deriveDualCorpusReplayReceipt,
    deriveReplayCompletion,
    diffSegmentIdentity,
    eligibilityEffect,
    evaluateDemotion,
    evaluatePromotion,
    produceOverlayScan,
    validateOverlayScan
} from '../../../../../../ai/scripts/diagnostics/pilotPlaneTerminal.mjs';
import {digestAppliedStages} from '../../../../../../ai/scripts/diagnostics/walReplayPlan.mjs';
import {
    appendWalMemory,
    getWalRecordsFileName
} from '../../../../../../ai/services/memory-core/helpers/memoryWalStore.mjs';
import {
    appendWalMessage,
    getMessageWalRecordsFileName
} from '../../../../../../ai/services/memory-core/helpers/messageWalStore.mjs';

// AC5's parenthetical — "never a silent abandon" — is the whole specification. So most assertions here are
// about the ABSENCE of exits: every path names a terminal, an unprovable claim never opens eligibility, and
// no caller may hand in the verdict OR the evidence behind it.
//
// Six earlier shapes were falsified by peer probe. Each is pinned below, because the pattern recurred:
// every one of them checked the SHAPE of a claim and mistook that for checking the claim.
//   * two caller booleans passed as proof of replay        -> verification runs HERE
//   * a structurally valid typed receipt passed as proof   -> verification runs HERE
//   * a bare [] claiming an impossible scan                -> invoked dual-WAL producer
//   * an invented planeIdSource string unlocking clean     -> caller can no longer supply the scan
//   * segment COUNTS offered as proof of no-loss           -> set inclusion by id
//   * a self-consistent SUBSET of the corpus certifying    -> unconditional containment
//   * a NO-OP FUNCTION satisfying the promotion gate       -> unconditional containment
//
// Promotion remains mechanically unreachable until a complete replay adapter owns its observations.
// Deriving the plan here closed the forged plan but not the unknown denominator: a caller passing part of the
// corpus verifies as cleanly as one passing all of it, and no validation rule can tell them apart. What was
// missing was never a stricter check — it was a producer of fact.
//
// The first attempt at that repair was itself the same defect: a `typeof PROMOTION_REPLAY_PRODUCER !== 'function'`
// gate type-checked the capability but never INVOKED it, so a no-op stub fell through to caller-owned
// observations. Demotion is now open only through an invoked producer that reads both WAL stores strictly;
// promotion has no branch and no parameter, because a capability that must *act* cannot be verified by checking
// that it *exists*. Requiring a thing is not proving a fact — the recurring shape in every row above.

const S         = ids => new Set(ids),
      allStages = ids => ({embedded: S(ids), graph: S(ids)});

test.describe('terminal set and the eligibility authority', () => {
    test('every terminal is named', () => {
        expect(PILOT_TERMINALS).toEqual(['committed', 'demoted-clean', 'failed-contained']);
    });

    test('⭐ only strict `committed` OPENS eligibility — a clean demotion leaves it unchanged', () => {
        // A boolean previously conflated "opened" with "never closed", which contradicted the governing rule
        // reserving an opening for strict `committed`. A clean demotion never mutated the durable plane, so
        // there was nothing to open.
        expect(eligibilityEffect('committed')).toBe('opened');
        expect(eligibilityEffect('demoted-clean')).toBe('unchanged');
        expect(eligibilityEffect('failed-contained')).toBe('denied');
        expect(ELIGIBILITY_EFFECT.committed).toBe('opened');
    });

    test('an unrecognised terminal is DENIED, not silently permitted', () => {
        for (const value of ['completed', 'ok', 'COMMITTED', '', null, undefined, 'demoted']) {
            expect(eligibilityEffect(value)).toBe('denied');
        }
    });
});

const entries = [{id: 'a', timestamp: 1}, {id: 'b', timestamp: 2}];

test.describe('⭐ evaluatePromotion — `committed` is UNCONDITIONALLY unreachable, with no branch and no argument', () => {
    // Unconditional containment replaced a validation approach, and the reason is the reviewer's subset attack.
    // The previous shape settled `committed` on `payloadEntries: [a]` with an unchanged before/after, certifying
    // a zero-effect promotion truthfully. Refusing `plannedTotal: 0` would have closed that one case while
    // leaving arbitrary non-empty truncation alive: a caller passing HALF the real corpus verifies exactly as
    // cleanly, because nothing in this module can know what the whole corpus was. The missing thing is a
    // source authority, not a stricter rule — so the terminal closes rather than the loophole.
    //
    // The intermediate attempt — a `typeof ... === 'function'` gate — is documented in its own test below,
    // because it failed for a DIFFERENT reason worth keeping: checking that a capability exists never shows
    // that it ran.

    test('the producer does not exist, and it is recorded as a constant', () => {
        expect(PROMOTION_REPLAY_PRODUCER).toBeNull();
    });

    test('⭐ a NO-OP FUNCTION STUB cannot open the path, because there is no branch to open', () => {
        // THE DEFECT THIS TEST EXISTS FOR. The first version of this repair gated on
        // `typeof PROMOTION_REPLAY_PRODUCER !== 'function'` and fell through to the derivation otherwise. The
        // reviewer killed it in one line: the producer was type-checked but never INVOKED, so `() => {}` passed
        // the check and handed caller-owned observations straight through.
        //
        // It was the same defect one level up from the one this module already fixed once — the predecessor gate
        // checked that a `planeIdSource` STRING was present. Swapping a string slot for a function slot changed
        // nothing: `typeof x === 'function'` is exactly as satisfiable-by-typing as `typeof x === 'string'`.
        // Requiring a thing is not proving a fact, whatever the thing's type.
        //
        // So the terminal now reads NOTHING — no constant, and no parameter. `evaluatePromotion.length === 0` is
        // the structural assertion that matters: a function that accepts no observations cannot be handed forged
        // ones, and no value of any constant can route around a branch that does not exist.
        expect(evaluatePromotion.length).toBe(0);

        // Called with a fully-landed, fully-consistent corpus AND a function-shaped stub in every position a
        // caller could hope is consulted. All ignored.
        const result = evaluatePromotion({
            payloadEntries           : entries,
            appliedStagesBefore      : allStages(['seed']),
            appliedStagesAfter       : allStages(['seed', 'a', 'b']),
            PROMOTION_REPLAY_PRODUCER: () => true,
            producer                 : () => ({complete: true}),
            replayProducer           : function realAdapter() { return {ok: true}; }
        });

        expect(result.terminal).toBe('failed-contained');
        expect(result.eligibility).toBe('denied');
        expect(result.receipt).toBeNull();
    });

    test('the refusal states the producer must be INVOKED and own its observations, not merely exist', () => {
        // The distinction the reviewer drew. Recorded in the operator-facing string so the next person to wire
        // an adapter does not repeat the type-check.
        expect(evaluatePromotion().reason).toContain('invoked and own its observations, not merely exist');
    });

    test('⭐ the reviewer\'s exact zero-effect subset attack stays contained', () => {
        // `payload=[a]`, `before={seed,a}`, `after={seed,a}` — this settled `committed` with `plannedTotal: 0`.
        const state  = allStages(['seed', 'a']),
              result = evaluatePromotion({
                  payloadEntries: [{id: 'a', timestamp: 1}], appliedStagesBefore: state, appliedStagesAfter: state
              });

        expect(result.terminal).toBe('failed-contained');
        expect(result.eligibility).toBe('denied');
    });

    test('⭐ a NON-EMPTY truncation of a real corpus is contained too — the general case, not just the empty one', () => {
        // What a `plannedTotal: 0` refusal would have missed. Half the corpus, genuinely replayed, fully
        // self-consistent: planner agrees, continuity agrees, receipt is real. Only the denominator is a lie.
        const result = evaluatePromotion({
            payloadEntries     : [entries[0]],                   // 'b' silently omitted from the "source"
            appliedStagesBefore: allStages(['seed']),
            appliedStagesAfter : allStages(['seed', 'a'])
        });

        expect(result.terminal).toBe('failed-contained');
        expect(result.eligibility).toBe('denied');

        // And the component proof CONFIRMS the truncation is otherwise clean — which is what makes the
        // containment load-bearing rather than redundant. If this were `ok: false`, validation would have
        // sufficed and no terminal would have needed closing.
        expect(deriveReplayCompletion({
            payloadEntries     : [entries[0]],
            appliedStagesBefore: allStages(['seed']),
            appliedStagesAfter : allStages(['seed', 'a'])
        }).ok).toBe(true);
    });

    test('⭐ NO input combination yields `committed` — exhaustive over every unlock shape', () => {
        const before = allStages(['seed']),
              after  = allStages(['seed', 'a', 'b']),
              // A caller-supplied producer name, path, array, count, digest, manifest or receipt must never
              // unlock the gate. Each candidate is a different theory of what might be accepted as authority.
              candidates = [
                  {payloadEntries: entries, appliedStagesBefore: before, appliedStagesAfter: after},
                  {payloadEntries: entries, appliedStagesBefore: before, appliedStagesAfter: after, producer: 'replay adapter'},
                  {payloadEntries: entries, appliedStagesBefore: before, appliedStagesAfter: after, PROMOTION_REPLAY_PRODUCER: () => true},
                  {payloadEntries: entries, appliedStagesBefore: before, appliedStagesAfter: after, sourceCorpusReceipt: {complete: true, rows: 8234}},
                  {payloadEntries: entries, appliedStagesBefore: before, appliedStagesAfter: after, walRoots: ['/memory-wal', '/memory-wal/messages']},
                  {payloadEntries: entries, appliedStagesBefore: before, appliedStagesAfter: after, manifest: {segments: 12, digest: 'sha256:deadbeef'}},
                  {payloadEntries: entries, appliedStagesBefore: before, appliedStagesAfter: after, fenced: true, quiesced: true},
                  {payloadEntries: entries, appliedStagesBefore: before, appliedStagesAfter: after, terminal: 'committed', eligibility: 'opened'},
                  {payloadEntries: entries, appliedStagesBefore: before, appliedStagesAfter: after, requiredStages: ['embedded']},
                  {payloadEntries: [], appliedStagesBefore: before, appliedStagesAfter: before},
                  {}, null, undefined, 42, 'committed'
              ];

        for (const spec of candidates) {
            const result = evaluatePromotion(spec);

            expect(result.terminal, `${JSON.stringify(spec)} must stay contained`).toBe('failed-contained');
            expect(result.eligibility).toBe('denied');
            expect(result.receipt).toBeNull();
        }
    });

    test('the refusal names the missing authority and the subset problem, not a bad argument', () => {
        // What an operator reads. It must not send them hunting for a better `payloadEntries`, because no
        // `payloadEntries` can help — and it must state WHY, since "contained" alone looks like a bug.
        const {reason} = evaluatePromotion({
            payloadEntries     : entries,
            appliedStagesBefore: allStages(['seed']),
            appliedStagesAfter : allStages(['seed', 'a', 'b'])
        });

        expect(reason).toContain('no complete dual-corpus replay producer exists');
        expect(reason).toContain('any SUBSET of the real corpus verifies exactly as cleanly');
        expect(reason).toContain('two WAL families');
        expect(reason).toContain('skip torn rows');
        expect(reason).toContain('true state of every promotion attempted today');
    });

    test('no caller input is read AT ALL — a malformed spec still reports the producer', () => {
        // Ordering used to be the guarantee ("the gate runs before any shape check"). It is now stronger than
        // ordering: nothing is read, so there is no ordering to get wrong.
        const {reason} = evaluatePromotion({payloadEntries: 'not-an-array'});

        expect(reason).toContain('no complete dual-corpus replay producer');
        expect(reason).not.toContain('must be the source corpus');
    });

    test('absent evidence settles contained rather than throwing — the refusal WOULD BE the abandon', () => {
        for (const spec of [undefined, null, {}, {payloadEntries: 'x'}, 42]) {
            const result = evaluatePromotion(spec);

            expect(result.terminal).toBe('failed-contained');
            expect(result.eligibility).toBe('denied');
        }
    });
});

// ⭐ THE COMPONENT PROOF NOTHING ELSE REACHES. `evaluatePromotion` no longer calls this at all — it settles
// contained unconditionally — so these assertions are the ONLY thing keeping the derivation alive and correct.
// That is deliberate rather than an accident of the repair: unreachable code that nothing exercises is code
// that rots silently, and this is a leaf a future adapter has to be able to trust.
//
// Not hypothetical. The sibling capture module's post-gate block was left referencing four renamed variables;
// its suite stayed green because the gate short-circuited before reaching it, and @neo-gpt found the
// `ReferenceError` only by forcing the capability on in memory. Removing the branch removes that failure mode
// entirely — there is no short-circuit left to hide behind — but only because the math kept its own controls.
//
// These assertions prove the MATH — that the planner and the continuity verifier agree, and that each way a
// replay can be unprovable is detected. They deliberately assert `ok`/`reason`/`receipt` and NEVER a terminal
// or an eligibility, because agreeing about a corpus says nothing about whether that corpus was the whole
// plane. Minting authority here is the terminal's job, and the terminal is gated.
test.describe('⭐ deriveReplayCompletion — the math, directly executed, minting no authority', () => {
    test('a real corpus whose planned work landed verifies, and carries the verifier receipt', () => {
        // POSITIVE CONTROL for the whole derivation. Without it every refusal below could be a blanket failure
        // and the module would look correct while being useless.
        const result = deriveReplayCompletion({
            payloadEntries     : entries,
            appliedStagesBefore: allStages(['seed']),
            appliedStagesAfter : allStages(['seed', 'a', 'b'])
        });

        expect(result.ok).toBe(true);
        expect(result.receipt.plannedTotal).toBe(2);
        expect(result.receipt.appliedByStage).toEqual({embedded: 2, graph: 2});

        // Component proof, not a terminal: it must not be usable as an eligibility source.
        expect(result).not.toHaveProperty('terminal');
        expect(result).not.toHaveProperty('eligibility');
    });

    test('⭐ a caller-forged SELF-CONSISTENT empty plan is refused — there is no plan input', () => {
        // The falsified shape. A forged plan with `toApply: []`, matching empty `plannedIdsByStage`, and a
        // `targetStateDigest` computed from the REAL pre-state reconciled cleanly, landed nothing, lost
        // nothing, and settled `committed`. Reconciliation proved self-consistency, never provenance.
        const before = allStages(['seed']),
              forged = {
                  ok            : true,
                  toApply       : [],
                  alreadyApplied: [],
                  receipt       : {
                      sourceEntries      : 0,
                      toApplyCount       : 0,
                      alreadyAppliedCount: 0,
                      requiredStages     : ['embedded', 'graph'],
                      targetStateDigest  : digestAppliedStages(before),
                      plannedIdsByStage  : {embedded: [], graph: []},
                      pendingByStage     : {embedded: 0, graph: 0}
                  }
              },
              result = deriveReplayCompletion({appliedStagesBefore: before, appliedStagesAfter: before, plan: forged});

        expect(result.ok).toBe(false);
        expect(result.reason).toContain('cannot accept a pre-built plan');
        expect(result.reason).toContain('never that it was derived from the corpus');
    });

    test('⭐ an EMPTY corpus is refused — nothing to replay is not a promotion that moved nothing', () => {
        const before = allStages(['seed']),
              result = deriveReplayCompletion({payloadEntries: [], appliedStagesBefore: before, appliedStagesAfter: before});

        expect(result.ok).toBe(false);
        expect(result.reason).toContain('nothing to promote');
        expect(result.reason).toContain('zero-effect certification');
    });

    test('a corpus the planner refuses is refused, and the planner reason surfaces', () => {
        const result = deriveReplayCompletion({
            payloadEntries     : [{id: 'a'}, {id: 'a'}],
            appliedStagesBefore: allStages([]),
            appliedStagesAfter : allStages(['a'])
        });

        expect(result.ok).toBe(false);
        expect(result.reason).toContain('duplicate source id');
    });

    test('a planned id that never landed is refused', () => {
        const result = deriveReplayCompletion({
            payloadEntries     : entries,
            appliedStagesBefore: allStages(['seed']),
            appliedStagesAfter : allStages(['seed', 'a'])   // 'b' never landed
        });

        expect(result.ok).toBe(false);
        expect(result.reason).toContain('never landed');
    });

    test('a target that LOST a prior receipt is refused', () => {
        const result = deriveReplayCompletion({
            payloadEntries     : entries,
            appliedStagesBefore: allStages(['seed']),
            appliedStagesAfter : allStages(['a', 'b'])       // 'seed' regressed
        });

        expect(result.ok).toBe(false);
        expect(result.reason).toContain('lost');
    });

    test('a fabricated continuity VERDICT is refused too — that input is gone as well', () => {
        const typed = deriveReplayCompletion({
            continuity: {
                ok     : true, monotonic: true,
                receipt: {requiredStages: ['embedded', 'graph'], plannedTotal: 2, appliedByStage: {embedded: 2, graph: 2}}
            }
        });

        expect(typed.ok).toBe(false);
        expect(typed.reason).toContain('payloadEntries must be the source corpus');
    });

    test('a null or malformed spec is refused rather than throwing', () => {
        // `= {}` fires only for `undefined`, so a null argument would THROW — an exit with no verdict at all.
        for (const spec of [undefined, null, {}, {payloadEntries: 'x'}, 42]) {
            expect(deriveReplayCompletion(spec).ok, `${JSON.stringify(spec)} must refuse`).toBe(false);
        }
    });
});

test.describe('deriveDualCorpusReplayReceipt — plane-bound memory + message replay component proof', () => {
    const sourcePlaneId = 'neo-pilot-source',
          targetPlaneId = 'neo-local-canonical',
          memorySource  = [{id: 'memory-a', timestamp: 1, planeId: sourcePlaneId}],
          messageSource = [{id: 'MESSAGE:a', timestamp: 2, planeId: sourcePlaneId}],
          validSpec     = () => ({
              sourcePlaneId,
              targetPlaneId,
              memory: {
                  payloadEntries     : memorySource,
                  targetEntriesAfter : [{...memorySource[0], planeId: targetPlaneId}, {id: 'other-memory', planeId: targetPlaneId}],
                  appliedStagesBefore: allStages(['seed']),
                  appliedStagesAfter : allStages(['seed', 'memory-a', 'other-memory'])
              },
              messages: {
                  payloadEntries     : messageSource,
                  targetEntriesAfter : [{...messageSource[0], planeId: targetPlaneId}, {id: 'MESSAGE:other', planeId: targetPlaneId}],
                  appliedStagesBefore: {graph: S(['MESSAGE:seed'])},
                  appliedStagesAfter : {graph: S(['MESSAGE:seed', 'MESSAGE:a', 'MESSAGE:other'])}
              }
          });

    test('binds distinct source/target planes and exact family-typed record sets', () => {
        const result = deriveDualCorpusReplayReceipt(validSpec());

        expect(result.ok).toBe(true);
        expect(result.receipt.sourcePlaneId).toBe(sourcePlaneId);
        expect(result.receipt.targetPlaneId).toBe(targetPlaneId);
        expect(result.receipt.families.memory.sourceRecordIds).toEqual(['memory-a']);
        expect(result.receipt.families.memory.targetRecordIds).toEqual(['memory-a']);
        expect(result.receipt.families.memory.unrelatedTargetRecordIds).toEqual(['other-memory']);
        expect(result.receipt.families.messages.sourceRecordIds).toEqual(['MESSAGE:a']);
        expect(result.receipt.families.messages.targetRecordIds).toEqual(['MESSAGE:a']);
        expect(result.receipt.families.messages.continuity.requiredStages).toEqual(['graph']);
    });

    test('replayed origin identity cannot masquerade as the target accepting plane', () => {
        const spec = validSpec();

        spec.messages.targetEntriesAfter[0] = {...messageSource[0]};

        const result = deriveDualCorpusReplayReceipt(spec);

        expect(result.ok).toBe(false);
        expect(result.reason).toContain('origin identity must not masquerade as target write identity');
    });

    test('unknown source provenance, missing target rows, and non-monotonic stage state fail closed', () => {
        const unknown = validSpec();
        unknown.memory.payloadEntries = [{...memorySource[0], planeId: 'unknown'}];
        expect(deriveDualCorpusReplayReceipt(unknown).reason).toContain('unknown or mixed source provenance');

        const missing = validSpec();
        missing.messages.targetEntriesAfter = [];
        expect(deriveDualCorpusReplayReceipt(missing).reason).toContain('absent from the target WAL');

        const lost = validSpec();
        lost.memory.appliedStagesAfter = allStages(['memory-a']);
        expect(deriveDualCorpusReplayReceipt(lost).reason).toContain('lost');
    });
});

test.describe('evaluateDemotion — invoked dual-WAL provenance producer', () => {
    const CUTOVER   = Date.UTC(2026, 6, 30, 0);
    const BEFORE    = CUTOVER - 24 * 60 * 60 * 1000;
    const AFTER     = CUTOVER + 1000;
    const CANONICAL = 'neo-local-canonical';
    const OVERLAY   = 'neo-pilot-overlay';

    let memoryWalDir, messageWalDir;

    const memoryRecord = (id, timestamp) => ({
        id,
        timestamp,
        metadata: {prompt: id, thought: id, response: id},
        document: id
    });
    const messageRecord = (id, timestamp) => ({
        id,
        timestamp,
        graphProjectionVersion: 1,
        message               : {id, type: 'MESSAGE', name: id, properties: {subject: id}},
        routing               : {sentBy: '@alice', to: '@bob', senderUserId: 'alice', broadcastRecipients: []},
        optionalEdges         : {relatedTickets: [], relatedSessions: [], taggedConcepts: []}
    });

    test.beforeEach(async () => {
        memoryWalDir  = await mkdtemp(path.join(os.tmpdir(), 'neo-pilot-memory-'));
        messageWalDir = await mkdtemp(path.join(os.tmpdir(), 'neo-pilot-message-'));
    });

    test.afterEach(async () => {
        await Promise.all([
            rm(memoryWalDir, {recursive: true, force: true}),
            rm(messageWalDir, {recursive: true, force: true})
        ]);
    });

    test('the source names the actual immutable WAL field, not a caller assertion', () => {
        expect(OVERLAY_TAGGING_PRODUCER).toBe('wal-record.planeId');
    });

    test('reaches demoted-clean with concurrent canonical writes and pre-cutover legacy context', async () => {
        const legacyKey  = '2026-07-29',
              legacyPath = path.join(memoryWalDir, getWalRecordsFileName(legacyKey));

        await fs.writeFile(
            legacyPath,
            `${JSON.stringify({...memoryRecord('legacy-memory', BEFORE), segmentKey: legacyKey})}\n`,
            'utf8'
        );
        await appendWalMemory(memoryRecord('canonical-memory', AFTER), {
            dir    : memoryWalDir,
            planeId: CANONICAL
        });
        await appendWalMessage(messageRecord('MESSAGE:canonical', AFTER + 1), {
            dir    : messageWalDir,
            planeId: CANONICAL
        });

        const result = await evaluateDemotion({
            memoryWalDir,
            messageWalDir,
            overlayPlaneId    : OVERLAY,
            cutoverStartedAt  : CUTOVER,
            preCloneSegmentIds: [getWalRecordsFileName(legacyKey)]
        });

        expect(result.terminal).toBe('demoted-clean');
        expect(result.eligibility).toBe('unchanged');
        expect(result.receipt.legacyUnknownTotal).toBe(1);
        expect(result.receipt.concurrentGainTotal).toBe(2);
        expect(result.receipt.knownPlaneCounts).toEqual({[CANONICAL]: 2});
        expect(result.receipt.recordIds).toEqual({
            memory  : ['canonical-memory'],
            messages: ['MESSAGE:canonical']
        });
    });

    test('one overlay-stamped durable record forces failed-contained with the segment named', async () => {
        await appendWalMemory(memoryRecord('overlay-memory', AFTER), {
            dir    : memoryWalDir,
            planeId: OVERLAY
        });

        const result = await evaluateDemotion({
            memoryWalDir,
            messageWalDir,
            overlayPlaneId    : OVERLAY,
            cutoverStartedAt  : CUTOVER,
            preCloneSegmentIds: []
        });

        expect(result.terminal).toBe('failed-contained');
        expect(result.reason).toContain('overlay-tagged segment');
        expect(result.reason).toContain(getWalRecordsFileName('2026-07-30'));
    });

    test('one provenance-unknown record inside the cutover window forces failed-contained', async () => {
        const segmentKey = '2026-07-30';

        await fs.writeFile(
            path.join(messageWalDir, getMessageWalRecordsFileName(segmentKey)),
            `${JSON.stringify({...messageRecord('MESSAGE:unknown', AFTER), segmentKey})}\n`,
            'utf8'
        );

        const result = await evaluateDemotion({
            memoryWalDir,
            messageWalDir,
            overlayPlaneId    : OVERLAY,
            cutoverStartedAt  : CUTOVER,
            preCloneSegmentIds: []
        });

        expect(result.terminal).toBe('failed-contained');
        expect(result.reason).toContain('inside the cutover window');
        expect(result.reason).toContain('messages:MESSAGE:unknown');
    });

    test('a torn row fails the invoked strict scan instead of disappearing from evidence', async () => {
        const {filePath} = await appendWalMessage(messageRecord('MESSAGE:valid', AFTER), {
            dir    : messageWalDir,
            planeId: CANONICAL
        });

        await fs.appendFile(filePath, '{"id":"MESSAGE:torn"', 'utf8');

        const result = await evaluateDemotion({
            memoryWalDir,
            messageWalDir,
            overlayPlaneId    : OVERLAY,
            cutoverStartedAt  : CUTOVER,
            preCloneSegmentIds: []
        });

        expect(result.terminal).toBe('failed-contained');
        expect(result.reason).toContain('line 2 is not valid JSON');
        expect(result.reason).toContain('quarantined');
    });

    test('a caller-authored clean scan is ignored; only configured roots reach the producer', async () => {
        const result = await evaluateDemotion({
            overlayScan: {
                planeIdSource      : OVERLAY_TAGGING_PRODUCER,
                scannedSegmentCount: 0,
                taggedSegments     : []
            }
        });

        expect(result.terminal).toBe('failed-contained');
        expect(result.reason).toContain('memoryWalDir and messageWalDir are required');
    });

    test('the pure derivation validates a scan shape but carries no producer authority', async () => {
        await appendWalMemory(memoryRecord('canonical-memory', AFTER), {
            dir    : memoryWalDir,
            planeId: CANONICAL
        });

        const scan = await produceOverlayScan({
            memoryWalDir,
            messageWalDir,
            overlayPlaneId  : OVERLAY,
            cutoverStartedAt: CUTOVER
        });

        expect(validateOverlayScan(scan)).toBeNull();
        expect(validateOverlayScan({...scan, planeIdSource: 'invented'}))
            .toContain('is not the substrate\'s plane-id producer');
        expect(deriveDemotionTerminal({
            overlayScan        : scan,
            preCloneSegmentIds : [],
            postPilotSegmentIds: scan.segmentIds
        }).terminal).toBe('demoted-clean');
    });
});

test.describe('diffSegmentIdentity — identity, not cardinality', () => {
    test('⭐ EQUAL COUNTS do not prove no-loss: delete-old + add-new is caught', () => {
        // 3 -> 3 looks stable while committed history was destroyed and replaced.
        const result = diffSegmentIdentity(['s1', 's2', 's3'], ['s2', 's3', 's9']);

        expect(result.lost).toEqual(['s1']);
        expect(result.gained).toEqual(['s9']);
    });

    test('concurrent growth from other seats is gain, not loss', () => {
        // The load-bearing case: a pilot occupies one seat for 1-2 weeks while the institution keeps writing,
        // so extra durable segments are the EXPECTED shape of a healthy demotion. A fingerprint equality
        // proof would have called this a failure and been switched off within one pilot.
        const result = diffSegmentIdentity(['s1', 's2'], ['s1', 's2', 's3', 's4']);

        expect(result.lost).toEqual([]);
        expect(result.gained).toEqual(['s3', 's4']);
    });

    test('an unchanged corpus has neither', () => {
        expect(diffSegmentIdentity(['s1'], ['s1'])).toEqual({lost: [], gained: []});
        expect(diffSegmentIdentity([], [])).toEqual({lost: [], gained: []});
    });

    test('malformed id lists refuse rather than coerce', () => {
        for (const [pre, post] of [[undefined, ['s1']], [['s1'], undefined], [['s1', ''], ['s1']], [['s1', 42], ['s1']], [3, 3]]) {
            expect(diffSegmentIdentity(pre, post).reason).toContain('identity is required');
        }
    });
});

test.describe('no path exits without a named terminal', () => {
    test('both evaluators always return a member of PILOT_TERMINALS', async () => {
        const inputs = [
            undefined, null, {}, 'string', 42, [],
            {plan: {}}, {continuity: {ok: true, monotonic: true}},
            {payloadEntries: [{id: 'a', timestamp: 1}], appliedStagesBefore: allStages([]), appliedStagesAfter: allStages(['a'])},
            {overlayScan: []}, {overlayScan: {planeIdSource: 'x', scannedSegmentCount: 0, taggedSegments: []}},
            {preCloneSegmentIds: ['s1'], postPilotSegmentIds: ['s1']}
        ];

        const assertNamedTerminal = result => {
            expect(PILOT_TERMINALS).toContain(result.terminal);
            expect(typeof result.reason).toBe('string');
            expect(result.reason.length).toBeGreaterThan(0);
            expect(result.eligibility).toBe(eligibilityEffect(result.terminal));
            if (result.eligibility === 'opened') expect(result.terminal).toBe('committed');
        };

        for (const input of inputs) {
            const promotion = evaluatePromotion(input),
                  demotion  = await evaluateDemotion(input);

            assertNamedTerminal(promotion);
            assertNamedTerminal(demotion);
            // Promotion remains closed; malformed demotion calls fail contained because no producer scan ran.
            expect(promotion.terminal).toBe('failed-contained');
            expect(demotion.terminal).toBe('failed-contained');
        }
    });
});
