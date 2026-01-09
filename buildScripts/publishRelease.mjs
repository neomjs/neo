#!/usr/bin/env node

/**
 * @summary Automates the Neo.mjs release process using a Local-First Strategy.
 *
 * This script orchestrates the entire release lifecycle, enforcing a strict "Squash to Main" workflow
 * to maintain a clean, linear, and atomic git history on the production branch. It bridges the gap
 * between local development artifacts and remote GitHub infrastructure.
 *
 * The workflow consists of 6 key stages:
 * 1. **Pre-flight Checks**: Validates environment state (branch, auth, versioning).
 * 2. **Preparation**: Generates build artifacts and prepares the dev branch.
 * 3. **Atomic Squash**: Uses low-level git plumbing (`commit-tree`) to graft the dev state onto main
 *    as a single commit, avoiding merge conflicts and preserving history cleanliness.
 * 4. **Documentation**: Finalizes release notes with the production commit hash.
 * 5. **Distribution**: Triggers the GitHub Release (which cascades to npm) and updates the AI Knowledge Base.
 * 6. **Synchronization**: Syncs the latest GitHub state back to local markdown files and archives tickets.
 *
 * @keywords Release Automation, Git Plumbing, Local-First, Knowledge Base, GitHub Sync, CI/CD
 */

import { execSync } from 'child_process';
import fs from 'fs-extra';
import path from 'path';
import { GH_SyncService } from '../ai/services.mjs';

const root = path.resolve();

// --- Helper Functions ---

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
    const newVersion = getPackageVersion();
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
    runCommand('node buildScripts/prepareRelease.mjs', 'Failed to run prepareRelease.mjs');

    // Run build-all
    console.log('🏗️  Running build-all...');
    runCommand('npm run build-all', 'Failed to run npm run build-all');

    // Stage and Commit on Dev
    console.log('💾 Committing changes to dev...');
    runCommand('git add .', 'Failed to stage changes');
    try {
        runCommand(`git commit -m "Release v${newVersion}"`, 'Failed to commit to dev');
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
    const atomicLog = `\n\nAll changes delivered in 1 atomic commit: [${mainCommitHash.substring(0, 7)}](https://github.com/neomjs/neo/commit/${mainCommitHash})`;
    
    if (!noteContent.includes('All changes delivered in 1 atomic commit:')) {
        fs.appendFileSync(releaseNotePath, atomicLog);
        console.log('Added atomic changelog link to release notes.');
        
        runCommand(`git add ${releaseNotePath}`, 'Failed to stage release note');
        runCommand(`git commit -m "docs: Add atomic changelog hash to release notes"`, 'Failed to commit release note update');
        runCommand('git push origin dev', 'Failed to push dev');
    } else {
        console.log('Atomic changelog link already present.');
    }


    // --- 5. Release (GitHub) ---

    console.log('\n🚀 Step 5: Creating GitHub Release...');

    // This triggers the npm-publish workflow
    const ghCommand = `gh release create v${newVersion} --target dev --title "v${newVersion}" --notes-file ${releaseNotePath}`;
    runCommand(ghCommand, 'Failed to create GitHub release');

    console.log('✅ Release created! GitHub Actions will now publish to npm.');


    // --- 5.5 Upload Knowledge Base ---

    console.log('\n🧠 Step 5.5: Uploading Knowledge Base...');
    runCommand('node buildScripts/uploadKnowledgeBase.mjs', 'Failed to upload knowledge base');


    // --- 6. Post-Release Cleanup ---

    console.log('\n🧹 Step 6: Post-Release Cleanup (Sync & Archive)...');
    
    console.log('Waiting 10 seconds for release propagation...');
    await new Promise(resolve => setTimeout(resolve, 10000));

    console.log('🔄 Running GH Sync Service...');
    try {
        await GH_SyncService.runFullSync();
        console.log('✅ Sync complete.');
    } catch (error) {
        console.error('❌ Sync Service failed:', error);
        // Don't exit, try to commit what we have
    }

    // Commit Archived Tickets
    console.log('💾 Committing archived tickets...');
    const status = runCommandWithOutput('git status --porcelain');
    
    if (status) {
        runCommand('git add .', 'Failed to stage archive changes');
        runCommand(`git commit -m "chore: Archive tickets for v${newVersion}"`, 'Failed to commit archive changes');
        runCommand('git push origin dev', 'Failed to push archive changes');
    } else {
        console.log('No changes to archive.');
    }

    console.log('\n✨ Release Workflow Complete! ✨');
}

main().catch(error => {
    console.error('\n❌ Unhandled Error:', error);
    process.exit(1);
});