#!/usr/bin/env node

/**
 * @summary Releases the Engine in two phases joined by one human step: merging the release PR.
 *
 * The release takes the same path as every other change. Nothing is pushed to `dev` directly, so its ruleset
 * (required checks and CodeQL) judges the release commit like any other, and no account needs a bypass.
 *
 * 1. **`prepare`**: preflight (on `dev` at `origin/dev`, clean, version bumped, note present, no tag yet), drop the
 *    released notes, stamp the note, run `prepare.mjs` and `build-all`, commit to `release/v<version>`, push it and
 *    open a PR to `dev` that resolves the cut ticket (`--ticket`). The operator merges it once its checks pass.
 * 2. **`finish`**: squash the release PR's merge commit onto `main` as one commit (`commit-tree`, so `main` keeps a
 *    linear history of releases), push it, and create the GitHub release on the merge commit with the atomic-commit
 *    line in its body. The release event runs `npm-publish.yml`.
 *
 * Each phase reads how far the release already got (`releaseState.mjs`) and continues from there, so a run that
 * stopped at any push resumes by running the same command again. `--rehearse` reports the push gates (rules,
 * bypass, permissions, the pre-push hook) and the phase's preflight, and changes nothing.
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

import {execSync} from 'child_process';
import {program}  from 'commander';
import fs         from 'fs-extra';
import os         from 'os';
import path       from 'path';
import semver     from 'semver';
import {
    getReleaseNoteParts,
    stampReleaseNote
} from './releaseNoteFrontmatter.mjs';
import {
    getFinishStep,
    getPrepareStep
} from './releaseState.mjs';

const
    root       = path.resolve(),
    newVersion = fs.readJsonSync(path.join(root, 'package.json')).version,
    // The release branch, the tag and the note all key on the version `package.json` was bumped to before the cut
    releaseBranch   = `release/v${newVersion}`,
    releaseNotePath = path.join(root, `.github/RELEASE_NOTES/v${newVersion}.md`),
    notePathInRepo  = `.github/RELEASE_NOTES/v${newVersion}.md`,
    // `main` takes only fast-forward squash pushes; these rule types would refuse them for an account without a bypass
    BLOCKING_MAIN_RULES = ['pull_request', 'required_signatures', 'required_status_checks', 'update'];

// --- Helper Functions ---

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
 * @summary Runs a read-only command and returns its trimmed output, or `null` when it fails.
 * @param {String} command
 * @param {String} [input] Written to the command's stdin.
 * @returns {String|null}
 */
function runCommandWithOutput(command, input) {
    try {
        return execSync(command, {encoding: 'utf-8', input, stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe']}).trim()
    } catch {
        return null
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
 * @summary Reads how far this version's release already got.
 * @returns {import('./releaseState.mjs').ReleaseState & {headBranch: String}}
 */
function readState() {
    runCommand('git fetch origin dev main', 'Failed to fetch origin');

    const
        headBranch = runCommandWithOutput('git rev-parse --abbrev-ref HEAD'),
        prs        = JSON.parse(runCommandWithOutput(
            `gh pr list --head ${releaseBranch} --base dev --state all --limit 1 --json number,state,url,mergeCommit`
        ) ?? '[]'),
        pr         = prs[0] ? {...prs[0], mergeCommit: prs[0].mergeCommit?.oid ?? null} : null,
        mainTree   = runCommandWithOutput('git rev-parse origin/main^{tree}');

    return {
        headBranch,
        pr,
        released       : runCommandWithOutput(`gh release view ${newVersion} --json tagName`) !== null,
        branchPushed   : Boolean(runCommandWithOutput(`git ls-remote --heads origin ${releaseBranch}`)),
        branchCommitted: headBranch === releaseBranch && Number(runCommandWithOutput(`git rev-list --count origin/dev..${releaseBranch}`)) > 0,
        mainHasTree    : Boolean(pr?.mergeCommit) && runCommandWithOutput(`git rev-parse ${pr.mergeCommit}^{tree}`) === mainTree
    }
}

/**
 * @summary The `prepare` preflight: a release starts from a clean `dev` at `origin/dev` with its note and no tag.
 * @returns {String[]} The failed checks; empty when the release can start.
 */
function getPrepareBlockers({headBranch}) {
    const blockers = [];

    if (headBranch === releaseBranch)                                                   blockers.push(`on ${releaseBranch} without a release commit: a run stopped before committing; switch back to dev, delete the branch, and re-run`);
    else if (headBranch !== 'dev')                                                      blockers.push(`on '${headBranch}', not 'dev'`);
    if (runCommandWithOutput('git rev-parse HEAD') !== runCommandWithOutput('git rev-parse origin/dev')) blockers.push('dev is not at origin/dev');
    if (runCommandWithOutput('git status --porcelain'))                                 blockers.push('the working tree is not clean');
    if (!fs.existsSync(releaseNotePath))                                                blockers.push(`${notePathInRepo} is missing`);
    if (runCommandWithOutput(`git ls-remote --tags origin refs/tags/${newVersion}`))    blockers.push(`tag ${newVersion} already exists: bump package.json first`);

    return blockers
}

/**
 * @summary Writes the release PR's body. It carries the anchors the PR-body check requires, because that check is
 * one of the `dev` ruleset's required contexts.
 * @param {Number} ticket The cut ticket the PR resolves.
 * @returns {String} The body file's path.
 */
function writePrBody(ticket) {
    const bodyPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'neo-release-')), 'pr-body.md');

    fs.writeFileSync(bodyPath, [
        `Resolves #${ticket}`,
        '',
        `Release v${newVersion}: the stamped note, the \`prepare.mjs\` outputs, and the released notes dropped. Merging this PR is the release's one human step. Then \`node buildScripts/release/publish.mjs finish\` squashes it onto \`main\` and creates the GitHub release, which runs \`npm-publish.yml\`.`,
        '',
        'Evidence: L1 (machine-generated release commit from `publish.mjs prepare`) → L1 required (no runtime change beyond the version stamp).',
        '',
        '## AC Evidence',
        `No structured ACs on #${ticket}`,
        '',
        '## Deltas from ticket',
        'None substantive.',
        '',
        '## Test Evidence',
        'All coverage runs in CI.',
        '',
        '## Post-Merge Validation',
        `- [ ] \`node buildScripts/release/publish.mjs finish\` squashes this merge onto \`main\` and creates release ${newVersion}.`,
        '',
        `Authored by \`publish.mjs prepare\`, run by ${runCommandWithOutput('git config user.name') ?? 'unknown'}.`
    ].join('\n'));

    return bodyPath
}

// --- Phases ---

/**
 * @summary Builds the release commit on `release/v<version>` and opens its PR to `dev`, or reports where an
 * earlier run left the release.
 * @param {Number} ticket The cut ticket the release PR resolves.
 */
function prepare(ticket) {
    const
        state = readState(),
        step  = getPrepareStep(state);

    if (step === 'released') return console.log(`✅ v${newVersion} is already released.`);
    if (step === 'merged')   return console.log(`✅ ${state.pr.url} is merged. Next: node buildScripts/release/publish.mjs finish`);
    if (step === 'waiting')  return console.log(`⏳ ${state.pr.url} is open. Its required checks run there; merging it is the operator's step. Then run finish.`);

    Number.isInteger(ticket) || fail('prepare needs --ticket <number>: the cut ticket the release PR resolves.');

    if (step === 'build') {
        const blockers = getPrepareBlockers(state);

        blockers.length && fail(`Preflight failed:\n  - ${blockers.join('\n  - ')}`);

        console.log(`📦 Preparing v${newVersion} on ${releaseBranch}...`);
        runCommand(`git switch -c ${releaseBranch}`, 'Failed to create the release branch');

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
        `gh pr create --base dev --head ${releaseBranch} --title "chore(release): v${newVersion} (#${ticket})" --body-file ${writePrBody(ticket)}`,
        'Failed to open the release PR'
    );

    console.log(`\n✅ Release PR open. Once the operator merges it: node buildScripts/release/publish.mjs finish`)
}

/**
 * @summary Squashes the merged release onto `main` and creates the GitHub release, or reports where an earlier
 * run left it.
 */
function finish() {
    const
        state = readState(),
        step  = getFinishStep(state);

    if (step === 'released')   return console.log(`✅ v${newVersion} is already released.`);
    if (step === 'not-merged') fail(`No merged release PR from ${releaseBranch}${state.pr ? ` (${state.pr.url} is ${state.pr.state})` : ''}. Run prepare, and merge its PR first.`);

    const
        mergeCommit = state.pr.mergeCommit,
        releaseTree = runCommandWithOutput(`git rev-parse ${mergeCommit}^{tree}`) ?? fail(`The merge commit ${mergeCommit} is not in this checkout: is it on origin/dev?`);

    let mainCommit = runCommandWithOutput('git rev-parse origin/main');

    if (step === 'squash') {
        console.log(`🔀 Squashing ${mergeCommit.slice(0, 10)} (tree ${releaseTree.slice(0, 10)}) onto origin/main...`);
        mainCommit = runCommandWithOutput(`git commit-tree -p ${mainCommit} -m "v${newVersion}" ${releaseTree}`);

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
        {body, title} = getReleaseNoteParts(runCommandWithOutput(`git show ${mergeCommit}:${notePathInRepo}`) ?? fail(`${notePathInRepo} is missing at ${mergeCommit}`)),
        bodyPath      = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'neo-release-')), 'release-body.md');

    fs.writeFileSync(bodyPath, `${body}\n\nAll changes delivered in 1 atomic commit: [${mainCommit.slice(0, 7)}](https://github.com/neomjs/neo/commit/${mainCommit})\n`);

    // The release event runs npm-publish.yml
    runCommand(
        `gh release create ${newVersion} --target ${mergeCommit} --title "${title || `v${newVersion}`}" --notes-file ${bodyPath}`,
        'Failed to create the GitHub release'
    );

    console.log('\n✨ Engine release created. GitHub Actions publishes it to npm.');
    console.log('Next runbook step: the Brain-side content lifecycle (Knowledge Base upload) from the neo-agent-brain checkout.\n')
}

/**
 * @summary Reports the gates a real run of `phase` would meet, and changes nothing: the acting account and its
 * permission, the rules on `dev` and `main` with the account's bypass, the pre-push hook the branch push runs, and
 * the phase's preflight.
 * @param {'prepare'|'finish'} phase
 * @param {Number} [ticket]
 */
function rehearse(phase, ticket) {
    const
        repo   = runCommandWithOutput('gh repo view --json nameWithOwner --jq .nameWithOwner') ?? 'neomjs/neo',
        rows   = [],
        report = (ok, gate, detail) => rows.push({ok, gate, detail}),
        state  = readState(),
        login  = runCommandWithOutput('gh api user --jq .login'),
        perms  = JSON.parse(runCommandWithOutput(`gh api repos/${repo} --jq .permissions`) ?? '{}'),
        rules  = branch => JSON.parse(runCommandWithOutput(`gh api repos/${repo}/rules/branches/${branch}`) ?? '[]'),
        bypass = ids => [...new Set(ids)].map(id => runCommandWithOutput(`gh api repos/${repo}/rulesets/${id} --jq .current_user_can_bypass`));

    report(Boolean(login), 'gh account', login ?? 'not authenticated: gh auth login');
    report(Boolean(perms.push), 'push permission', perms.admin ? 'admin' : perms.maintain ? 'maintain' : perms.push ? 'write' : 'none');

    const devRules = rules('dev');
    report(true, 'dev rules', `${devRules.map(rule => rule.type).join(', ') || 'none'}; bypass: ${bypass(devRules.map(rule => rule.ruleset_id)).join(', ') || 'n/a'}. Not pushed to: the release reaches dev through its PR`);

    const
        mainRules    = rules('main'),
        mainBypass   = bypass(mainRules.map(rule => rule.ruleset_id)),
        mainBlocking = mainRules.filter(rule => BLOCKING_MAIN_RULES.includes(rule.type)).map(rule => rule.type);
    report(!mainBlocking.length || mainBypass.every(value => value === 'always'), 'main rules', `${mainRules.map(rule => rule.type).join(', ') || 'none'}${mainBlocking.length ? `; would refuse the squash push: ${mainBlocking.join(', ')}` : ''}`);

    if (phase === 'prepare') {
        const
            head    = runCommandWithOutput('git rev-parse HEAD'),
            hook    = runCommandWithOutput('sh .husky/pre-push', `refs/heads/${releaseBranch} ${head} refs/heads/${releaseBranch} ${'0'.repeat(40)}\n`),
            blocked = getPrepareStep(state) === 'build' ? getPrepareBlockers(state) : [];

        report(hook !== null, 'pre-push hook', hook !== null ? `passes for a push of HEAD to ${releaseBranch}` : 'fails: run sh .husky/pre-push to see why');
        report(Number.isInteger(ticket), 'cut ticket', Number.isInteger(ticket) ? `#${ticket}` : 'pass --ticket <number>');
        report(!blocked.length, 'preflight', blocked.join('; ') || `step: ${getPrepareStep(state)}`)
    } else {
        const step = getFinishStep(state);
        report(step !== 'not-merged', 'preflight', `step: ${step}${state.pr ? ` (${state.pr.url}, ${state.pr.state})` : ''}`);
        report(true, 'pre-push hook', 'skipped by design for the squash push to main (see finish)')
    }

    console.log(`\nRehearsal of '${phase}' for v${newVersion}, as ${login ?? 'nobody'}:\n`);
    rows.forEach(({ok, gate, detail}) => console.log(`${ok ? '✅' : '❌'} ${gate.padEnd(16)} ${detail}`));

    if (rows.some(row => !row.ok)) {
        process.exitCode = 1
    }
}

program
    .name('publish')
    .description('Releases the Engine: prepare opens the release PR, the operator merges it, finish squashes it onto main and creates the GitHub release.')
    .argument('<phase>', 'prepare | finish')
    .option('--ticket <number>', 'the cut ticket the release PR resolves (prepare)', value => parseInt(value, 10))
    .option('--rehearse', 'report the push gates and the preflight, and change nothing')
    .action((phase, {rehearse: dryRun, ticket}) => {
        ['prepare', 'finish'].includes(phase) || fail(`Unknown phase '${phase}': use prepare or finish.`);

        if (dryRun) {
            rehearse(phase, ticket)
        } else if (runCommandWithOutput('gh auth status') === null) {
            fail('GitHub CLI (gh) is not authenticated. Run `gh auth login`.')
        } else if (phase === 'prepare') {
            prepare(ticket)
        } else {
            finish()
        }
    })
    .parse()
