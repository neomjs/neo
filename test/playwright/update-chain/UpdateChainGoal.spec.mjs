import {test, expect}  from '@playwright/test';
import fs              from 'fs-extra';
import path            from 'path';
import {execFile}      from 'node:child_process';
import {promisify}     from 'node:util';
import {fileURLToPath} from 'url';

const execFileAsync = promisify(execFile),
      repoRoot      = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

/**
 * The Epic's outcome sentence, asserted as one property:
 *
 * > A deployed plane, following an allowed channel, reaches the **exact** eligible merged cohort without a
 * > human typing a Docker command — or fails contained, with terminal evidence its consumers can see.
 *
 * This scenario supplies the cross-chain falsifier and **implements none of the machinery it measures**. No
 * caller, no selector, no admissibility rule. If it starts growing those, it has become a second umbrella
 * wearing a sub's label and the Epic is back to having no goal bar.
 *
 * ## Red-first, on purpose
 *
 * It lands red while the implementation leaves are open. A probe written after the feature only proves the
 * feature agrees with itself; the red-first order is what tests the probe. Its obligation while red is to
 * name **which leg** is missing — an opaque failure teaches nothing and gets muted.
 *
 * ## Inconclusive is a FAILURE, never a pass
 *
 * A scenario that cannot provision a plane has measured nothing. Reporting that as green would make the goal
 * bar satisfiable by breaking the harness, so every unrunnable path fails loudly and says `INCONCLUSIVE`.
 */

/**
 * The chain, as legs. Each is a separate question, and the scenario's value is that it fails on the FIRST
 * unmet one by name rather than reporting a single opaque red.
 * @type {Object[]}
 */
// `surface` is the path whose existence is taken as evidence the leg has a shipped implementation.
// `null` means no surface is known yet, and the leg reports missing on that basis — wrong by
// OMISSION, which the next author corrects in one line, rather than wrong by construction.
const CHAIN_LEGS = [
    {
        key    : 'candidate-retained',
        owner  : '#16450',
        surface: null,
        what   : 'a merged cohort produces a retained, addressable candidate carrying an exact digest'
    },
    {
        key    : 'selection-bounded',
        owner  : '#16451',
        surface: null,
        what   : 'selection takes the latest compatible staged cohort, or produces an explicit ineligibility record'
    },
    {
        key    : 'admissibility-answerable',
        owner  : '#16453',
        surface: 'ai/scripts/setup/cohortAdmissibility.mjs',
        what   : 'a predicate answers whether the target may take the cohort, resolving unknown to NOT admissible'
    },
    {
        key    : 'activation-sole-path',
        owner  : '#16452',
        surface: 'ai/services/shared/activationReceipt.mjs',
        what   : 'a durable receipt links a fresh RESTORABLE result before first mutation, or no mutation occurs'
    },
    {
        key    : 'exact-revision-arrived',
        owner  : '#16454',
        surface: 'ai/scripts/maintenance/migrateDeployment.mjs',
        what   : 'every service in the cohort reports the EXACT resolved target at /app/.neo-revision'
    },
    {
        key    : 'consumers-observe',
        owner  : '#16320',
        surface: null,
        what   : 'already-connected clients observe the transition as complete rather than staying pinned'
    }
];

/**
 * @summary Reports which chain legs have a shipped implementation, without asserting they WORK.
 *
 * Deliberately weak: presence of a surface is not evidence it composes, which is the entire reason this
 * scenario exists. Its only job is to make the red failure name the missing leg instead of failing opaquely,
 * so an unimplemented leg is distinguishable from an implemented-but-broken one.
 * @returns {Promise<Object>} `{missing, present}` — leg descriptors, partitioned.
 */
async function surveyLegs() {
    const missing = [],
          present = [];

    for (const leg of CHAIN_LEGS) {
        // Probe EVERY leg that names a surface. The first cut read
        //
        //     leg.key === 'exact-revision-arrived' && await fs.pathExists(<one hardcoded path>)
        //
        // whose `&&` short-circuits for every other leg, so their surfaces were never evaluated and the
        // survey restated a hardcoded assumption instead of observing anything. It reported one shipped
        // leg while three had landed — two of them surfaces this author had merged hours earlier. A
        // survey that cannot notice a sibling landing is the opposite of the property this scenario
        // exists to provide.
        const shipped = leg.surface
            ? await fs.pathExists(path.join(repoRoot, leg.surface))
            : false;

        (shipped ? present : missing).push(leg)
    }

    return {missing, present}
}

/**
 * @summary Confirms the scenario could run at all, so an unrunnable harness cannot read as a pass.
 * @returns {Promise<Object>} `{runnable, reason}`
 */
async function checkRunnable() {
    const probe = await execFileAsync('docker', ['version', '--format', '{{.Server.Version}}'])
        .then(result => ({ok: true, out: result.stdout.trim()}))
        .catch(error => ({ok: false, out: (error.stderr || error.message || '').trim()}));

    if (!probe.ok) {
        return {runnable: false, reason: `Docker daemon unreachable — ${probe.out}`}
    }

    return {runnable: true, reason: `docker server ${probe.out}`}
}

test.describe('the Epic goal bar: a plane reaches the exact merged cohort with no human Docker command', () => {
    test('an unrunnable scenario reports INCONCLUSIVE and fails — it never reports pass', async () => {
        const {runnable, reason} = await checkRunnable();

        // HONEST BOUND, flagged in review by @neo-opus-ada: this test's NAME promises more than its body
        // checks. The assertion IS the INCONCLUSIVE mechanism rather than a test of it — with Docker up it
        // passes without exercising the failure path, and with Docker down it fails. There is no arrangement
        // here in which the INCONCLUSIVE path is observed PRODUCING a failure.
        //
        // Defensible only while the assertion is two self-evident lines. The moment provisioning grows a
        // real fixture, "unrunnable" becomes a state with several causes and this reporting contract becomes
        // something that can regress silently — at which point this needs a case that arranges an
        // unprovisionable harness and observes the named failure.
        //
        // Second known bound: `docker version` probes the LOCAL daemon, while the subject of this goal bar
        // is a disposable plane. Fine while the scenario provisions nothing; it must become a probe of the
        // plane it intends to create.
        expect(runnable, `INCONCLUSIVE — the scenario could not provision a plane: ${reason}`).toBe(true)
    });

    test('the chain is not yet composable, and the failure names which legs are missing', async () => {
        const {missing, present} = await surveyLegs();

        // Red-first bookkeeping, asserted rather than assumed. SORTED before comparison, because `toEqual`
        // on an array is ORDERED equality — the previous version claimed set-equality in this very comment
        // and delivered positional equality, so reordering `CHAIN_LEGS` for readability would have failed a
        // test whose subject is WHICH legs ship, not what order they are declared in. Proved by reordering,
        // in review by @neo-opus-ada.
        //
        // Keys rather than a count, so a landing leg names itself instead of sliding past a number. The
        // baseline is three because three surfaces are on `dev` today — the previous baseline of one came
        // from a short-circuited survey that could not have observed the other two, both of which had
        // already merged when this scenario was written.
        expect(present.map(leg => leg.key).sort()).toEqual([
            'activation-sole-path',
            'admissibility-answerable',
            'exact-revision-arrived'
        ]);

        const named = missing.map(leg => `${leg.key} (${leg.owner}) — ${leg.what}`).join('\n  · ');

        // The deliberate red. It carries the missing legs by name and owner, so the failure is a work list
        // rather than an opaque wall. This assertion inverts and the scenario proceeds to the real
        // end-to-end property once the legs land — that flip, plus moving this project into the default CI
        // gate, is this ticket's completion condition.
        expect(missing, `the update chain does not yet compose — ${missing.length} leg(s) missing:\n  · ${named}`).toEqual([])
    })
});
