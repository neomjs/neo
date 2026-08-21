#!/usr/bin/env node

/**
 * @summary Automates the Neo.mjs release process using a Local-First Strategy.
 *
 * This script orchestrates the entire release lifecycle, enforcing a strict "Squash to Main" workflow
 * to maintain a clean, linear, and atomic git history on the production branch. It bridges the gap
 * between local development artifacts and remote GitHub infrastructure.
 *
 * The workflow consists of 5 key stages, plus an explicit Brain-side handoff:
 * 1. **Pre-flight Checks**: Validates environment state (branch, auth, versioning).
 * 2. **Preparation**: Generates build artifacts and prepares the dev branch.
 * 3. **Atomic Squash**: Uses low-level git plumbing (`commit-tree`) to graft the dev state onto main
 *    as a single commit, avoiding merge conflicts and preserving history cleanliness.
 * 4. **Documentation**: Finalizes release notes with the production commit hash.
 * 5. **Distribution**: Triggers the GitHub Release (which cascades to npm).
 *
 * The content half of the release — Knowledge Base upload, the full GitHub sync that archives the
 * release's tickets and chunks the release note, and the archive commit — is Brain-side lifecycle
 * work and lives in `ai/scripts/lifecycle/postReleaseSync.mjs` (`npm run ai:post-release-sync`),
 * which this script names as the next runbook step when it finishes. The boundary is deliberate:
 * this script imports and spawns NOTHING under `ai/**`, so the engine can be released from a
 * checkout in which the agent OS does not exist — `check-engine-brain-boundary` enforces the
 * import half of that property.
 *
 * @keywords Release Automation, Git Plumbing, Local-First, CI/CD, Engine-Brain Boundary
 */

import {execSync}                      from 'child_process';
import fs                              from 'fs-extra';
import path                            from 'path';
import {findLogicalIdentityCollisions} from '../util/check-content-logical-identity.mjs';

const root = path.resolve();

// --- Helper Functions ---

/**
 * @summary Refuses a release commit that would make two archived artifacts claim one logical name.
 *
 * Every commit in this script uses `--no-verify`, deliberately: a latent whitespace hit in a
 * prepare-touched doc killed the v13 cut. So no git hook runs here, and the `lint-staged` copy of
 * this guard is blind to the release path — the assertion has to be in-process, like the one in
 * `SyncService.commitRebaseAndPushGeneratedContent`.
 *
 * This matters most at the archive commit, because that one runs inside a `catch` that deliberately
 * continues after `runFullSync()` throws. `runFullSync` throws precisely when its integrity verdict
 * measured the corpus as unclean — so "commit what we have" is, in exactly that case, a decision to
 * publish the state the verdict rejected. A collision there stalls Knowledge Base ingestion for the
 * whole corpus, not just the colliding artifacts, so it is the one failure a release must not carry
 * forward. Everything else the broad `git add .` picks up is still committed as before.
 *
 * @param {String} stage Human-readable commit site, for the failure message.
 * @returns {void}
 * @throws {Error} When any archived logical name is claimed by more than one artifact.
 */
function assertNoArchiveLogicalIdentityCollisions(stage) {
    const collisions = findLogicalIdentityCollisions({
        archiveRoot: path.join(root, 'resources/content/archive')
    });

    if (collisions.length > 0) {
        const detail = collisions
            .map(item => `${item.key} (${item.paths.length} copies)`)
            .join('; ');

        throw new Error(
            `Release aborted at "${stage}": ${collisions.length} archived logical name(s) claimed by ` +
            `more than one artifact — ${detail}. Embedding refuses this state, so releasing it stalls ` +
            `Knowledge Base ingestion for the entire corpus. Repair with ` +
            `PullRequestSyncer.repairDuplicateArtifacts (npm run ai:sync-github-workflow), then re-run.`
        );
    }
}

function runCommand(command, errorMessage) {
    try {
        console.log(`> ${command}`);
        return execSync(command, { stdio: 'inherit', encoding: 'utf-8' });
    } catch (error) {
        console.error(`\n❌ Error: ${errorMessage}`);
        console.error(error.message);
        process.exit(1);
    }
}

function runCommandWithOutput(command) {
    try {
        console.log(`> ${command}`);
        return execSync(command, { encoding: 'utf-8' }).trim();
    } catch (error) {
        // Return null on failure instead of exiting, to handle checks
        return null;
    }
}

function getPackageVersion() {
    const packageJson = fs.readJsonSync(path.join(root, 'package.json'));
    return packageJson.version;
}

function getCurrentBranch() {
    return runCommandWithOutput('git rev-parse --abbrev-ref HEAD');
}

async function main() {
    console.log('\n🚀 Starting Neo.mjs Release Workflow...\n');

    // --- 1. Pre-flight Checks ---

    // Check Branch
    const currentBranch = getCurrentBranch();
    if (currentBranch !== 'dev') {
        console.error(`❌ Error: You must be on the 'dev' branch to start a release. Current: ${currentBranch}`);
        process.exit(1);
    }

    // Check GH Auth
    const ghAuthStatus = runCommandWithOutput('gh auth status');
    if (ghAuthStatus === null) {
        console.error('❌ Error: GitHub CLI (gh) is not authenticated. Run `gh auth login`.');
        process.exit(1);
    }

    // Verify Release Notes
    // The user is expected to have manually bumped the version in package.json before running this script.
    const newVersion      = getPackageVersion();
    const releaseNotePath = path.join(root, `resources/content/release-notes/v${newVersion}.md`);

    if (!fs.existsSync(releaseNotePath)) {
        console.error(`❌ Error: Release note file not found: ${releaseNotePath}`);
        console.error(`Please create 'resources/content/release-notes/v${newVersion}.md' before proceeding.`);
        process.exit(1);
    }

    console.log(`✅ Pre-flight checks passed. Releasing v${newVersion} from dev.\n`);


    // --- 2. Prepare (Dev) ---

    console.log('📦 Step 2: Preparing Release Artifacts...');

    // Run prepare script
    runCommand('node buildScripts/release/prepare.mjs', 'Failed to run prepareRelease.mjs');

    // Run build-all
    console.log('🏗️  Running build-all...');
    runCommand('npm run build-all', 'Failed to run npm run build-all');

    // Stage and Commit on Dev
    // Release-pipeline commits bypass the husky pre-commit battery (--no-verify): these are
    // machine-generated artifact commits over a broadly-staged tree, and developer-workflow
    // hooks gate human-authored changes (which already passed them at PR time). A latent
    // whitespace hit in a prepare-touched doc killed the v13 cut at this exact line.
    console.log('💾 Committing changes to dev...');
    assertNoArchiveLogicalIdentityCollisions('commit changes to dev');
    runCommand('git add .', 'Failed to stage changes');
    try {
        runCommand(`git commit --no-verify -m "Release v${newVersion}"`, 'Failed to commit to dev');
    } catch (e) {
        // Ignore if nothing to commit (unlikely)
        console.log('No changes to commit (maybe only untracked files were added?). Continuing...');
    }

    runCommand('git push origin dev', 'Failed to push to dev');


    // --- 3. Squash to Main (Plumbing Strategy) ---

    console.log('\n🔀 Step 3: Squashing to Main (Plumbing)...');

    // Fetch latest main to get the correct parent
    runCommand('git fetch origin main', 'Failed to fetch origin main');

    // Get the tree hash of the current dev state
    const devTreeHash = runCommandWithOutput('git rev-parse HEAD^{tree}');
    console.log(`🌲 Dev Tree Hash: ${devTreeHash}`);

    // Get the parent hash (latest origin/main)
    const mainParentHash = runCommandWithOutput('git rev-parse origin/main');
    console.log(`👨‍👦 Parent Hash (origin/main): ${mainParentHash}`);

    // Create the commit object manually
    // This creates a commit with dev's content but main's history
    const newCommitHash = runCommandWithOutput(
        `git commit-tree -p ${mainParentHash} -m "v${newVersion}" ${devTreeHash}`
    );
    console.log(`✨ New Commit Hash: ${newCommitHash}`);

    // Update local main branch pointer to this new commit
    runCommand(`git update-ref refs/heads/main ${newCommitHash}`, 'Failed to update local main ref');

    // Push to origin
    console.log('🚀 Pushing squash commit to main...');
    runCommand(`git push origin ${newCommitHash}:refs/heads/main`, 'Failed to push to main');

    const mainCommitHash = newCommitHash;
    console.log(`📌 Main Commit Hash: ${mainCommitHash}`);


    // --- 4. Finalize Notes (Dev) ---

    console.log('\n📝 Step 4: Finalizing Release Notes on Dev...');

    runCommand('git checkout dev', 'Failed to checkout dev');

    const noteContent = fs.readFileSync(releaseNotePath, 'utf-8');
    const atomicLog   = `\n\nAll changes delivered in 1 atomic commit: [${mainCommitHash.substring(0, 7)}](https://github.com/neomjs/neo/commit/${mainCommitHash})`;

    if (!noteContent.includes('All changes delivered in 1 atomic commit:')) {
        fs.appendFileSync(releaseNotePath, atomicLog);
        console.log('Added atomic changelog link to release notes.');

        runCommand(`git add ${releaseNotePath}`, 'Failed to stage release note');
        runCommand(`git commit --no-verify -m "docs: Add atomic changelog hash to release notes"`, 'Failed to commit release note update');
        runCommand('git push origin dev', 'Failed to push dev');
    } else {
        console.log('Atomic changelog link already present.');
    }


    // --- 5. Release (GitHub) ---

    console.log('\n🚀 Step 5: Creating GitHub Release...');

    // Parse release notes to extract title and body (removing frontmatter)
    let   releaseTitle    = `v${newVersion}`;
    let   releaseBodyPath = releaseNotePath;
    const tempBodyPath    = path.join(root, 'temp_release_body.md');
    let   tempFileCreated = false;

    try {
        let noteContent = fs.readFileSync(releaseNotePath, 'utf-8');

        // 1. Remove Frontmatter
        noteContent = noteContent.replace(/^---[\s\S]+?---\s*/, '');

        // 2. Extract Title (first H1)
        const titleMatch = noteContent.match(/^#\s+(.+)$/m);
        if (titleMatch) {
            releaseTitle = titleMatch[1].trim();
            // 3. Remove Title from body
            noteContent = noteContent.replace(/^#\s+.+$/m, '').trim();
        }

        // Write cleaned body to temp file
        fs.writeFileSync(tempBodyPath, noteContent);
        releaseBodyPath = tempBodyPath;
        tempFileCreated = true;

    } catch (e) {
        console.warn('⚠️  Failed to parse release notes content. Using raw file.', e.message);
    }

    // This triggers the npm-publish workflow
    const ghCommand = `gh release create ${newVersion} --target dev --title "${releaseTitle}" --notes-file ${releaseBodyPath}`;
    runCommand(ghCommand, 'Failed to create GitHub release');

    if (tempFileCreated) {
        fs.removeSync(tempBodyPath);
    }

    console.log('✅ Release created! GitHub Actions will now publish to npm.');

    // The release note is now the GitHub release body. The Brain-side post-release sync
    // re-materializes it under resources/content/release-notes/chunk-N/ (with frontmatter) via the
    // ordinal-100 bucketing. Remove the top-level staging copy here so it does not linger as a
    // duplicate of the chunked record — the post-release sync's broad `git add .` stages this
    // removal alongside the archive moves it produces.
    if (fs.existsSync(releaseNotePath)) {
        fs.removeSync(releaseNotePath);
        console.log(`🧹 Removed top-level staging release note: ${path.relative(root, releaseNotePath)}`);
    }

    console.log('\n✨ Engine Release Complete! ✨');
    console.log('\nNext runbook step — the Brain-side content lifecycle (Knowledge Base upload,');
    console.log('ticket archive sync, archive commit) runs from the agent OS:');
    console.log(`\n    npm run ai:post-release-sync\n`);
}

main().catch(error => {
    console.error('\n❌ Unhandled Error:', error);
    process.exit(1);
});
