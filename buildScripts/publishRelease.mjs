#!/usr/bin/env node

/**
 * @file Automates the Neo.mjs release process using a Local-First Strategy.
 * This script handles version updates, atomic git history (Squash to Main),
 * and synchronizing GitHub issues/releases with local markdown files.
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
    const version = getPackageVersion(); // Note: This is the OLD version, prepareRelease will bump it.
    // Wait, prepareRelease bumps it. So we don't know the NEW version yet unless we parse it or ask.
    // Actually, usually the dev bumps package.json manually OR prepareRelease does it?
    // Checking prepareRelease.mjs: It reads package.json. It assumes package.json is ALREADY updated with the new version.
    // So the user must have bumped package.json manually before running this?
    // "prepareRelease.mjs: const packageJson = requireJson(path.join(root, 'package.json'))"
    // It updates config files based on package.json.
    // So yes, the user must bump package.json first.
    
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
        runCommand(`git commit -m 