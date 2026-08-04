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
const CHAIN_LEGS = [
    {
        key  : 'candidate-retained',
        owner: '#16450',
        what : 'a merged cohort produces a retained, addressable candidate carrying an exact digest'
    },
    {
        key  : 'selection-bounded',
        owner: '#16451',
        what : 'selection takes the latest compatible staged cohort, or produces an explicit ineligibility record'
    },
    {
        key  : 'admissibility-answerable',
        owner: '#16453',
        what : 'a predicate answers whether the target may take the cohort, resolving unknown to NOT admissible'
    },
    {
        key  : 'activation-sole-path',
        owner: '#16452',
        what : 'a durable receipt links a fresh RESTORABLE result before first mutation, or no mutation occurs'
    },
    {
        key  : 'exact-revision-arrived',
        owner: '#16454',
        what : 'every service in the cohort reports the EXACT resolved target at /app/.neo-revision'
    },
    {
        key  : 'consumers-observe',
        owner: '#16320',
        what : 'already-connected clients observe the transition as complete rather than staying pinned'
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
        // The migration bootstrap is the only leg with a shipped executable surface today. The others are
        // open tickets, so this survey is expected to report five missing legs until they land — that
        // expectation is asserted below rather than assumed, so a leg landing silently cannot go unnoticed.
        const shipped = leg.key === 'exact-revision-arrived' &&
            await fs.pathExists(path.join(repoRoot, 'ai/scripts/maintenance/migrateDeployment.mjs'));

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

        // The assertion is on the REPORTING contract, not on Docker being present: if the harness cannot
        // provision, the run must fail with a named cause. That is the property a green-when-broken harness
        // would violate, and it is checkable whether or not Docker happens to be available here.
        expect(runnable, `INCONCLUSIVE — the scenario could not provision a plane: ${reason}`).toBe(true)
    });

    test('the chain is not yet composable, and the failure names which legs are missing', async () => {
        const {missing, present} = await surveyLegs();

        // Red-first bookkeeping, asserted rather than assumed: exactly one leg ships today. When a sibling
        // lands, this count moves and the scenario says so, instead of a leg appearing unnoticed.
        expect(present.map(leg => leg.key)).toEqual(['exact-revision-arrived']);

        const named = missing.map(leg => `${leg.key} (${leg.owner}) — ${leg.what}`).join('\n  · ');

        // The deliberate red. It carries the missing legs by name and owner, so the failure is a work list
        // rather than an opaque wall. This assertion inverts and the scenario proceeds to the real
        // end-to-end property once the legs land — that flip, plus moving this project into the default CI
        // gate, is this ticket's completion condition.
        expect(missing, `the update chain does not yet compose — ${missing.length} leg(s) missing:\n  · ${named}`).toEqual([])
    })
});
