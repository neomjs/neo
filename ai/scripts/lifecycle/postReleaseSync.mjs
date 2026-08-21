#!/usr/bin/env node

/**
 * @summary Brain-side post-release content lifecycle: Knowledge Base upload, full GitHub sync,
 * ticket-index regeneration, and the archive commit.
 *
 * These steps used to live inside `buildScripts/release/publish.mjs` as its stages 5.5 and 6,
 * which made the ENGINE's release script import `ai/services.host.mjs` and spawn
 * `ai/scripts/maintenance/uploadKnowledgeBase.mjs` — the one coupling that forced the agent OS to
 * be present and importable before the engine could release at all. The engine↔Brain boundary is
 * one-way (the Brain may consume the engine; never the reverse), so the content half of the
 * release moved HERE, to the side that owns the corpus, the sync machinery, and the Knowledge
 * Base. `publish.mjs` now ends after the GitHub release is created and prints this script's npm
 * alias as the explicit next runbook step:
 *
 *     npm run ai:post-release-sync
 *
 * Ordering contract, preserved from the original stages:
 *
 * 1. Upload the Knowledge Base (the release's own artifacts are what it serves).
 * 2. Wait for GitHub release propagation, then `GH_SyncService.runFullSync()` — which archives the
 *    release's closed tickets and re-materializes the published release note under
 *    `resources/content/release-notes/chunk-N/`. Its throw is an INTEGRITY VERDICT, caught so the
 *    remaining steps still run, and re-asserted before anything is committed.
 * 3. Regenerate the ticket index so the active → archive moves are projected (the Brain consuming
 *    an engine build script — the legal dependency direction).
 * 4. Commit and push whatever the sync produced — including the staging release note's removal,
 *    which `publish.mjs` performs on disk and this commit persists.
 *
 * @keywords Release Automation, Knowledge Base, GitHub Sync, Corpus Archive, Engine-Brain Boundary
 */

import {execSync}                      from 'child_process';
import fs                              from 'fs-extra';
import path                            from 'path';
import {fileURLToPath}                 from 'url';
import {GH_SyncService}                from '../../services.host.mjs';
import {findLogicalIdentityCollisions} from '../../../buildScripts/util/check-content-logical-identity.mjs';

const root = path.resolve();

/**
 * @summary Refuses an archive commit that would make two archived artifacts claim one logical name.
 *
 * Same in-process assertion `publish.mjs` carries for its own commits, for the same reason: every
 * commit here uses `--no-verify` (machine-generated artifact commits over a broadly-staged tree),
 * so no git hook runs, and the `lint-staged` copy of this guard never sees the release path.
 *
 * It matters most on THIS commit, because it runs after a `catch` that deliberately continues when
 * `runFullSync()` throws. That throw is the corpus-integrity verdict — so "commit what we have"
 * would be, in exactly that case, a decision to publish the state the verdict rejected. A collision
 * stalls Knowledge Base ingestion for the whole corpus, not just the colliding artifacts.
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
            `Post-release sync aborted at "${stage}": ${collisions.length} archived logical name(s) claimed by ` +
            `more than one artifact — ${detail}. Embedding refuses this state, so releasing it stalls ` +
            `Knowledge Base ingestion for the entire corpus. Repair with ` +
            `PullRequestSyncer.repairDuplicateArtifacts (npm run ai:sync-github-workflow), then re-run.`
        );
    }
}

/**
 * @summary Runs a shell command with inherited stdio, exiting the process on failure.
 * @param {String} command The command to execute.
 * @param {String} errorMessage Message printed when the command fails.
 * @returns {String|undefined} Captured output, when the command succeeds.
 */
function runCommand(command, errorMessage) {
    try {
        console.log(`> ${command}`);
        return execSync(command, {stdio: 'inherit', encoding: 'utf-8'});
    } catch (error) {
        console.error(`\n❌ Error: ${errorMessage}`);
        console.error(error.message);
        process.exit(1);
    }
}

/**
 * @summary Runs a shell command and returns its trimmed output, or null on failure.
 * @param {String} command The command to execute.
 * @returns {String|null} Trimmed stdout, or null when the command fails.
 */
function runCommandWithOutput(command) {
    try {
        console.log(`> ${command}`);
        return execSync(command, {encoding: 'utf-8'}).trim();
    } catch {
        return null;
    }
}

/**
 * @summary Resolves the release version: an explicit `--version X.Y.Z` argument, else package.json.
 * @returns {String} The version string, without a leading `v`.
 */
function getVersion() {
    const flagIndex = process.argv.indexOf('--version');

    if (flagIndex > -1 && process.argv[flagIndex + 1]) {
        return process.argv[flagIndex + 1].replace(/^v/, '');
    }

    return fs.readJsonSync(path.join(root, 'package.json')).version;
}

async function main() {
    const version = getVersion();

    console.log(`\n🧠 Post-release content sync for v${version}...\n`);

    // --- 1. Upload Knowledge Base ---

    console.log('🧠 Step 1: Uploading Knowledge Base...');
    runCommand('node ai/scripts/maintenance/uploadKnowledgeBase.mjs', 'Failed to upload knowledge base');

    // --- 2. Full GitHub sync (archive the release's closed tickets, chunk the release note) ---

    console.log('\n🧹 Step 2: Sync & Archive...');

    console.log('Waiting 10 seconds for release propagation...');
    await new Promise(resolve => setTimeout(resolve, 10000));

    console.log('🔄 Running GH Sync Service...');
    try {
        await GH_SyncService.runFullSync();
        console.log('✅ Sync complete.');

        // Regenerate ticket index to reflect moves (active -> archive)
        console.log('🔄 Regenerating Ticket Index...');
        runCommand('node buildScripts/docs/index/tickets.mjs', 'Failed to regenerate ticket index');
    } catch (error) {
        console.error('❌ Sync Service failed:', error);
        // Don't exit, try to commit what we have — the collision assertion below re-checks the
        // one state this continue-path must never publish.
    }

    // --- 3. Commit Archived Tickets ---
    //
    // `GH_SyncService.runFullSync()` above writes archived items to the universal
    // ordinal-100 chunked shape (`resources/content/archive/{type}/v*/chunk-N/`).
    // The `git add .` below is intentionally broad to capture the archive/ moves, the
    // `_index.json` / `.sync-metadata.json` updates produced by the sync, and the staging
    // release note's removal performed by `publish.mjs`.
    console.log('💾 Committing archived tickets...');
    const status = runCommandWithOutput('git status --porcelain');

    if (status) {
        // Deliberately AFTER the catch above, so it also fires on the path where `runFullSync()`
        // threw and this script chose to continue: that throw is the integrity verdict, and this is
        // the commit that would publish what the verdict refused.
        assertNoArchiveLogicalIdentityCollisions('commit archived tickets');
        runCommand('git add .', 'Failed to stage archive changes');
        runCommand(`git commit --no-verify -m "chore: Archive tickets for v${version}"`, 'Failed to commit archive changes');
        runCommand('git push origin dev', 'Failed to push archive changes');
    } else {
        console.log('No changes to archive.');
    }

    console.log('\n✨ Post-release content sync complete! ✨');
}

// CLI-entry gate: a release-lifecycle script whose IMPORT is execution is a loaded gun — an
// accidental import (a test, a lint walking the module graph, a REPL probe) must never start a
// Knowledge Base upload or an archive commit. `main()` runs only when this file IS the process
// entrypoint — the same checkable entrypoint predicate `runAgent.mjs` uses.
const cliEntryPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
const modulePath   = fileURLToPath(import.meta.url);

if (cliEntryPath && cliEntryPath === modulePath) {
    main().catch(error => {
        console.error('\n❌ Unhandled Error:', error);
        process.exit(1);
    });
}
