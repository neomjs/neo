import {execSync}     from 'node:child_process';
import {readFileSync} from 'node:fs';
import path           from 'node:path';
import process        from 'node:process';

/**
 * Pre-push authorship check. ticket-ref-ok: implementing ticket #15337
 *
 * Refuses to push commits authored with the OPERATOR's identity from an agent worktree.
 *
 * **The empirical anchor.** A full agent shift produced 38 commits across 7 branches, every one
 * authored as the human operator, because the worktree's git config silently resolved to his global
 * identity. Nothing warned. `git log --oneline` — the view everyone actually reads — shows no author;
 * the commits succeeded; the PRs rendered normally. It took a peer reading the PR's commit metadata
 * to notice, hours in.
 *
 * **Why it must be mechanical rather than remembered.** Squash-merge PRESERVES the author, so those
 * PRs would have landed on `dev` permanently crediting the operator for code he did not write — a
 * provenance error in the one record that cannot be corrected without rewriting shared history. The
 * repo already gates the adjacent case (`<noreply@*>` co-author footers) mechanically for exactly
 * this reason: an attribution rule that relies on noticing has already failed once.
 *
 * **The rule.** In a LINKED worktree (`git-dir` !== `git-common-dir` — i.e. `.git/worktrees/<name>`,
 * which is how every agent worktree is created), no pushed commit may carry the identity from the
 * operator's GLOBAL git config. The operator's own checkout is the main working tree, where his
 * identity is correct and this check stays silent.
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

// No global identity, or the operator's own checkout: nothing this check can or should say.
if (!operator || !isLinkedWorktree()) {
    process.exit(0)
}

// stdin is the hook's payload; readFileSync(0) is the only way to take it synchronously, and a
// missing/closed stdin must degrade to the branch range rather than to an empty scan.
let payload = '';

try {
    payload = readFileSync(0, 'utf8')
} catch {
    payload = ''
}

const offenders = commitsAuthoredBy(operator, pendingRanges(payload));

if (offenders.length === 0) {
    process.exit(0)
}

const local = tryExec('git config user.email') || '(unset — resolving to the global identity)';

console.error(`\x1b[31mcheck-commit-authorship: ${offenders.length} commit(s) authored as the operator from an agent worktree:\x1b[0m`);
console.error(offenders.join('\n'));
console.error(`
This worktree's user.email is: ${local}
The operator's global identity is: ${operator}

Squash-merge preserves the author, so pushing these would credit the operator on \`dev\` for code
they did not write — in the one record that cannot be corrected afterwards without rewriting shared
history.

Set this worktree's identity to your own, then repair the existing commits:

  git config user.name  "<Your Name>"
  git config user.email "<you>@neomjs.com"
  git rebase origin/dev --exec 'git commit --amend --no-edit --reset-author'

Then verify BEFORE force-pushing — a rebase onto a newer dev moves the tree legitimately, so tree
equality is the WRONG check:

  git diff --name-only origin/dev...HEAD    # the same file set as before, and only your files
  git log origin/dev..HEAD --format=%an     # every commit is yours

Bypass (an operator genuinely committing from a worktree): git push --no-verify
`);

process.exit(1);
