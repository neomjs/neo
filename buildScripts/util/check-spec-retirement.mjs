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
    /**
     * node's `execSync` default `maxBuffer` is 1 MB, and `git ls-tree -r --name-only` over this
     * repository already emits 1,327,472 bytes. The overrun throws `ENOBUFS` — and every read below
     * that swallows a throw then yields an EMPTY string, which downstream is indistinguishable from
     * a genuinely empty result. Measured on this tree: the surviving-subject scan saw 0 tracked
     * paths and reported nothing, on every commit, in a repository where the answer is never zero.
     *
     * Sized well past the repository rather than trimmed to it. The cost of a generous ceiling is
     * memory that is never allocated unless the output actually arrives; the cost of a tight one is
     * the silence this guard exists to catch, reproduced inside the catcher.
     * @type {Number}
     */
    MAX_BUFFER = 64 * 1024 * 1024,
    exec     = command => execSync(command, {encoding: 'utf8', maxBuffer: MAX_BUFFER, stdio: ['pipe', 'pipe', 'ignore']}).trim(),
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
 * @summary Every path the commit deleted, specs included — the same rows, without the spec filter.
 *
 * Read for one purpose: to tell "the subject stayed" apart from "the subject left with its spec, and
 * an unrelated namesake remains". Without it the guard sees only the post-deletion tree, in which a
 * departed subject is indistinguishable from one that was never there — see
 * {@link unaccountedSurvivors}.
 *
 * @param {String} output `git show --name-status` output.
 * @returns {String[]} Deleted paths, in encounter order.
 */
export function parseDeletedPaths(output) {
    return String(output || '')
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean)
        .map(line => {
            const [status, ...paths] = line.split(/\t/);

            return status?.startsWith('D') && paths.length === 1 ? paths[0] : null
        })
        .filter(Boolean)
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
 * @summary The same grammar, global, for reading every account payload rather than testing existence.
 *
 * A separate constant because a `g` regex carries `lastIndex` across calls: sharing one instance
 * between `test()` and `matchAll()` makes each answer depend on the previous caller.
 * @type {RegExp}
 */
const RETIREMENT_ACCOUNT_PATTERN_ALL = /^[ \t>*-]*spec-retired:[ \t]*(\S.*)$/gim;

/**
 * @summary Whether a commit message carries a retirement account.
 * @param {String} message Full commit message (subject + body).
 * @returns {Boolean}
 */
export function hasRetirementAccount(message) {
    return RETIREMENT_ACCOUNT_PATTERN.test(String(message || ''));
}

/**
 * @summary The payloads of every `spec-retired:` account line in a commit message.
 *
 * Separate from {@link hasRetirementAccount} because the two questions differ: existence is answered
 * by any one line, while "does the account name this survivor" may only be answered by what the
 * account lines actually SAY.
 *
 * **Why the payload rather than the whole message.** The first draft matched surviving paths against
 * the entire commit body, which let a path anywhere — the headline, a rationale paragraph, a `Refs:`
 * trailer, a footer — discharge an account that named nothing. A commit reading
 * `refactor: rework buildScripts/util/check-block-alignment.mjs` with a generic
 * `spec-retired: moved to Brain` was accepted, although the account itself named no survivor. The
 * demand is that the ACCOUNT names the file, so the account is the only text that can satisfy it.
 *
 * @param {String} message Full commit message (subject + body).
 * @returns {String[]} Account payloads, in message order.
 */
export function retirementAccounts(message) {
    return [...String(message || '').matchAll(RETIREMENT_ACCOUNT_PATTERN_ALL)].map(match => match[1].trim())
}

/**
 * @summary The in-tree path a deleted spec's subject would occupy: its own parent directory plus its name.
 *
 * `…/unit/ai/buildScripts/util/check-block-alignment.spec.mjs` yields `util/check-block-alignment.mjs`,
 * which `buildScripts/util/check-block-alignment.mjs` satisfies.
 *
 * **The parent directory is load-bearing and was added on measurement, not taste.** A bare basename
 * match — `logger.spec.mjs` looks for any `logger.mjs` — was the first draft, and replaying it over
 * `c623b2f63c` produced ten false positives: four per-server `logger.spec.mjs` files resolved to
 * `src/util/Logger.mjs`, two per-server `Server.spec.mjs` files to `examples/form/field/fileupload/server.mjs`,
 * and `daemons/orchestrator/scheduling/picker.spec.mjs` to `src/form/field/Picker.mjs`. None of those
 * files is the deleted spec's subject. Demanding an account for a file the author never touched is the
 * failure this guard's own header warns about — it trains people to route around the check.
 *
 * The rule therefore under-reports rather than over-reports, deliberately. A spec sitting directly in
 * `test/playwright/unit/` derives the suffix `unit/<name>.mjs`, which nothing satisfies, so it is never
 * flagged. For a guard that demands an ACCOUNT, a false positive is the expensive error and a missed
 * row is merely the status quo.
 *
 * @param {String} specPath Deleted spec path.
 * @returns {String} Lower-cased `<parentDir>/<name>.mjs`, or an empty string when the path has no parent.
 */
export function deriveSubjectSuffix(specPath) {
    const segments = String(specPath || '').split('/');

    if (segments.length < 2) {
        return ''
    }

    const
        file      = segments.pop().replace(/\.spec\.mjs$/u, '.mjs'),
        parentDir = segments.pop();

    return `${parentDir}/${file}`.toLowerCase()
}

/**
 * @summary Tree paths that still hold the deleted spec's subject.
 *
 * Case-insensitive because the split's own population needs it: `DataSyncPipeline.spec.mjs` covers
 * `buildScripts/dataSyncPipeline.mjs`, and a case-sensitive match would call that subject departed.
 *
 * `test/` is excluded from the candidate set so that a sibling spec is never mistaken for an
 * implementation — the question is whether the SUBJECT survived, not whether some other test did.
 *
 * @param {String} specPath Deleted spec path.
 * @param {String[]} treePaths Tracked paths in the tree the deleting commit produced.
 * @returns {String[]} Surviving subject paths, in tree order.
 */
export function findSurvivingSubjects(specPath, treePaths) {
    const suffix = deriveSubjectSuffix(specPath);

    if (!suffix) {
        return []
    }

    return (treePaths || [])
        .filter(path => path && !path.startsWith('test/'))
        .filter(path => {
            const lower = path.toLowerCase();

            // `endsWith('/' + suffix)` anchors on a directory boundary, so `util/check-parse.mjs` is
            // not satisfied by `…/util/check-parse-extra.mjs`, and the bare equality covers a subject
            // sitting at the repository root.
            return lower.endsWith(`/${suffix}`) || lower === suffix
        })
}

/**
 * @summary Deleted specs whose subject is still in the tree and whose account never says so.
 *
 * **This is the one half of the account that is mechanically gradeable.** The rule above — an account
 * must EXIST, and the guard never asks whether it is TRUE — is correct and is not reopened here: no
 * tool can grade "folded into X". But "the subject of this deleted spec is still in this repository"
 * is not prose, it is a fact about the tree, and a commit removing that spec can be required to name
 * the file it left behind.
 *
 * The empirical case is `c623b2f63c`, where one sentence accounted for 796 unit-spec deletions and
 * mis-described at least 34 of them: measured against the tree that commit produced, 34 deleted specs
 * had a surviving subject and the account named none. Naming is what a general sentence cannot fake —
 * which is the whole point, since a general sentence is exactly what went wrong.
 *
 * **Ambiguous affinity yields no finding, deliberately.** `deriveSubjectSuffix` is a heuristic, and
 * on this tree it is genuinely ambiguous for real paths: portal `content/Component.mjs` has 2
 * candidates, `button/Base.mjs` 2, draggable `toolbar/SortZone.mjs` 3. When more than one tracked
 * path answers the suffix, the guard cannot tell which one was this spec's subject — so deleting the
 * REAL subject while an unrelated namesake survives would demand an account for a file the author
 * never touched. That is the expensive error, and it is the one the header of
 * {@link deriveSubjectSuffix} already commits this guard against: under-report rather than
 * over-report. A single candidate is the only case where "the subject survived" is a fact rather
 * than a guess, so it is the only case that fires.
 *
 * **A subject that left WITH its spec is not a survivor, even when a namesake remains.** Counting
 * candidates in the post-deletion tree cannot see this on its own: delete
 * `src/functional/button/Base.mjs` and its spec, and the two candidates for `button/Base.mjs`
 * collapse to one — `src/button/Base.mjs`, a different component the author never touched — which
 * then reads as an unambiguous survivor. The commit's own deleted paths are what disambiguate it, so
 * they are consulted before the tree: if this commit deleted a file answering the spec's subject
 * suffix, the subject departed and nothing is owed.
 *
 * @param {String[]} specs Deleted spec paths.
 * @param {String[]} treePaths Tracked paths in the tree the deleting commit produced.
 * @param {String} message Full commit message.
 * @param {String[]} [deletedPaths=[]] Every path the same commit deleted, specs included.
 * @returns {Array<{spec: String, subjects: String[]}>} Unnamed survivors, in encounter order.
 */
export function unaccountedSurvivors(specs, treePaths, message, deletedPaths = []) {
    // RA-3: the ACCOUNT must name the survivor, so only the account payloads are searched. Matching
    // the whole body let a path in the headline, a rationale, or a `Refs:` trailer discharge an
    // account that named nothing.
    const accounts = retirementAccounts(message).join('\n');

    return (specs || [])
        .filter(spec => {
            // The subject left in this very commit — a remaining namesake is a different file.
            const suffix = deriveSubjectSuffix(spec);

            return suffix && !(deletedPaths || []).some(path => {
                const lower = String(path).toLowerCase();

                return lower.endsWith(`/${suffix}`) || lower === suffix
            })
        })
        .map(spec => ({spec, subjects: findSurvivingSubjects(spec, treePaths)}))
        // Exactly one candidate: see the ambiguity note above. Naming that path in the account
        // discharges the row — the author is asked to acknowledge that the implementation stayed.
        .filter(({subjects}) => subjects.length === 1 && !accounts.includes(subjects[0]))
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
 * @summary Renders the surviving-subject failure text.
 *
 * Deliberately worded as a NARROWING of the existing account rather than a new demand: the commit
 * already carries a `spec-retired:` line — that is why it reached this check at all — and what is
 * missing is one path inside it. Naming the fix that precisely is what keeps the rule cheap enough to
 * satisfy rather than route around.
 *
 * @param {Array<{sha: String, subject: String, survivors: Array<{spec: String, subjects: String[]}>}>} violations
 * @returns {String}
 */
export function formatSurvivingSubjectFailure(violations) {
    const rows = violations.reduce((sum, {survivors}) => sum + survivors.length, 0);

    const lines = [
        `check-spec-retirement: ${rows} deleted spec(s) whose SUBJECT is still in this repository.`,
        '',
        'These commits carry an account, so the marker is satisfied — but the account does not mention',
        'the implementation each deleted spec was covering, and that implementation did not leave.',
        'A guard that still runs with no spec behind it is the coverage loss nothing else reports.',
        '',
        `Name the surviving file in the \`${RETIREMENT_MARKER}\` account — one path is enough per row —`,
        'or restore the spec if the coverage was lost by accident rather than on purpose.',
        ''
    ];

    violations.forEach(({sha, subject, survivors}) => {
        lines.push(`  ${sha.slice(0, 10)} ${subject}`);
        survivors.forEach(({spec, subjects}) => {
            lines.push(`      deleted:  ${spec}`);
            lines.push(`      survives: ${subjects.join(', ')}`);
        });
    });

    return lines.join('\n')
}

/**
 * @summary Every git read the collector performs, in one injectable port.
 *
 * Extracted so the collector can be driven end to end by a test. Before this existed the only
 * coverage was of the pure helpers, and the two defects that actually shipped both lived in the
 * consumed path rather than in a helper: a tree read that failed open, and a survivor search that
 * read the whole commit body. Helper-level green said nothing about either.
 *
 * `treePaths` is STRICT where the others are tolerant, and the asymmetry is the point — see
 * {@link collectViolations}.
 *
 * @param {String} [root] Repository to read; defaults to the working directory.
 * @returns {Object}
 */
export function createGit(root) {
    // `-C` rather than a chdir: the spec drives this against a throwaway fixture repository, and
    // `process.chdir` is process-global — under parallel test workers it would race.
    const at = root ? `git -C '${root}'` : 'git';

    const git = {
        revList     : range => exec(`${at} rev-list ${range}`).split('\n').map(sha => sha.trim()).filter(Boolean),
        nameStatus  : sha   => tryExec(`${at} show ${sha} --name-status -M --format=`),
        deletedSpecs: sha   => parseDeletedSpecs(git.nameStatus(sha)),
        deletedPaths: sha   => parseDeletedPaths(git.nameStatus(sha)),
        message     : sha   => tryExec(`${at} log -1 ${sha} --format=%B`),
        subject     : sha   => tryExec(`${at} log -1 ${sha} --format=%s`),
        treePaths   : sha   => exec(`${at} ls-tree -r --name-only ${sha}`).split('\n').map(path => path.trim()).filter(Boolean)
    };

    return git
}

/**
 * @summary The port bound to the working directory — what the hook actually runs with.
 * @type {Object}
 */
export const defaultGit = createGit();

/**
 * @summary Collects unaccounted spec deletions across the pushed ranges.
 *
 * **The tree read fails CLOSED.** It was a `tryExec`, and that is the defect this revision repairs:
 * `git ls-tree -r` over this repository emits 1,327,472 bytes against a 1 MB default `maxBuffer`, so
 * it threw `ENOBUFS`, the catch returned `''`, and the surviving-subject scan graded every commit
 * against an EMPTY tree — in which nothing has ever survived. The guard reported zero rows and
 * exited green. A raised ceiling alone would not have been enough: any other read failure would
 * reproduce it, because the bug is not the size, it is that an unreadable tree and a clean one
 * returned the same value. So the read now throws and the caller refuses, on the same reasoning the
 * range read above already used.
 *
 * @param {String[]} ranges Rev-list ranges.
 * @param {Object} [git=defaultGit] Git port; injected by the spec to drive the consumed path.
 * @returns {{unaccounted: Array<{sha: String, subject: String, specs: String[]}>, survived: Array<{sha: String, subject: String, survivors: Array<{spec: String, subjects: String[]}>}>}}
 */
export function collectViolations(ranges, git = defaultGit) {
    const
        violations = [],
        survived   = [];

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
            shas = git.revList(range)
        } catch {
            throw new Error(
                `check-spec-retirement: cannot resolve the range \`${range}\`.\n` +
                'The guard refuses to pass on a range it could not read — in CI this usually means a\n' +
                'shallow checkout (needs `fetch-depth: 0`) or a missing `origin/dev` remote-tracking ref.'
            )
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
            const specs = git.deletedSpecs(sha);

            if (specs.length === 0) {
                return
            }

            const message = git.message(sha);

            if (!hasRetirementAccount(message)) {
                violations.push({sha, subject: git.subject(sha), specs});

                // One defect per commit. Demanding the surviving-subject detail from a commit that has
                // not written an account at all buries the primary instruction under a longer one.
                return
            }

            // Only reached when an account EXISTS, so the tree listing is paid for on the rare commit
            // that deletes specs and answers for them — not on every commit in the range.
            //
            // Fail CLOSED: an unreadable tree is not an empty one. See this function's header for the
            // ENOBUFS case that made the two indistinguishable.
            let treePaths;

            try {
                treePaths = git.treePaths(sha)
            } catch (error) {
                throw new Error(
                    `check-spec-retirement: cannot read the tree of ${sha.slice(0, 10)} ` +
                    `(${error.code || error.message}).\n` +
                    'The guard refuses to grade surviving subjects against a tree it could not read — an\n' +
                    'empty listing is indistinguishable from a repository in which nothing survived.'
                )
            }

            // Second `git show` for the same commit, and deliberately not hoisted: like the tree read
            // it is paid only on the rare commit that deletes specs AND answers for them, rather than
            // on every commit in the range.
            const survivors = unaccountedSurvivors(specs, treePaths, message, git.deletedPaths(sha));

            if (survivors.length > 0) {
                survived.push({sha, subject: git.subject(sha), survivors})
            }
        })
    });

    return {unaccounted: violations, survived}
}

/**
 * @summary Renders every report a collection produced, in report order.
 *
 * Both classes are reported in one run. Exiting on the first would hide the second behind a
 * fix-and-re-push cycle, and a guard discovered one row at a time is how a bulk deletion gets
 * accounted for one sentence at a time.
 *
 * Split out of `main` so that aggregation is reachable by a test: as an `if`/`if` pair inlined in the
 * entry point, an `if`→`else if` regression would have silenced the second class with nothing able to
 * observe it.
 *
 * @param {{unaccounted: Array<Object>, survived: Array<Object>}} collected Output of {@link collectViolations}.
 * @returns {String[]}
 */
export function buildReports({unaccounted = [], survived = []} = {}) {
    const reports = [];

    if (unaccounted.length > 0) {
        reports.push(formatFailure(unaccounted))
    }

    if (survived.length > 0) {
        reports.push(formatSurvivingSubjectFailure(survived))
    }

    return reports
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

    let collected;

    // Every refusal the collector raises — an unresolvable range, an unreadable tree — lands here and
    // exits non-zero. The guard never passes on a read it could not make.
    try {
        collected = collectViolations(pendingRanges(stdin))
    } catch (error) {
        console.error(error.message);
        process.exit(1);
        return
    }

    const reports = buildReports(collected);

    if (reports.length > 0) {
        console.error(reports.join('\n\n'));
        process.exit(1)
    }
}

// Import-safe: the spec imports the pure exports above without running the git scan.
if (process.argv[1] && process.argv[1].endsWith('check-spec-retirement.mjs')) {
    await main()
}
