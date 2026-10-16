#!/usr/bin/env node

/**
 * @summary Releases the Engine in two phases joined by one human step: merging the release PR.
 *
 * The release takes the same path as every other change. Nothing is pushed to `dev` directly, so its ruleset
 * (required checks and CodeQL) judges the release commit like any other, and no account needs a bypass.
 *
 * 1. **`prepare --version <semver>`**: preflight (on `dev` at `origin/dev`, clean, the version newer than
 *    `package.json`'s, its note present, no tag yet), set the version, drop the released notes, stamp the note, run
 *    `prepare.mjs` and `build-all`, commit to `release/v<version>`, push it and open a PR to `dev`. The release commit
 *    is where the package version changes, so no cut needs a separate bump. The PR resolves a preparation leaf (`--ticket`) with a body written like any PR body
 *    (`--body-file`), checked against that ticket before anything is built; the cut's own record stays open until
 *    `finish`, npm and the Portal are verified. The operator merges the PR once its checks pass.
 * 2. **`finish`**: read the version from `origin/dev`, where the merged release PR put it, squash the release PR's
 *    merge commit onto `main` as one commit (`commit-tree`, so `main` keeps a
 *    linear history of releases), push it, and create the GitHub release on the merge commit with the atomic-commit
 *    line in its body. The release event runs `npm-publish.yml`.
 *
 * Each phase reads how far the release already got (`releaseState.mjs`) and continues from there, so a run that
 * stopped at any push resumes by running the same command again. A read that fails stops the phase: an unknown never
 * passes for an absence. A present ref is reused only when it is the one this release prepared or merged.
 * `--rehearse` reports the push gates (rules, bypass, permissions, the pre-push hook) and the phase's preflight, and
 * changes nothing.
 *
 * The release note is authored at `.github/RELEASE_NOTES/v<version>.md` and stamped with its GitHub Release
 * frontmatter in `prepare`. The engine keeps only the notes it has not released: the release commit drops the older
 * ones by version alone, reading nothing from the conversation corpus. Each reaches the site through two separate
 * steps: the content sync archives its GitHub Release into `neomjs/github-content-sync`, and Pages serves the corpus
 * commit its pin names. The Knowledge Base upload is Brain-side lifecycle work in the `neo-agent-brain` repository,
 * whose release runbook is the next step after `finish`. The boundary is deliberate: this script imports and spawns
 * nothing from the Brain, so the Engine can be released from an Engine-only checkout.
 *
 * @keywords Release Automation, Release PR, Git Plumbing, Resumable, Engine-Brain Boundary
 */

import {execSync, spawnSync} from 'child_process';
import {program}             from 'commander';
import fs                    from 'fs-extra';
import os                    from 'os';
import path                  from 'path';
import semver                from 'semver';
import {
    getReleaseNoteParts,
    stampReleaseNote
} from './releaseNoteFrontmatter.mjs';
import {
    getBindingProblems,
    getFinishStep,
    getPrBodyProblems,
    getPrepareStep,
    getVersionProblem,
    ObservationError,
    observe,
    readBranchRules,
    readPrepareBlockers,
    readReleaseState
} from './releaseState.mjs';

const
    root = path.resolve(),
    repo = 'neomjs/neo',
    // `main` takes only fast-forward squash pushes; these rule types would refuse them for an account without a bypass
    BLOCKING_MAIN_RULES = ['pull_request', 'required_signatures', 'required_status_checks', 'update'];

// The version this run releases, and what keys on it: the release branch, the tag and the note (see useVersion)
let newVersion, releaseBranch, releaseNotePath, notePathInRepo;

// --- Helper Functions ---

/**
 * @summary Fixes the version this run releases. `prepare` takes it from `--version`, because the release commit is
 * where the package version changes; `finish` reads it from `origin/dev`, where the merged release PR put it.
 * @param {'prepare'|'finish'} phase
 * @param {String} [version] The `--version` option.
 */
function useVersion(phase, version) {
    if (phase === 'prepare') {
        const problem = getVersionProblem(version);
        problem && fail(problem)
    } else {
        runCommand('git fetch origin dev', 'Failed to fetch origin');
        version = JSON.parse(read(['git', 'show', 'origin/dev:package.json'])).version
    }

    newVersion      = version;
    releaseBranch   = `release/v${newVersion}`;
    notePathInRepo  = `.github/RELEASE_NOTES/v${newVersion}.md`;
    releaseNotePath = path.join(root, notePathInRepo)
}

/**
 * @summary Removes every note older than the version being released from `.github/RELEASE_NOTES`, so the
 * release commit carries only the notes not yet released. The version comparison is the whole trigger: the
 * corpus copy is the content sync's and the Pages pin's to deliver, and this script never reads it.
 * @param {String} version The version being released.
 */
function dropReleasedNotes(version) {
    const dir = path.join(root, '.github/RELEASE_NOTES');

    for (const file of fs.readdirSync(dir)) {
        const noteVersion = /^v(.+)\.md$/.exec(file)?.[1];

        if (noteVersion && semver.valid(noteVersion) && semver.lt(noteVersion, version)) {
            fs.removeSync(path.join(dir, file))
        }
    }
}

function runCommand(command, errorMessage) {
    try {
        console.log(`> ${command}`);
        return execSync(command, {stdio: 'inherit', encoding: 'utf-8'})
    } catch (error) {
        console.error(`\n❌ Error: ${errorMessage}`);
        console.error(error.message);
        process.exit(1)
    }
}

/**
 * @summary Stops the release with a message; a phase re-run resumes from the state it left.
 * @param {String} message
 */
function fail(message) {
    console.error(`\n❌ Error: ${message}`);
    process.exit(1)
}

/**
 * @summary The command runner the state reader observes through: no shell, every outcome returned.
 * @param {String[]} args
 * @returns {{status: Number|null, stdout: String, stderr: String}}
 */
function run(args) {
    const result = spawnSync(args[0], args.slice(1), {encoding: 'utf-8'});

    return {status: result.status, stdout: result.stdout ?? '', stderr: result.stderr || result.error?.message || ''}
}

/**
 * @summary Reads one value for a real phase, stopping the release when the read fails.
 * @param {String[]} args
 * @param {Function} [absent] Recognizes a failed exit that proves absence.
 * @returns {String|null}
 */
function read(args, absent) {
    try {
        return observe(run, args, absent)
    } catch (error) {
        if (error instanceof ObservationError) fail(error.message);
        throw error
    }
}

/**
 * @summary Reads how far this version's release already got, stopping the phase when any read fails.
 * @returns {import('./releaseState.mjs').ReleaseState}
 */
function readState() {
    runCommand('git fetch origin dev main', 'Failed to fetch origin');

    try {
        return readReleaseState(run, {repo, version: newVersion, releaseBranch})
    } catch (error) {
        if (error instanceof ObservationError) fail(`Could not read the release state: ${error.message}`);
        throw error
    }
}

/**
 * @summary The `prepare` preflight for this checkout (see `readPrepareBlockers`).
 * @param {import('./releaseState.mjs').ReleaseState} state
 * @returns {String[]}
 * @throws {ObservationError} When a check cannot be read.
 */
function getPrepareBlockers(state) {
    return readPrepareBlockers(run, state, {
        notePresent   : fs.existsSync(releaseNotePath),
        packageVersion: fs.readJsonSync(path.join(root, 'package.json')).version,
        releaseBranch,
        version       : newVersion
    })
}

/**
 * @summary Checks the release PR body against the ticket it resolves, then runs the PR-body lint on it.
 * @param {Number} ticket   The preparation leaf the release PR resolves.
 * @param {String} bodyFile The release PR body.
 * @returns {String[]} Empty when the body may be used.
 * @throws {ObservationError} When the ticket cannot be read.
 */
function getBodyProblems(ticket, bodyFile) {
    if (!Number.isInteger(ticket))           return ['pass --ticket <number>: the open preparation leaf the release PR resolves'];
    if (!bodyFile || !fs.existsSync(bodyFile)) return ['pass --body-file <path>: the release PR body, written like any PR body'];

    const issue = JSON.parse(observe(run, ['gh', 'issue', 'view', String(ticket), '--repo', repo, '--json', 'state,body']));

    if (issue.state !== 'OPEN') return [`#${ticket} is ${issue.state}: the release PR resolves an open preparation leaf`];

    const problems = getPrBodyProblems(fs.readFileSync(bodyFile, 'utf-8'), ticket, issue.body);

    if (!problems.length) {
        const lint = run(['node', 'node_modules/neo-agent-skills/scripts/check-pr-body.mjs', '--body-file', bodyFile]);
        lint.status === 0 || problems.push(`the PR-body lint fails: ${(lint.stdout + lint.stderr).trim().split('\n').pop()}`)
    }

    return problems
}

// --- Phases ---

/**
 * @summary Builds the release commit on `release/v<version>` and opens its PR to `dev`, or reports where an
 * earlier run left the release.
 * @param {Number} ticket   The preparation leaf the release PR resolves.
 * @param {String} bodyFile The release PR body.
 */
function prepare(ticket, bodyFile) {
    const
        state   = readState(),
        step    = getPrepareStep(state),
        binding = getBindingProblems('prepare', state);

    binding.length && fail(`The release refs are not the prepared candidate:\n  - ${binding.join('\n  - ')}`);

    if (step === 'released') return console.log(`✅ v${newVersion} is already released.`);
    if (step === 'merged')   return console.log(`✅ ${state.pr.url} is merged. Next: node buildScripts/release/publish.mjs finish`);
    if (step === 'waiting')  return console.log(`⏳ ${state.pr.url} is open. Its required checks run there; merging it is the operator's step. Then run finish.`);

    // Everything the PR needs is checked before anything is built or pushed
    let problems;

    try {
        problems = getBodyProblems(ticket, bodyFile)
    } catch (error) {
        if (error instanceof ObservationError) fail(error.message);
        throw error
    }

    problems.length && fail(`The release PR body is not ready:\n  - ${problems.join('\n  - ')}`);

    if (step === 'build') {
        let blockers;

        try {
            blockers = getPrepareBlockers(state)
        } catch (error) {
            if (error instanceof ObservationError) fail(error.message);
            throw error
        }

        blockers.length && fail(`Preflight failed:\n  - ${blockers.join('\n  - ')}`);

        console.log(`📦 Preparing v${newVersion} on ${releaseBranch}...`);
        runCommand(`git switch -c ${releaseBranch}`, 'Failed to create the release branch');

        // `package.json` and its lock take the version here; `prepare.mjs` below carries it into the files that print it
        runCommand(`npm version ${newVersion} --no-git-tag-version`, 'Failed to set the release version');

        dropReleasedNotes(newVersion);

        // The release index dates a release by its note's frontmatter, so the note is stamped before prepare rebuilds it
        fs.writeFileSync(releaseNotePath, stampReleaseNote(fs.readFileSync(releaseNotePath, 'utf-8'), {publishedAt: new Date(), version: newVersion}));

        runCommand('node buildScripts/release/prepare.mjs', 'Failed to run prepare.mjs');
        runCommand('npm run build-all', 'Failed to run npm run build-all');

        // Release commits bypass the husky pre-commit battery (--no-verify): they are machine-generated artifact
        // commits over a broadly-staged tree, and developer-workflow hooks gate human-authored changes (which
        // already passed them at PR time). A latent whitespace hit in a prepare-touched doc killed the v13 cut here.
        runCommand('git add .', 'Failed to stage the release');
        runCommand(`git commit --no-verify -m "chore(release): v${newVersion} (#${ticket})"`, 'Failed to commit the release (nothing staged?)')
    }

    if (step === 'build' || step === 'push') {
        // The branch push keeps the pre-push guards: the branch carries one ordinary commit for them to judge
        runCommand(`git push -u origin ${releaseBranch}`, 'Failed to push the release branch');
    }

    runCommand(
        `gh pr create --repo ${repo} --base dev --head ${releaseBranch} --title "chore(release): v${newVersion} (#${ticket})" --body-file ${bodyFile}`,
        'Failed to open the release PR'
    );

    console.log(`\n✅ Release PR open. Once the operator merges it: node buildScripts/release/publish.mjs finish`)
}

/**
 * @summary Squashes the merged release onto `main` and creates the GitHub release on the merge commit, or reports
 * where an earlier run left it.
 */
function finish() {
    const
        state   = readState(),
        step    = getFinishStep(state),
        binding = getBindingProblems('finish', state);

    binding.length && fail(`The release refs are not the merged release:\n  - ${binding.join('\n  - ')}`);

    if (step === 'released')   return console.log(`✅ v${newVersion} is already released.`);
    if (step === 'not-merged') fail(`No merged release PR from ${releaseBranch}${state.pr ? ` (${state.pr.url} is ${state.pr.state})` : ''}. Run prepare, and merge its PR first.`);

    const mergeCommit = state.pr.mergeCommit;
    let   mainCommit  = read(['git', 'rev-parse', 'origin/main']);

    if (step === 'squash') {
        console.log(`🔀 Squashing ${mergeCommit.slice(0, 10)} (tree ${state.mergeTree.slice(0, 10)}) onto origin/main...`);
        mainCommit = read(['git', 'commit-tree', '-p', mainCommit, '-m', `v${newVersion}`, state.mergeTree]);

        // The squash push skips the developer pre-push guards on purpose (--no-verify). They judge individual
        // changes, and this commit flattens every change since the last release, each already reviewed and merged
        // through `dev`. `check-spec-retirement` alone fails it by construction: every spec deletion since the
        // last release lands in one commit named `v<version>`, which explains none of them.
        runCommand(`git push --no-verify origin ${mainCommit}:refs/heads/main`, 'Failed to push the squash to main');
        runCommand(`git update-ref refs/heads/main ${mainCommit}`, 'Failed to update the local main ref')
    }

    // The note as merged, frontmatter stripped; the atomic-commit line goes into the release body, so no second
    // `dev` commit is needed. The site's notes route reads the release body the content sync archives.
    const
        {body, title} = getReleaseNoteParts(read(['git', 'show', `${mergeCommit}:${notePathInRepo}`])),
        bodyPath      = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'neo-release-')), 'release-body.md');

    fs.writeFileSync(bodyPath, `${body}\n\nAll changes delivered in 1 atomic commit: [${mainCommit.slice(0, 7)}](https://github.com/${repo}/commit/${mainCommit})\n`);

    // An existing tag is already bound to the merge commit (getBindingProblems), so a run that stopped after the tag
    // existed creates the release on that same tag. The release event runs npm-publish.yml.
    runCommand(
        `gh release create ${newVersion} --repo ${repo} --target ${mergeCommit} --title "${title || `v${newVersion}`}" --notes-file ${bodyPath}`,
        'Failed to create the GitHub release'
    );

    console.log('\n✨ Engine release created. GitHub Actions publishes it to npm.');
    console.log('Next runbook step: the Brain-side content lifecycle (Knowledge Base upload) from the neo-agent-brain checkout.\n')
}

/**
 * @summary Reports the gates a real run of `phase` would meet, and changes nothing: the acting account and its
 * permission, the rules on `dev` and `main` with the account's bypass, the release refs and their binding, the
 * pre-push hook the branch push runs, and the phase's preflight. A gate whose read fails reports as unknown (❌).
 * @param {'prepare'|'finish'} phase
 * @param {Number} [ticket]
 * @param {String} [bodyFile]
 */
function rehearse(phase, ticket, bodyFile) {
    const
        rows   = [],
        report = (ok, gate, detail) => rows.push({ok, gate, detail}),
        gate   = (name, check) => {
            try {
                check()
            } catch (error) {
                if (!(error instanceof ObservationError)) throw error;
                report(false, name, `unknown: ${error.message}`)
            }
        };

    let login, state;

    runCommand('git fetch origin dev main', 'Failed to fetch origin');

    gate('gh account', () => {
        login = observe(run, ['gh', 'api', 'user', '--jq', '.login']);
        report(true, 'gh account', login)
    });

    gate('push permission', () => {
        const perms = JSON.parse(observe(run, ['gh', 'api', `repos/${repo}`, '--jq', '.permissions']));
        report(Boolean(perms.push), 'push permission', perms.admin ? 'admin' : perms.maintain ? 'maintain' : perms.push ? 'write' : 'none')
    });

    gate('dev rules', () => {
        const {types, bypass} = readBranchRules(run, repo, 'dev');
        report(true, 'dev rules', `${types.join(', ') || 'none'}; bypass: ${bypass.join(', ') || 'n/a'}. Not pushed to: the release reaches dev through its PR`)
    });

    gate('main rules', () => {
        const
            {types, bypass} = readBranchRules(run, repo, 'main'),
            blocking        = types.filter(type => BLOCKING_MAIN_RULES.includes(type));

        report(!blocking.length || bypass.every(value => value === 'always'), 'main rules', `${types.join(', ') || 'none'}${blocking.length ? `; would refuse the squash push: ${blocking.join(', ')}` : ''}`)
    });

    gate('release refs', () => {
        state = readReleaseState(run, {repo, version: newVersion, releaseBranch});

        const binding = getBindingProblems(phase, state);
        report(!binding.length, 'release refs', binding.join('; ') || `prepare: ${getPrepareStep(state)}, finish: ${getFinishStep(state)}`)
    });

    if (phase === 'prepare') {
        gate('pre-push hook', () => {
            const
                head = observe(run, ['git', 'rev-parse', 'HEAD']),
                hook = spawnSync('sh', ['.husky/pre-push'], {encoding: 'utf-8', input: `refs/heads/${releaseBranch} ${head} refs/heads/${releaseBranch} ${'0'.repeat(40)}\n`});

            report(hook.status === 0, 'pre-push hook', hook.status === 0 ? `passes for a push of HEAD to ${releaseBranch}` : 'fails: run sh .husky/pre-push to see why')
        });

        gate('release PR body', () => {
            const problems = getBodyProblems(ticket, bodyFile);
            report(!problems.length, 'release PR body', problems.join('; ') || `resolves #${ticket}, consistent with the ticket, lint passes`)
        });

        state && getPrepareStep(state) === 'build' && gate('preflight', () => {
            const blockers = getPrepareBlockers(state);
            report(!blockers.length, 'preflight', blockers.join('; ') || 'ready to build')
        })
    } else {
        state && report(getFinishStep(state) !== 'not-merged', 'preflight', `step: ${getFinishStep(state)}${state.pr ? ` (${state.pr.url}, ${state.pr.state})` : ''}`);
        report(true, 'pre-push hook', 'skipped by design for the squash push to main (see finish)')
    }

    console.log(`\nRehearsal of '${phase}' for v${newVersion}, as ${login ?? 'an unknown account'}:\n`);
    rows.forEach(({ok, gate: name, detail}) => console.log(`${ok ? '✅' : '❌'} ${name.padEnd(16)} ${detail}`));

    if (rows.some(row => !row.ok)) {
        process.exitCode = 1
    }
}

program
    .name('publish')
    .description('Releases the Engine: prepare opens the release PR, the operator merges it, finish squashes it onto main and creates the GitHub release.')
    .argument('<phase>', 'prepare | finish')
    .option('--version <semver>', 'the version this release sets (prepare); finish reads it from origin/dev')
    .option('--ticket <number>', 'the open preparation leaf the release PR resolves (prepare)', value => parseInt(value, 10))
    .option('--body-file <path>', 'the release PR body, checked against --ticket before anything is built (prepare)')
    .option('--rehearse', 'report the push gates and the preflight, and change nothing')
    .action((phase, {bodyFile, rehearse: dryRun, ticket, version}) => {
        ['prepare', 'finish'].includes(phase) || fail(`Unknown phase '${phase}': use prepare or finish.`);

        useVersion(phase, version);

        if (dryRun) {
            rehearse(phase, ticket, bodyFile)
        } else if (run(['gh', 'auth', 'status']).status !== 0) {
            fail('GitHub CLI (gh) is not authenticated. Run `gh auth login`.')
        } else if (phase === 'prepare') {
            prepare(ticket, bodyFile)
        } else {
            finish()
        }
    })
    .parse()
