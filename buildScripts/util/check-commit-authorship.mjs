import {execSync}             from 'node:child_process';
import {readFileSync}         from 'node:fs';
import {findUnknownCoAuthors, rosterEmailForLogin} from './agentCoAuthorEmails.mjs';
import path                   from 'node:path';
import process                from 'node:process';

/**
 * Pre-push authorship check. ticket-ref-ok: implementing tickets #15337 and #16143
 *
 * Refuses to push commits authored with the OPERATOR's identity from an agent checkout.
 *
 * **The empirical anchor.** A full agent shift produced 38 commits across 7 branches, every one
 * authored as the human operator, because the worktree's git config silently resolved to his global
 * identity. Nothing warned. `git log --oneline` — the view everyone actually reads — shows no author;
 * the commits succeeded; the PRs rendered normally. It took a peer reading the PR's commit metadata
 * to notice, hours in.
 *
 * **Why it must be mechanical rather than remembered.** GitHub's current squash flow rewrites the
 * `dev` commit author to the PR author, but the pushed branch and PR commit metadata remain false
 * until then. That corrupts provenance while review is happening, including the family-per-author
 * accounting that decides whether a cross-family approval is independent. Downstream repair is not
 * prevention. The repo already gates the adjacent case (`<noreply@*>` co-author footers)
 * mechanically for the same reason: an attribution rule that relies on noticing has already failed.
 *
 * **The rule.** In an agent-owned checkout, no pushed commit may carry the identity from the
 * operator's GLOBAL git config. Linked worktrees are agent-owned by topology (`git-dir` !==
 * `git-common-dir`). Independent clones have no distinct Git topology, so they use the same
 * `NEO_AGENT_IDENTITY` boot pin that `bootstrapWorktree` requires before binding clone-local Git
 * identity. The operator's own checkout has neither signal, where his identity is correct and this
 * check stays silent.
 *
 * Comparing against the global config rather than a hard-coded roster is deliberate: the leak IS the
 * global identity resolving through an unset local one, so that value is exactly the thing to detect.
 * A roster would need maintaining, and would miss any operator this repo is cloned by.
 *
 * Bypass: `git push --no-verify` — for an operator genuinely committing from a worktree.
 */

const
    ZERO_SHA = '0'.repeat(40),
    exec     = command => execSync(command, {encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore']}).trim(),
    tryExec  = command => { try { return exec(command) } catch { return '' } };

/**
 * @summary The commits this push will actually send, read from git's own ref tuples.
 *
 * git hands a pre-push hook `<localRef> <localSha> <remoteRef> <remoteSha>` per ref on stdin. Reading
 * it is the difference between guarding the push and guarding a guess about it: the first cut
 * hard-coded `origin/dev..HEAD`, so `git push origin agent/dirty:refs/heads/agent/dirty` was measured
 * against a clean HEAD and exited green while shipping an operator-authored commit on the sibling ref.
 * A bypass in a guard whose whole purpose is being un-bypassable.
 *
 * `remoteSha` is the exact boundary git will apply, so `remoteSha..localSha` is the true new-commit
 * set. A NEW remote branch reports the zero-sha, where the honest fallback is `origin/dev..localSha`:
 * everything the branch adds to the trunk. A DELETION reports a zero localSha and sends no commits.
 *
 * @param {String} stdin The raw hook payload.
 * @returns {String[]} Rev-list ranges to scan.
 * @private
 */
function pendingRanges(stdin) {
    const rows = stdin.split('\n').map(line => line.trim()).filter(Boolean);

    if (rows.length === 0) {
        // Invoked outside the hook (a manual run, or a git that sent nothing): fall back to the
        // branch's own range rather than silently scanning nothing. A guard that no-ops when it
        // cannot see its input is the same failure it exists to prevent.
        return ['origin/dev..HEAD']
    }

    return rows.map(row => {
        const [, localSha, , remoteSha] = row.split(/\s+/);

        if (!localSha || localSha === ZERO_SHA) {
            return null // a deletion sends no commits
        }

        return !remoteSha || remoteSha === ZERO_SHA ? `origin/dev..${localSha}` : `${remoteSha}..${localSha}`
    }).filter(Boolean)
}

/**
 * @summary Whether this working tree is a LINKED worktree rather than the main checkout.
 *
 * A linked worktree's git-dir is `<common>/worktrees/<name>`; the main checkout's git-dir IS the
 * common dir. Both are resolved to absolute paths first — `--git-dir` answers relatively in the main
 * checkout and absolutely in a worktree, so comparing the raw values reports every main checkout as
 * linked and fires this guard on the operator's own commits.
 *
 * @returns {Boolean}
 */
function isLinkedWorktree() {
    const gitDir    = tryExec('git rev-parse --absolute-git-dir'),
          commonDir = tryExec('git rev-parse --git-common-dir');

    if (!gitDir || !commonDir) {
        return false
    }

    return path.resolve(gitDir) !== path.resolve(commonDir)
}

/**
 * @summary Whether the current checkout is owned by an agent rather than the operator.
 *
 * Linked worktrees retain the original topology-owned behavior. An independent clone reports
 * `git-dir === git-common-dir`, so the bootstrap's existing `NEO_AGENT_IDENTITY` pin is the only
 * shared ownership authority available before a push. Presence is sufficient here: identity
 * validation and Git binding remain `bootstrapWorktree`'s job, while this guard only decides whether
 * the operator-global leak is valid authorship or must fail loud.
 *
 * Deliberate boundary: an independent clone without `NEO_AGENT_IDENTITY` is indistinguishable from
 * the operator's main checkout and therefore remains uncovered. Refusing it would also refuse the
 * operator's valid commits. `bootstrapWorktree` fails agent-owned clone provisioning without this
 * pin, so the guard shares that authority rather than inventing a second ownership resolver.
 *
 * @returns {Boolean}
 */
function isAgentCheckout() {
    return isLinkedWorktree() || Boolean(process.env.NEO_AGENT_IDENTITY?.trim())
}

/**
 * @summary The operator's global identity — the value that leaks when a worktree sets none.
 * @returns {String} Lower-cased email, or '' when no global identity is configured.
 */
function operatorEmail() {
    return tryExec('git config --global user.email').toLowerCase()
}

/**
 * @summary Commits across every pending range authored with the given email.
 * @param {String} email Lower-cased author email to match.
 * @param {String[]} ranges Rev-list ranges derived from the push's own ref tuples.
 * @returns {String[]} Deduped `"<sha> <subject>"` rows.
 */
function commitsAuthoredBy(email, ranges) {
    const seen = new Map();

    ranges.forEach(range => {
        const log = tryExec(`git log ${range} --format=%H%x09%ae%x09%s`);

        if (!log) {
            return
        }

        log.split('\n').map(line => line.split('\t')).forEach(([sha, authorEmail, subject]) => {
            // Deduped by sha: one commit reachable from two pushed refs is one offender, not two.
            if ((authorEmail || '').toLowerCase() === email && sha) {
                seen.set(sha, `  ${sha.slice(0, 10)}  ${subject}`)
            }
        })
    });

    return [...seen.values()]
}

const operator = operatorEmail();

// stdin is the hook's payload; readFileSync(0) is the only way to take it synchronously, and a
// missing/closed stdin must degrade to the branch range rather than to an empty scan. Read BEFORE
// the ownership gate below: the co-author check needs the same ranges and must not be gated by it.
let payload = '';

try {
    payload = readFileSync(0, 'utf8')
} catch {
    payload = ''
}

const ranges = pendingRanges(payload);

// Co-author trailer check: warn on a project-domain address that credits no known agent account.
// Deliberately runs BEFORE the ownership gate below — who owns the checkout has no bearing on
// whether an address exists, and that gate answers a different question (operator identity leak).
// Advisory in both directions: an unrecognized address warns, an unreadable map stays silent, and
// neither can block. See ./agentCoAuthorEmails.mjs for why the addresses are a map and not derived.
/**
 * @summary Whether these commits are being pushed on an agent lane, from a source the committer
 * cannot forge.
 *
 * **This exists because `%ae` is not an identity.** `git commit --author='X <off-domain>'` rewrites
 * the author on a single commit, and against an email-only classifier that one flag carried a
 * poisoned trailer straight to exit 0 — measured. So the classification cannot come from inside the
 * commit; it has to come from something the commit's author did not write.
 *
 * Two unforgeable sources, one per caller:
 *
 * - **Hook**: checkout ownership. A linked worktree or an `NEO_AGENT_IDENTITY` pin means an agent is
 *   pushing, whatever any individual commit claims about itself.
 * - **CI**: `--author-login`, which the workflow fills from the GitHub-authenticated PR author. A PR
 *   cannot forge who opened it.
 *
 * Neither is available to the other, which is why both exist rather than one.
 *
 * @returns {Boolean}
 */
function isAuthenticatedAgentLane() {
    const loginIndex = process.argv.indexOf('--author-login'),
        login        = loginIndex === -1 ? '' : (process.argv[loginIndex + 1] || '');

    return isAgentCheckout() || Boolean(rosterEmailForLogin(login))
}

const agentLane = isAuthenticatedAgentLane();

let unknownCoAuthors = [];

try {
    const commits = ranges.flatMap(range => {
        // \x1f between fields, \x1e between records: a commit body carries newlines and tabs, so
        // line-splitting the log would truncate the very trailer block this needs to read.
        const log = tryExec(`git log ${range} --format=%H%x1f%ae%x1f%s%x1f%B%x1e`);

        return log ? log.split('\x1e').map(entry => {
            const [sha, authorEmail, subject, body] = entry.replace(/^\n+/, '').split('\x1f');
            return sha ? {sha, authorEmail, subject, body} : null
        }).filter(Boolean) : []
    });

    unknownCoAuthors = findUnknownCoAuthors({agentLane, commits})
} catch {
    // Fail open on INPUT failure only: a missing registry, an unreadable map, or a malformed log
    // must never block a push. A trailer this successfully read and rejected is a different matter,
    // handled below — swallowing that was how 16 mis-credited commits shipped.
    unknownCoAuthors = []
}

// Agent-authored offenders BLOCK. Anything else stays advisory, because a non-agent commit's
// trailers are not this map's business and refusing them would wall off an outside contributor.
const
    creditsAPerson = unknownCoAuthors.filter(offender => offender.agentAuthored),
    advisoryOnly   = unknownCoAuthors.filter(offender => !offender.agentAuthored);

if (advisoryOnly.length > 0) {
    console.warn(`\x1b[33mWarning: ${advisoryOnly.length} Co-Authored-By trailer(s) credit an address that belongs to no known agent account.\x1b[0m`);
    advisoryOnly.forEach(({sha, subject, email}) => console.warn(`  ${sha.slice(0, 10)}  <${email}>  ${subject}`));
    console.warn('');
    console.warn('GitHub resolves trailers by email, so an unknown address credits nobody — the co-author');
    console.warn('is silently dropped from the contribution record with nothing failing.');
    console.warn('Look the address up in buildScripts/util/agentCoAuthorEmails.mjs, or add the seat there.');
    console.warn('This commit is not agent-authored, so this is advisory — the push proceeds.')
}

if (creditsAPerson.length > 0) {
    console.error(`\x1b[31mcheck-commit-authorship: ${creditsAPerson.length} Co-Authored-By trailer(s) on agent-authored commit(s) name an address no agent seat owns:\x1b[0m`);
    creditsAPerson.forEach(({sha, subject, email}) => console.error(`  ${sha.slice(0, 10)}  <${email}>  ${subject}`));
    console.error(`
GitHub resolves a co-author trailer by its EMAIL and credits whatever account owns that address.
The display name in the trailer is cosmetic. An address outside this project therefore credits a
REAL PERSON for work they did not do — which is why this blocks rather than warns, and why the
check is not limited to the project domain: off-domain is precisely where a person's account is.

Addresses cannot be derived from a handle or a display name. Three logins do not match their email
local part, so deriving is guaranteed wrong for them. Read the address from EMAIL_BY_LOGIN in
buildScripts/util/agentCoAuthorEmails.mjs, add the seat there, or omit the trailer entirely.

To repair the commits before pushing:

  git rebase origin/dev --exec 'git commit --amend --no-edit'   # drop the trailer in the editor

Bypass (an operator genuinely crediting an outside collaborator): git push --no-verify
`);
    process.exit(1)
}

// From here on: the operator-identity leak guard, which IS scoped to agent checkouts.
// No global identity, or the operator's own checkout: nothing that check can or should say.
if (!operator || !isAgentCheckout()) {
    process.exit(0)
}

const offenders = commitsAuthoredBy(operator, ranges);

if (offenders.length === 0) {
    process.exit(0)
}

const local = tryExec('git config user.email') || '(unset — resolving to the global identity)';

console.error(`\x1b[31mcheck-commit-authorship: ${offenders.length} commit(s) authored as the operator from an agent checkout:\x1b[0m`);
console.error(offenders.join('\n'));
console.error(`
This checkout's user.email is: ${local}
The operator's global identity is: ${operator}

Pushing these would publish false branch and PR commit provenance, including the author-family
record used to decide whether review is cross-family. GitHub's current squash flow can repair the
\`dev\` author from the PR author, but downstream repair does not make the review-time record true.

Set this checkout's identity to your own, then repair the existing commits:

  git config user.name  "<Your Name>"
  git config user.email "<you>@neomjs.com"
  git rebase origin/dev --exec 'git commit --amend --no-edit --reset-author'

Then verify BEFORE force-pushing — a rebase onto a newer dev moves the tree legitimately, so tree
equality is the WRONG check:

  git diff --name-only origin/dev...HEAD    # the same file set as before, and only your files
  git log origin/dev..HEAD --format=%an     # every commit is yours

Bypass (an operator genuinely committing from an agent checkout): git push --no-verify
`);

process.exit(1);
