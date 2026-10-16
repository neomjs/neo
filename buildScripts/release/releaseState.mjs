/**
 * @summary Reads how far a release got and decides each phase's next step, so a release that stopped at any push or
 * call continues without hand-run git.
 *
 * Reading goes through an injected command runner (`run(args) → {status, stdout, stderr}`), which keeps the module
 * free of I/O and lets tests script every command outcome. A read either succeeds, proves an absence the command
 * itself reports (a 404, an empty ref listing), or throws an `ObservationError`: an unknown never reads as absent.
 * Everything else here is a pure function of the observed state.
 * @module buildScripts/release/releaseState
 */

import semver from 'semver';

/**
 * @summary A required observation failed: its state is unknown, so no phase may act on it.
 */
export class ObservationError extends Error {}

/**
 * @summary Runs one read-only command.
 * @param {Function} run      `args => {status, stdout, stderr}`
 * @param {String[]} args     The command and its arguments.
 * @param {Function} [absent] Recognizes a failed exit that proves absence, e.g. an HTTP 404.
 * @returns {String|null} The trimmed stdout, or `null` for a proven absence.
 * @throws {ObservationError} When the command failed for any other reason.
 */
export function observe(run, args, absent) {
    const result = run(args);

    if (result.status === 0) return result.stdout.trim();
    if (absent?.(result))    return null;

    throw new ObservationError(`\`${args.join(' ')}\` failed (${result.status ?? 'no exit status'}): ${(result.stderr || '').trim().split('\n').pop() || 'no error output'}`)
}

const notFound = ({stderr}) => /HTTP 404/.test(stderr || ''),
      // `git rev-parse --verify --quiet` exits 1 without output when the ref does not exist
      missingRef = ({status, stderr}) => status === 1 && !(stderr || '').trim();

/**
 * @summary Reads the remote and local state of `version`'s release.
 * @param {Function} run `args => {status, stdout, stderr}`
 * @param {Object}   names
 * @param {String}   names.repo          `owner/name`
 * @param {String}   names.version       The version being released, which is also its tag.
 * @param {String}   names.releaseBranch `release/v<version>`
 * @returns {ReleaseState}
 * @throws {ObservationError} When any required read fails.
 */
export function readReleaseState(run, {repo, version, releaseBranch}) {
    const
        git     = (...args) => observe(run, ['git', ...args]),
        prs     = JSON.parse(observe(run, ['gh', 'pr', 'list', '--repo', repo, '--head', releaseBranch, '--base', 'dev', '--state', 'all', '--limit', '1', '--json', 'number,state,url,mergeCommit,headRefOid'])),
        pr      = prs[0] ? {number: prs[0].number, state: prs[0].state, url: prs[0].url, mergeCommit: prs[0].mergeCommit?.oid ?? null, headSha: prs[0].headRefOid} : null,
        release = observe(run, ['gh', 'api', `repos/${repo}/releases/tags/${version}`, '--jq', '.tag_name'], notFound),
        // An annotated tag lists its peeled commit as `^{}`; a lightweight tag lists only itself
        tagRefs = git('ls-remote', '--tags', 'origin', `refs/tags/${version}`, `refs/tags/${version}^{}`).split('\n').filter(Boolean).map(line => line.split('\t')),
        local   = observe(run, ['git', 'rev-parse', '--verify', '--quiet', `refs/heads/${releaseBranch}`], missingRef);

    return {
        headBranch     : git('rev-parse', '--abbrev-ref', 'HEAD'),
        pr,
        release,
        tagCommit      : (tagRefs.find(([, ref]) => ref.endsWith('^{}')) ?? tagRefs[0])?.[0] ?? null,
        remoteBranchSha: git('ls-remote', '--heads', 'origin', releaseBranch).split('\t')[0] || null,
        localBranchSha : local,
        localAhead     : local ? Number(git('rev-list', '--count', `origin/dev..${local}`)) : 0,
        mainTree       : git('rev-parse', 'origin/main^{tree}'),
        mergeTree      : pr?.mergeCommit ? git('rev-parse', `${pr.mergeCommit}^{tree}`) : null
    }
}

/**
 * @summary The `prepare` preflight: a release starts from a clean `dev` at `origin/dev` with its note and no tag.
 * @param {Function}     run   `args => {status, stdout, stderr}`
 * @param {ReleaseState} state
 * @param {Object}       facts
 * @param {Boolean}      facts.notePresent    The release note exists at its authored path.
 * @param {String}       facts.packageVersion `package.json`'s version, which the release commit raises to `version`
 * @param {String}       facts.releaseBranch  `release/v<version>`
 * @param {String}       facts.version
 * @returns {String[]} The failed checks; empty when the release can start.
 * @throws {ObservationError} When a check cannot be read.
 */
export function readPrepareBlockers(run, state, {notePresent, packageVersion, releaseBranch, version}) {
    const
        blockers = [],
        dirty    = observe(run, ['git', 'status', '--porcelain']);

    if (state.headBranch !== 'dev')                                                                         blockers.push(`on '${state.headBranch}', not 'dev'`);
    if (observe(run, ['git', 'rev-parse', 'HEAD']) !== observe(run, ['git', 'rev-parse', 'origin/dev'])) blockers.push('HEAD is not at origin/dev');
    if (dirty)                                                                                              blockers.push('the working tree is not clean');
    if (!semver.gt(version, packageVersion))                                                                blockers.push(`${version} is not newer than package.json's ${packageVersion}`);
    if (!notePresent)                                                                                       blockers.push(`.github/RELEASE_NOTES/v${version}.md is missing`);
    if (state.tagCommit)                                                                                    blockers.push(`tag ${version} already exists`);
    if (state.localBranchSha)                                                                               blockers.push(`a local ${releaseBranch} carries no release commit (a run stopped before committing): delete it and re-run`);

    return blockers
}

/**
 * @summary Reads the rules on a branch and whether the acting account may bypass each ruleset behind them.
 * @param {Function} run    `args => {status, stdout, stderr}`
 * @param {String}   repo   `owner/name`
 * @param {String}   branch
 * @returns {{types: String[], bypass: String[]}} Rule types, and one `current_user_can_bypass` value per ruleset.
 * @throws {ObservationError} When the rules or a ruleset cannot be read.
 */
export function readBranchRules(run, repo, branch) {
    const rules = JSON.parse(observe(run, ['gh', 'api', `repos/${repo}/rules/branches/${branch}`]));

    return {
        types : rules.map(rule => rule.type),
        bypass: [...new Set(rules.map(rule => rule.ruleset_id))].map(id => observe(run, ['gh', 'api', `repos/${repo}/rulesets/${id}`, '--jq', '.current_user_can_bypass']))
    }
}

/**
 * @typedef {Object} ReleaseState
 * @property {String}      headBranch      The checked-out branch.
 * @property {Object|null} pr              The newest release PR from `release/v<version>` to `dev`: `{number, state, url, mergeCommit, headSha}`.
 * @property {String|null} release         The GitHub release's tag name, `null` when there is no release.
 * @property {String|null} tagCommit       The commit the version tag points to, `null` when there is no tag.
 * @property {String|null} remoteBranchSha `release/v<version>` on origin.
 * @property {String|null} localBranchSha  The local `release/v<version>`: the prepared candidate.
 * @property {Number}      localAhead      Commits the local candidate carries beyond `origin/dev`.
 * @property {String}      mainTree        The tree of `origin/main`'s tip.
 * @property {String|null} mergeTree       The tree of the release PR's merge commit.
 */

/**
 * @summary The `prepare` phase's next step.
 *
 * - `released`: the version is out; nothing to do (`getBindingProblems` refuses a release this workflow did not produce).
 * - `merged`: the release PR is merged; `finish` takes over.
 * - `waiting`: the release PR is open; its required checks run and the operator merges it.
 * - `open-pr`: the branch is on origin without an open or merged PR.
 * - `push`: the release commit exists locally only.
 * - `build`: nothing exists yet.
 * @param {ReleaseState} state
 * @returns {'released'|'merged'|'waiting'|'open-pr'|'push'|'build'}
 */
export function getPrepareStep({release, pr, remoteBranchSha, localAhead}) {
    if (release)                return 'released';
    if (pr?.state === 'MERGED') return 'merged';
    if (pr?.state === 'OPEN')   return 'waiting';
    if (remoteBranchSha)        return 'open-pr';
    if (localAhead > 0)         return 'push';

    return 'build'
}

/**
 * @summary The `finish` phase's next step.
 *
 * - `released`: the version is out; nothing to do (`getBindingProblems` refuses a release this workflow did not produce).
 * - `not-merged`: there is no merged release PR to release from.
 * - `release`: `main` already holds the squash (a run stopped after its push); create the GitHub release.
 * - `squash`: squash the release PR's merge commit onto `main`, then create the GitHub release.
 * @param {ReleaseState} state
 * @returns {'released'|'not-merged'|'release'|'squash'}
 */
export function getFinishStep({release, pr, mainTree, mergeTree}) {
    if (release)                                   return 'released';
    if (pr?.state !== 'MERGED' || !pr.mergeCommit) return 'not-merged';
    if (mergeTree && mergeTree === mainTree)       return 'release';

    return 'squash'
}

/**
 * @summary Refusals that keep a resumed release bound to what was prepared and merged. A present ref is reused only
 * when it is the expected one, and a missing identity refuses rather than skipping the comparison. A GitHub
 * release counts as done only when its tag is the merged release PR's merge commit: a release published outside
 * this workflow, such as one from before it, is refused, never reported as finished.
 * @param {'prepare'|'finish'} phase
 * @param {ReleaseState}       state
 * @returns {String[]} Empty when the phase may act.
 */
export function getBindingProblems(phase, state) {
    const
        {pr, release, remoteBranchSha, localBranchSha, tagCommit} = state,
        problems                                                  = [];

    if (release && !pr?.mergeCommit) {
        problems.push('the GitHub release exists, but no merged release PR produced it: it was published outside this workflow: release a newer --version')
    } else if (release && !tagCommit) {
        problems.push('the GitHub release exists without its version tag')
    } else if (pr?.mergeCommit && tagCommit && tagCommit !== pr.mergeCommit) {
        problems.push(`the version tag points to ${tagCommit.slice(0, 10)}, not the release PR's merge commit ${pr.mergeCommit.slice(0, 10)}`)
    }

    if (phase === 'prepare') {
        const step = getPrepareStep(state);

        if ((step === 'open-pr' || step === 'waiting') && !localBranchSha) {
            problems.push(`${step === 'waiting' ? 'the release PR is open' : 'the release branch is on origin without an open or merged PR'}, and this checkout has no local candidate to bind it to`)
        } else if (step === 'open-pr' && remoteBranchSha !== localBranchSha) {
            problems.push(`the release branch on origin (${remoteBranchSha.slice(0, 10)}) is not the local candidate (${localBranchSha.slice(0, 10)})`)
        } else if (step === 'waiting' && pr.headSha !== localBranchSha) {
            problems.push(`the open release PR's head (${pr.headSha.slice(0, 10)}) is not the local candidate (${localBranchSha.slice(0, 10)})`)
        }
    }

    return problems
}

/**
 * @summary Checks a release PR body against the ticket it resolves: one standalone `Resolves #<ticket>`, and an AC
 * Evidence table with one row per acceptance criterion on that ticket (or the explicit no-AC line when it has none).
 * The anchor check runs separately, through the PR-body lint itself.
 * @param {String} body       The release PR body.
 * @param {Number} ticket     The ticket the release PR resolves.
 * @param {String} ticketBody That ticket's body, as read from GitHub.
 * @returns {String[]} Empty when the body is consistent with the ticket.
 */
export function getPrBodyProblems(body, ticket, ticketBody) {
    const
        problems = [],
        resolves = body.match(/^Resolves #\d+\s*$/gm) ?? [],
        criteria = (/^##\s+Acceptance Criteria\s*$([\s\S]*?)(?=^##\s|(?![\s\S]))/m.exec(ticketBody)?.[1] ?? '').match(/^\s*- \[[ xX]\] /gm)?.length ?? 0,
        rows     = body.match(/^\|\s*AC-\d+\s*\|/gm)?.length ?? 0;

    if (resolves.length !== 1 || resolves[0].trim() !== `Resolves #${ticket}`) {
        problems.push(`the body must resolve exactly #${ticket}, on a line of its own`)
    }

    if (criteria === 0 && !body.includes(`No structured ACs on #${ticket}`)) {
        problems.push(`#${ticket} has no acceptance criteria, so the AC Evidence section must say "No structured ACs on #${ticket}"`)
    } else if (criteria > 0 && rows !== criteria) {
        problems.push(`#${ticket} has ${criteria} acceptance criteria, and the AC Evidence table has ${rows} rows`)
    }

    return problems
}
