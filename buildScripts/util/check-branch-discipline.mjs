import { execFileSync, execSync }                       from 'node:child_process';
import process                                          from 'node:process';
import path                                             from 'node:path';
import { fileURLToPath }                                from 'node:url';
import {assessDevReferenceAuthority, detectStaleBranch} from './branchFreshness.mjs';
import {assessMergedPullRequestPush}                    from './mergedPullRequestPush.mjs';

/**
 * Pre-push branch-discipline check (#11133). ticket-ref-ok: implementing ticket
 *
 * Catches the 2026-05-10 empirical 5-PR pattern where feature branches accumulated
 * `chore(data): ...` sync-pipeline commits. PR diffs then showed hundreds of files /
 * thousands of LOC where actual feature was 10-100 LOC, producing review-surface
 * signal-to-noise asymmetry + squash-merge git-history pollution.
 *
 * **Runtime scope:** this is Neo's repository-local maintainer hook, installed by this
 * checkout through `.husky/pre-push`. Its fixed `dev` coordinate is Neo's integration-line
 * policy. It is not an Agent OS orchestrator task and is not invoked by cloud tenant-repo
 * mirrors, which select their own configured ref (defaulting to the remote `HEAD`).
 *
 * **What this hook checks** (on every `git push`):
 *
 * **Chore-sync commits on feature branches.** If `git log origin/dev..HEAD` contains
 * commits whose subject matches `^chore\(data\):.*(sync|pipeline)` (case-insensitive),
 * block push with remediation guidance. Designated sync branches (`chore/sync-*` /
 * `agent/sync-*`) are exempt. Bypass: `git push --no-verify`.
 *
 * **Branch freshness (advisory).** Warns on the revert-trap when the two-dot diff carries
 * files that are not this branch's changes. Predicate: `branchFreshness.detectStaleBranch`.
 *
 * **Pushes that reach no pull request (advisory).** Warns when the branch's most
 * recent pull request has already merged and the local head carries commits that pull request
 * never contained. Such a push succeeds — the ref advances — while no pull request adopts the
 * commit and no CI runs on it, so every check the author performs reports success. Resolving
 * the pull-request state needs the network, so this check fails toward pushing at every
 * unresolvable step. Predicate: `mergedPullRequestPush.assessMergedPullRequestPush`.
 *
 * **NOT implemented in this initial cut** (per ticket Out of Scope; deferred as
 * follow-ups if the simpler regex doesn't converge the empirical pattern):
 * - Peer-author detection (stale-peer-branch ancestry). The 2026-05-10 anchor was
 *   dominantly chore-sync; peer-author is a less-frequent sub-pattern.
 * - `[skip ci]` heuristic / sync-data path indicators. `CHORE_SYNC_RE` covers the
 *   pipeline-generated commit subject directly; broader heuristics would risk
 *   false-positives on legitimate `[skip ci]` developer commits.
 *
 * **Anchor branches** (always exempt — substrate-correct sync paths):
 *   - `chore/sync-*` — bot-created sync branches
 *   - `agent/sync-*` — manual sync branches
 *   - `main`, `dev` — never run pre-push from these (caught by `pull-request-workflow.md §2.3`
 *     universal safety net)
 *
 * **Empirical anchor:** a 2026-05-10 burst of 5 chore-sync PRs in <90 minutes despite the
 * existing `feedback_branch_from_origin_dev_explicitly` discipline. Discipline-only
 * enforcement failed empirically; mechanical gate is load-bearing.
 *
 * @see #11133 — the ticket this script implements (ticket-ref-ok: implementing ticket)
 * @see buildScripts/util/branchFreshness.mjs — the branch-freshness / revert-trap predicate,
 *      the sister pre-push pattern wired into the check below
 * @see buildScripts/util/check-chore-sync.mjs — pre-commit sibling that enforces the
 *      generated-content path list at commit time (complementary surface)
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const scriptRoot = path.resolve(__dirname, '../..');

let gitRoot;
try {
    gitRoot = execSync('git rev-parse --show-toplevel', { cwd: scriptRoot, encoding: 'utf-8' }).trim();
} catch (e) {
    console.error('\x1b[31mError: Could not determine git repository root.\x1b[0m');
    process.exit(1);
}

const normalizedGitRoot    = path.resolve(gitRoot);
const normalizedScriptRoot = path.resolve(scriptRoot);

if (normalizedScriptRoot !== normalizedGitRoot) {
    console.error(`\x1b[31mError: Script repository root mismatch.\x1b[0m`);
    console.error(`check-branch-discipline.mjs is located under '${normalizedScriptRoot}', but the git repository root is '${normalizedGitRoot}'.`);
    process.exit(1);
}

let branch;
try {
    branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: gitRoot, encoding: 'utf-8' }).trim();
} catch (e) {
    console.error('Error getting git branch');
    process.exit(1);
}

// Designated sync branches — bypass discipline (these ARE the sync paths).
const SYNC_BRANCH_PREFIXES = ['chore/sync-', 'agent/sync-'];
if (SYNC_BRANCH_PREFIXES.some(prefix => branch.startsWith(prefix))) {
    process.exit(0);
}

// Protected branches — never push from these; the existing §2.2 safety net catches.
if (branch === 'main' || branch === 'dev') {
    process.exit(0);
}

// Ensure we have an authoritative view of origin/dev for every range below. A failed fetch may
// leave the remote-tracking ref stale even while the push remote remains reachable. In that case,
// ls-remote is the non-mutating authority check: equality proves the local object is current;
// anything else must block before this hook makes ancestry or diff claims. The explicit destination
// also makes a successful fetch update origin/dev even when remote.origin.fetch is nonstandard.
let fetchSucceeded = true;

try {
    execFileSync('git', [
        'fetch',
        '--quiet',
        'origin',
        '+refs/heads/dev:refs/remotes/origin/dev'
    ], {
        cwd     : gitRoot,
        encoding: 'utf-8',
        stdio   : 'pipe'
    })
} catch (e) {
    fetchSucceeded = false
}

let localDevSha  = null;
let remoteDevSha = null;

if (!fetchSucceeded) {
    const readGit = (args) => {
        try {
            return execFileSync('git', args, {
                cwd     : gitRoot,
                encoding: 'utf-8',
                stdio   : 'pipe'
            }).trim()
        } catch (e) {
            return null
        }
    };

    const remoteOutput = readGit(['ls-remote', '--exit-code', 'origin', 'refs/heads/dev']);

    localDevSha  = readGit(['rev-parse', '--verify', 'refs/remotes/origin/dev^{commit}']);
    remoteDevSha = remoteOutput?.split(/\s+/)[0] || null
}

const authority = assessDevReferenceAuthority({
    fetchSucceeded,
    localSha : localDevSha,
    remoteSha: remoteDevSha
});

if (!authority.usable) {
    console.error('\x1b[31mError: Could not establish an authoritative origin/dev for the pre-push checks.\x1b[0m');

    if (authority.status === 'stale-local') {
        console.error(`Local origin/dev:  ${localDevSha}`);
        console.error(`Remote dev:        ${remoteDevSha}`);
        console.error('The local ref is stale, so ancestry and branch-freshness results would be invalid.')
    } else if (authority.status === 'local-unavailable') {
        console.error('No full local refs/remotes/origin/dev commit ID is available.')
    } else if (authority.status === 'remote-malformed') {
        console.error(`Remote dev returned a malformed object ID: ${remoteDevSha}`)
    } else {
        console.error('The remote refs/heads/dev coordinate is unavailable.')
    }

    console.error('Run `git fetch origin dev` in a Git-authorized shell, rebase if needed, then retry the push.');
    process.exit(1)
}

if (authority.status === 'verified-local') {
    console.warn(
        `\x1b[33mWarning: git fetch origin dev could not update local metadata; ` +
        `verified local origin/dev matches remote dev at ${localDevSha}. Continuing.\x1b[0m`
    )
}

// Collect commits between origin/dev and HEAD.
let commitLines = [];
try {
    const range  = 'origin/dev..HEAD';
    const output = execSync(`git log ${range} --format=%H%x09%an%x09%s`, { cwd: gitRoot, encoding: 'utf-8' }).trim();
    if (output) {
        commitLines = output.split('\n');
    }
} catch (e) {
    console.error('\x1b[31mError: Could not inspect the authoritative origin/dev range.\x1b[0m');
    process.exit(1);
}

if (commitLines.length === 0) {
    process.exit(0);
}

// Detect chore-sync commits. The pipeline emits `chore(data): Hourly data sync pipeline update [skip ci]`
// and similar patterns; the discriminator is the `chore(data):` type-scope combined with sync-related subject.
const CHORE_SYNC_RE = /^chore\(data\):.*(sync|pipeline)/i;

const choreSyncCommits = [];
for (const line of commitLines) {
    const [sha, _author, ...subjectParts] = line.split('\t');
    const subject                         = subjectParts.join('\t');
    if (CHORE_SYNC_RE.test(subject)) {
        choreSyncCommits.push({ sha: sha.slice(0, 9), subject });
    }
}

if (choreSyncCommits.length > 0) {
    console.error(`\x1b[31mError: Branch '${branch}' contains chore-sync commit(s) that do not belong on a feature branch.\x1b[0m`);
    console.error(`These commits were produced by the GitHub-content sync pipeline and should only live on \`chore/sync-*\` or \`agent/sync-*\` branches.`);
    console.error('');
    console.error('Offending commits:');
    choreSyncCommits.forEach(c => console.error(`  ${c.sha}  ${c.subject}`));
    console.error('');
    console.error('Remediation (clean-path):');
    console.error('  git checkout -b agent/<ticket-id>-v2 origin/dev');
    console.error('  git cherry-pick <feature-commits>          # only your feature SHAs');
    console.error('  git push -u origin agent/<ticket-id>-v2    # opens a fresh PR');
    console.error('');
    console.error('Operator-explicit-authorized cleanup path (per pull-request-workflow.md §9):');
    console.error('  git rebase -i origin/dev                   # drop the chore-sync commits');
    console.error('  git push --force-with-lease');
    console.error('');
    console.error('Bypass (NOT recommended; surfaces in PR diff signal-to-noise asymmetry):');
    console.error('  git push --no-verify');
    process.exit(1);
}

// Branch-freshness check: warn on the revert-trap — when this branch has fallen behind
// origin/dev such that its two-dot diff (origin/dev..HEAD) carries files that are NOT its
// actual changes (the three-dot origin/dev...HEAD), a PR from it shows a misleading diff and
// risks reverting merged peer work. Advisory (warn, exit 0). Predicate: ./branchFreshness.mjs.
const countDiffFiles = (range) => {
    try {
        const out = execSync(`git diff ${range} --name-only`, { cwd: gitRoot, encoding: 'utf-8' }).trim();
        return out ? out.split('\n').length : 0;
    } catch (e) {
        return 0;
    }
};

const freshness = detectStaleBranch({
    twoDotFiles  : countDiffFiles('origin/dev..HEAD'),
    threeDotFiles: countDiffFiles('origin/dev...HEAD')
});

if (freshness.stale) {
    console.warn(`\x1b[33mWarning: Branch '${branch}' looks stale against origin/dev — ${freshness.extraFiles} files in the two-dot diff are not your changes (origin/dev has advanced).\x1b[0m`);
    console.warn('A PR from this branch may show a misleading diff or revert merged peer work (the revert-trap).');
    console.warn('Recommended: git rebase origin/dev   (or cherry-pick your commits onto a fresh branch off origin/dev)');
    console.warn('This is advisory — the push proceeds.');
}

// Merged-pull-request check: warn when this push carries commits no pull request will adopt —
// the branch's latest PR already merged, so the ref advances while nothing listens and no CI
// runs. Advisory (warn, exit 0). Predicate: ./mergedPullRequestPush.mjs.
//
// Every resolution step below yields null on failure so the predicate stays silent: this needs
// the network, and an author who is offline, unauthenticated, or rate-limited must still push.
const readGitStatus = (args) => {
    try {
        execFileSync('git', args, {cwd: gitRoot, encoding: 'utf-8', stdio: 'pipe'});
        return 0
    } catch (e) {
        // Exit 1 is a real "no"; anything else (128 = missing object, spawn failure) is "unknown".
        return e?.status === 1 ? 1 : null
    }
};

const headSha = (() => {
    try {
        return execFileSync('git', ['rev-parse', 'HEAD'], {cwd: gitRoot, encoding: 'utf-8', stdio: 'pipe'}).trim()
    } catch (e) {
        return null
    }
})();

const latestPullRequest = (() => {
    try {
        const output = execFileSync('gh', [
            'pr', 'list',
            '--head'  , branch,
            '--state' , 'all',
            '--limit' , '1',
            '--json'  , 'number,state,mergedAt,headRefOid'
        ], {cwd: gitRoot, encoding: 'utf-8', stdio: 'pipe', timeout: 10000});

        const parsed = JSON.parse(output);
        return Array.isArray(parsed) && parsed.length > 0 ? parsed[0] : null
    } catch (e) {
        return null
    }
})();

const containmentStatus   = headSha ? readGitStatus(['merge-base', '--is-ancestor', headSha, 'origin/dev']) : null;
const headContainedInBase = containmentStatus === null ? null : containmentStatus === 0;

const unreached = assessMergedPullRequestPush({pullRequest: latestPullRequest, headSha, headContainedInBase});

if (unreached.warn) {
    console.warn(`\x1b[33mWarning: PR #${latestPullRequest.number} for branch '${branch}' merged at ${latestPullRequest.mergedAt}.\x1b[0m`);
    console.warn(`A merged pull request accepts no further commits, so ${headSha.slice(0, 9)} reaches no PR and no CI — the ref advances and nothing listens.`);
    console.warn(`Your work is not lost: it is on '${branch}', it is simply in no pull request.`);
    console.warn('Remediation: open a follow-up ticket, then carry the commits onto a fresh branch.');
    console.warn('  git log --oneline origin/dev..HEAD    # inspect first — there may be more than one');
    console.warn('  git checkout -b <agent>/<ticket-id>-<slug> origin/dev');
    console.warn('  git cherry-pick <each commit the merged PR did not carry>');
    console.warn('This is advisory — the push proceeds.');
}

// All checks passed.
process.exit(0);
