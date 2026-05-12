#!/usr/bin/env node
/**
 * @module ai/scripts/migrateV13ProjectFromLabel
 * @author Antigravity / @neo-gemini-3-1-pro
 * @summary Phase 2 Migration: Move `release:v13` labeled tickets to ProjectV2 #12 and retire label.
 *
 * This script is part of the ProjectV2 migration (Issue #11233). It transfers all
 * tickets currently carrying the `release:v13` label into the canonical GitHub Project
 * (ProjectV2 #12). It then performs destructive cleanup by removing the label from the
 * tickets and deleting the label from the repository.
 *
 * *** EXECUTION GATE: OPERATOR AUTHORIZATION REQUIRED ***
 * This script performs destructive operations (bulk label removal and label deletion).
 * Agents are NOT authorized to run this script with `--apply` without explicit
 * operator consent.
 *
 * Exit codes:
 *   0 — Migration completed successfully (or dry-run finished).
 *   1 — Script error or partial failure during migration.
 *
 * Usage:
 *   node ai/scripts/migrateV13ProjectFromLabel.mjs           # Dry-run (lists actions)
 *   node ai/scripts/migrateV13ProjectFromLabel.mjs --apply   # Execute migration
 *
 * @see https://github.com/neomjs/neo/issues/11233
 */

import { execSync } from 'child_process';

const PROJECT_NUMBER = 12;
const ORG = 'neomjs';
const REPO = 'neomjs/neo';
const LABEL = 'release:v13';
const APPLY = process.argv.includes('--apply');

function gh(args, { parse = true, throws = false } = {}) {
    try {
        const out = execSync(`gh ${args}`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
        return parse ? (out.trim() ? JSON.parse(out) : null) : out;
    } catch (err) {
        if (throws) {
            throw err;
        }
        console.error(`[migration] gh command failed: ${args}`);
        console.error(err.stderr?.toString() || err.message);
        process.exit(1);
    }
}

console.log(`[migration] Phase 2: Migrating from label "${LABEL}" to ProjectV2 #${PROJECT_NUMBER}`);
if (!APPLY) {
    console.log(`[migration] DRY RUN MODE. Use --apply to execute destructive operations.`);
} else {
    console.log(`[migration] *** EXECUTION GATE: OPERATOR AUTHORIZATION REQUIRED ***`);
    console.log(`[migration] APPLY MODE active. Destructive label removals will occur.`);
}

// 1. Fetch all issues (open and closed) with the label
console.log(`\nFetching issues with label: ${LABEL}...`);
const issues = gh(`issue list --repo ${REPO} --label "${LABEL}" --state all --limit 200 --json number,title`);

if (!issues || issues.length === 0) {
    console.log(`No issues found with label ${LABEL}. Migration may already be complete.`);
    process.exit(0);
}

console.log(`Found ${issues.length} issues to migrate.`);

// 2. Fetch existing ProjectV2 items to ensure idempotency
console.log(`\nFetching existing items in ProjectV2 #${PROJECT_NUMBER} to ensure idempotency...`);
const projectData = gh(`project item-list ${PROJECT_NUMBER} --owner "${ORG}" --format json --limit 2000`);
const existingIssueNumbers = new Set(
    (projectData?.items || [])
        .filter(i => i.content?.type === 'Issue' && i.content?.repository === REPO)
        .map(i => i.content.number)
);

console.log(`Found ${existingIssueNumbers.size} issues already in ProjectV2 #${PROJECT_NUMBER}.`);

let successCount = 0;
let failCount = 0;

for (let i = 0; i < issues.length; i++) {
    const issue = issues[i];
    const issueUrl = `https://github.com/${REPO}/issues/${issue.number}`;
    console.log(`\n[${i + 1}/${issues.length}] Processing #${issue.number}: ${issue.title}`);

    const isAlreadyInProject = existingIssueNumbers.has(issue.number);

    if (APPLY) {
        try {
            // Add issue to ProjectV2
            if (isAlreadyInProject) {
                console.log(`  -> Already in ProjectV2 #${PROJECT_NUMBER}, skipping add...`);
            } else {
                console.log(`  -> Adding to ProjectV2 #${PROJECT_NUMBER}...`);
                gh(`project item-add ${PROJECT_NUMBER} --owner "${ORG}" --url "${issueUrl}"`, { parse: false, throws: true });
            }

            // Remove the label from the issue
            console.log(`  -> Removing label "${LABEL}"...`);
            gh(`issue edit ${issue.number} --repo ${REPO} --remove-label "${LABEL}"`, { parse: false, throws: true });
            
            successCount++;
        } catch (err) {
            console.error(`  ✗ Failed to migrate #${issue.number}: ${err.stderr?.toString() || err.message}`);
            failCount++;
        }
    } else {
        if (isAlreadyInProject) {
            console.log(`  -> (Dry Run) Already in ProjectV2 #${PROJECT_NUMBER}, would skip add`);
        } else {
            console.log(`  -> (Dry Run) Would add to ProjectV2 #${PROJECT_NUMBER}`);
        }
        console.log(`  -> (Dry Run) Would remove label "${LABEL}"`);
    }
}

console.log(`\n[migration] Processed ${issues.length} issues. Success: ${successCount}, Failed: ${failCount}`);

if (APPLY && failCount === 0) {
    console.log(`\n[migration] Retiring label '${LABEL}' from repository...`);
    try {
        gh(`label delete "${LABEL}" --repo ${REPO} --yes`, { parse: false, throws: true });
        console.log(`  ✓ Label deleted.`);
    } catch (err) {
        console.error(`  ✗ Label deletion failed or already deleted: ${err.stderr?.toString() || err.message}`);
    }
} else if (APPLY && failCount > 0) {
    console.log(`\n[migration] Skipping label retirement due to failed item migrations.`);
} else if (!APPLY) {
    console.log(`\n[migration] (Dry Run) Would retire/delete label '${LABEL}' from repository.`);
}

console.log(`\n[migration] Phase 2 complete.`);
process.exit(failCount > 0 ? 1 : 0);
