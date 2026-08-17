import {execSync} from 'node:child_process';
import process    from 'node:process';

/**
 * A deleted spec is the one regression the test suite cannot report.
 *
 * Every other class of failure announces itself by turning something red. A suite that stops existing
 * takes its own assertions with it, so the run goes green with less coverage behind the same number.
 * The silence is indistinguishable from success.
 *
 * The repo had exactly one place that thought about deletions and it thought about EXCLUDING them:
 * `check-ticket-archaeology.mjs` passes `--diff-filter=d` because a deleted file carries no comments
 * to audit. `ai/scripts/agent-preflight.mjs` reads `--diff-filter=ACMR` — Added, Copied, Modified, Renamed, with
 * `D` the one letter left out. Nothing looked at disappearance.
 *
 * This guard asks for an ACCOUNT, never a veto. Deleting a spec is routine and correct: it gets
 * renamed, split, folded into a sibling, or its subject genuinely goes away. Each of those is one line
 * to say. What must not stay free is deletion with no account at all, because that is the only case
 * indistinguishable from an accident.
 *
 * It runs pre-push rather than pre-commit for a mechanical reason: the account lives in the commit
 * message (the file is gone, so it cannot live in the file), and at pre-commit time the message does
 * not exist yet. `check-commit-authorship.mjs` reads commit messages from the same hook for the same
 * reason, and this guard lifts its range handling.
 */

const
    ZERO_SHA = '0'.repeat(40),
    exec     = command => execSync(command, {encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore']}).trim(),
    tryExec  = command => { try { return exec(command) } catch { return '' } };

/**
 * @summary Spec files this guard protects — the unit tree, where a silent deletion is unobservable.
 *
 * Scoped rather than repo-wide on purpose. Source deletion is already loud: something stops importing
 * it, or a test goes red. Integration and e2e suites are excluded because their runners report suite
 * counts a human reads per run; the unit tree is the population where a missing file vanishes into a
 * four-digit pass total.
 * @type {RegExp}
 */
export const SPEC_PATH_PATTERN = /^test\/playwright\/unit\/.+\.spec\.mjs$/u;

/**
 * @summary The account a deleting commit must carry.
 *
 * Deliberately a marker plus free prose rather than a structured field: the useful part is "where this
 * coverage went", which no enum can hold. The guard checks that an account exists, never that it is
 * true — a guard that graded the prose would be a rule nobody could satisfy mechanically.
 * @type {String}
 */
export const RETIREMENT_MARKER = 'spec-retired:';

/**
 * @summary The commits this push will actually send, read from git's own ref tuples.
 *
 * git hands a pre-push hook `<localRef> <localSha> <remoteRef> <remoteSha>` per ref on stdin.
 * `remoteSha..localSha` is the exact set git will apply; a new remote branch reports the zero-sha,
 * where `origin/dev..localSha` is the honest fallback, and a ref deletion sends no commits at all.
 * Same contract as `check-commit-authorship.mjs`, whose comment records why guessing the range with a
 * hard-coded `origin/dev..HEAD` let a push to a sibling ref sail past the guard it was meant to hit.
 *
 * @param {String} stdin Raw hook payload.
 * @returns {String[]} Rev-list ranges to scan.
 */
export function pendingRanges(stdin) {
    const rows = String(stdin || '').split('\n').map(line => line.trim()).filter(Boolean);

    if (rows.length === 0) {
        // Invoked outside the hook, or a git that sent nothing: scan the branch's own range rather
        // than no-opping. A guard that passes when it cannot see its input has the failure shape it exists to catch.
        return ['origin/dev..HEAD']
    }

    return rows.map(row => {
        const [, localSha, , remoteSha] = row.split(/\s+/);

        if (!localSha || localSha === ZERO_SHA) {
            return null
        }

        return !remoteSha || remoteSha === ZERO_SHA ? `origin/dev..${localSha}` : `${remoteSha}..${localSha}`
    }).filter(Boolean)
}

/**
 * @summary Extracts DELETED spec paths from `git show --name-status -M` output.
 *
 * **The rename exclusion lives here rather than in a `--diff-filter` flag, and that is the point.**
 * Rename detection is configurable (`diff.renames`), so a flag combination that excludes renames on
 * one machine can report them as delete-plus-add on another — the guard would then fire on a `git mv`
 * for half the team. Parsing the status letter makes the rule explicit, machine-independent, and
 * testable without a repository.
 *
 * `R100 old new` is a rename and never a deletion. `D path` is. A copy (`C`) leaves the source in
 * place, so it is not a deletion either. Only a leading `D` counts.
 *
 * **Combined-diff rows parse through the same rule.** A merge renders one status letter per parent,
 * so a resolution-deleted file arrives as `DD path` (`DDD` for an octopus) and a resolution-renamed
 * one as `RR path` — note the single path, unlike the two-path `R100 old new` of an ordinary diff.
 * `startsWith('D')` is what separates them, and it is doing real work rather than being incidental:
 * were the test `status === 'D'`, every merge-resolution deletion would slip past.
 *
 * @param {String} output Raw `--name-status` block.
 * @returns {String[]} Deleted spec paths, in encounter order.
 */
export function parseDeletedSpecs(output) {
    return String(output || '')
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean)
        .map(line => {
            const [status, ...paths] = line.split(/\t/);

            // A rename/copy row carries TWO paths and a similarity-scored status (`R100`, `C75`). Its
            // first path is the source, which is exactly what a naive "take field 1 when it looks
            // deleted" reader would mistake for a deletion.
            return status?.startsWith('D') && paths.length === 1 ? paths[0] : null
        })
        .filter(path => path && SPEC_PATH_PATTERN.test(path))
}

/**
 * @summary The account line: the marker at the head of its own line, followed by actual content.
 *
 * A substring test is not a grammar. `includes('spec-retired:')` accepted the marker with nothing
 * after it, the marker followed only by whitespace, a passing mention inside a docs sentence, and —
 * the one that settles it — `not-spec-retired: no account`, in which a message explicitly DENYING an
 * account contains the marker and satisfies the guard. A rule that a denial can satisfy is costume.
 *
 * So: line-anchored (leading quote / list punctuation tolerated, because commit bodies get wrapped
 * and bulleted), and a non-whitespace payload is required after the colon. The guard still never
 * grades the prose — it cannot know whether "folded into X" is true — but it can insist that
 * something was said.
 * @type {RegExp}
 */
const RETIREMENT_ACCOUNT_PATTERN = /^[ \t>*-]*spec-retired:[ \t]*(\S.*)$/im;

/**
 * @summary Whether a commit message carries a retirement account.
 * @param {String} message Full commit message (subject + body).
 * @returns {Boolean}
 */
export function hasRetirementAccount(message) {
    return RETIREMENT_ACCOUNT_PATTERN.test(String(message || ''));
}

/**
 * @summary Renders the failure text.
 *
 * It names the paths and the marker and does NOT tell the author to restore the file. Restoring is
 * frequently the wrong repair — the deletion is usually intentional and simply unaccounted — and a
 * guard that prescribes the wrong fix trains people to route around it.
 *
 * @param {Array<{sha: String, subject: String, specs: String[]}>} violations
 * @returns {String}
 */
export function formatFailure(violations) {
    const lines = [
        `check-spec-retirement: ${violations.length} commit(s) delete unit spec files with no account.`,
        '',
        'A deleted suite cannot fail on its own absence — CI stays green with less coverage behind it.',
        `Say where the coverage went by adding a \`${RETIREMENT_MARKER} <where it lives now, or why the behavior is gone>\``,
        'line to the deleting commit message (amend, or rebase the commit that removed them).',
        '',
        'This is an account, not a veto: renaming, splitting, folding into a sibling, or removing a',
        'retired behavior are all legitimate, and each is one line to state. Restoring the file is',
        'usually NOT the right repair.',
        ''
    ];

    violations.forEach(({sha, subject, specs}) => {
        lines.push(`  ${sha.slice(0, 10)} ${subject}`);
        specs.forEach(spec => lines.push(`      deleted: ${spec}`));
    });

    return lines.join('\n')
}

/**
 * @summary Collects unaccounted spec deletions across the pushed ranges.
 * @param {String[]} ranges Rev-list ranges.
 * @returns {Array<{sha: String, subject: String, specs: String[]}>}
 */
function collectViolations(ranges) {
    const violations = [];

    ranges.forEach(range => {
        // Merges are scanned. An earlier draft passed `--no-merges` on the reasoning that a deletion
        // is always carried by the commit that made it — false for a spec deleted while RESOLVING a
        // merge, where neither parent deletes it and the merge is the only commit that could hold an
        // account. Skipping merges left exactly this file's defect class reachable through a rebase.
        //
        // What makes including them safe is the diff rendering, not the traversal: see the combined-
        // diff note in `collectViolations`' git show call.
        //
        // STRICT, not `tryExec`: an unresolvable range (a missing `origin/dev` in a shallow CI
        // checkout is the live case) must fail loudly. Swallowing it returns zero commits, the guard
        // exits green, and the result is a silence indistinguishable from success — precisely the
        // defect this file exists to catch, reproduced inside the catcher.
        let shas;

        try {
            shas = exec(`git rev-list ${range}`).split('\n').map(s => s.trim()).filter(Boolean)
        } catch {
            console.error(
                `check-spec-retirement: cannot resolve the range \`${range}\`.\n` +
                'The guard refuses to pass on a range it could not read — in CI this usually means a\n' +
                'shallow checkout (needs `fetch-depth: 0`) or a missing `origin/dev` remote-tracking ref.'
            );
            process.exit(1)
        }

        shas.forEach(sha => {
            // Two properties of this exact invocation are load-bearing.
            //
            // `-M` forces rename detection ON regardless of the user's `diff.renames`, so a `git mv`
            // arrives as an `R` row that the parser drops. Without it, a machine with renames disabled
            // reports the move as delete-plus-add and the guard fires on a legitimate rename.
            //
            // On a MERGE, `git show` with no `--first-parent` renders the COMBINED diff, which lists
            // only paths differing from EVERY parent — precisely what the merge resolution itself did.
            // That is the correct attribution and it is why merges can be scanned at all:
            //
            //   - resolution deletes a spec neither parent deleted  -> `DD <path>`, caught (no other
            //     commit could carry the account, so the merge must)
            //   - a branch deletes a spec WITH an account and the merge merely takes it -> the
            //     combined diff is EMPTY, silent, because the branch commit already answered for it
            //
            // `--first-parent` would report the second case as a deletion too, demanding an account on
            // every merge that carries an already-accounted retirement — a false positive on exactly
            // the workflow this guard is meant to permit.
            const specs = parseDeletedSpecs(tryExec(`git show ${sha} --name-status -M --format=`));

            if (specs.length === 0) {
                return
            }

            if (hasRetirementAccount(tryExec(`git log -1 ${sha} --format=%B`))) {
                return
            }

            violations.push({sha, subject: tryExec(`git log -1 ${sha} --format=%s`), specs})
        })
    });

    return violations
}

/**
 * @summary Entry point. Reads git's pre-push payload from stdin and exits non-zero on unaccounted deletions.
 * @returns {Promise<void>}
 */
async function main() {
    let stdin = '';

    if (!process.stdin.isTTY) {
        for await (const chunk of process.stdin) {
            stdin += chunk
        }
    }

    const violations = collectViolations(pendingRanges(stdin));

    if (violations.length > 0) {
        console.error(formatFailure(violations));
        process.exit(1)
    }
}

// Import-safe: the spec imports the pure exports above without running the git scan.
if (process.argv[1] && process.argv[1].endsWith('check-spec-retirement.mjs')) {
    await main()
}
