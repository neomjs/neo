#!/usr/bin/env node
/**
 * @module ai/scripts/reconcileV13Project
 * @summary Reconcile Neo v13 Release ProjectV2 (#12) against the canonical `release:v13` label.
 *
 * The v13 Project (https://github.com/orgs/neomjs/projects/12) is a Read-Only Derived
 * View per #10961's pilot scope. The canonical membership signal is the `release:v13`
 * label on issues; the Project mirrors that set. This script reports drift between the
 * two surfaces and (optionally with --apply) closes the drift by adding missing items.
 *
 * Per #10961 OQ3 resolution: Project carries NO canonical state. If an issue has the
 * `release:v13` label but is not in the Project, the script can heal that. If an issue
 * is in the Project but lacks the label, the script reports it as drift but does NOT
 * auto-remove it — operators or peers must either label it or remove it explicitly.
 *
 * Exit codes:
 *   0 — Project membership matches the labeled set exactly (in-sync). After --apply,
 *       this means all missing items were added AND no residual unlabeled-Project-items
 *       remain.
 *   1 — drift detected. Cases: report-only run with any drift; --apply with residual
 *       unlabeled-Project-items requiring operator action; --apply with per-item add
 *       failures.
 *   2 — script error (network, permission, etc.) bubbled out of a non-throwing gh call.
 *
 * Usage:
 *   npm run ai:reconcile-v13-project                    # report only
 *   npm run ai:reconcile-v13-project -- --apply         # add missing items
 *
 * @see https://github.com/neomjs/neo/issues/10961 — pilot scope + OQ resolutions
 * @see learn/agentos/v13-path.md — strategic anchor for the v13 release
 * @see learn/agentos/GitHubWorkflow.md — Project-state-is-observability-only rule
 */

import {execSync} from 'child_process';

const PROJECT_ID     = 'PVT_kwDOA0zl484BXGrv';
const PROJECT_NUMBER = 12;
const PROJECT_URL    = 'https://github.com/orgs/neomjs/projects/12';
const REPO           = 'neomjs/neo';
const LABEL          = 'release:v13';
const APPLY          = process.argv.includes('--apply');

function gh(args, {parse = true, throws = false} = {}) {
    try {
        const out = execSync(`gh ${args}`, {encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe']});
        return parse ? JSON.parse(out) : out;
    } catch (err) {
        if (throws) {
            throw err;
        }
        console.error(`[reconcile] gh command failed: ${args}`);
        console.error(err.stderr?.toString() || err.message);
        process.exit(2);
    }
}

console.log(`[reconcile] Project #${PROJECT_NUMBER} ↔ label "${LABEL}" (${PROJECT_URL})`);

// 1. Get all release:v13 labeled issues
const labeledIssues = gh(`issue list --repo ${REPO} --label "${LABEL}" --state all --limit 200 --json number,id,state,title`);
const labeledIds    = new Set(labeledIssues.map(i => i.id));

// 2. Get all Project items via GraphQL
// GraphQL `first` is capped at 100. Pilot scope (#10961) caps total release:v13 items
// well below that; if v13 grows past 100 items, paginate via pageInfo.endCursor.
const projectQuery = `query { node(id: "${PROJECT_ID}") { ... on ProjectV2 { items(first: 100) { nodes { id content { ... on Issue { number id title state } ... on PullRequest { number id title state } } } } } } }`;
const projectData  = gh(`api graphql -f query='${projectQuery}'`);
const items        = (projectData.data.node?.items?.nodes ?? [])
    .filter(item => item.content?.number)
    .map(item => ({projectItemId: item.id, content: item.content}));
const itemContentIds = new Set(items.map(i => i.content.id));

// 3. Detect drift
const labeledNotInProject = labeledIssues.filter(issue => !itemContentIds.has(issue.id));
const inProjectNotLabeled = items.filter(item => !labeledIds.has(item.content.id));

console.log(`  Labeled issues: ${labeledIssues.length}`);
console.log(`  Project items:  ${items.length}`);
console.log(`  Drift:`);
console.log(`    - Labeled but NOT in Project: ${labeledNotInProject.length}`);
console.log(`    - In Project but NOT labeled: ${inProjectNotLabeled.length}`);

if (labeledNotInProject.length === 0 && inProjectNotLabeled.length === 0) {
    console.log(`  ✓ In sync.`);
    process.exit(0);
}

if (labeledNotInProject.length > 0) {
    console.log(`\n  Labeled but NOT in Project (script can add with --apply):`);
    labeledNotInProject.forEach(i => console.log(`    #${i.number} [${i.state}] ${i.title}`));
}

if (inProjectNotLabeled.length > 0) {
    console.log(`\n  In Project but NOT labeled (operator action needed — label or remove):`);
    inProjectNotLabeled.forEach(i => console.log(`    #${i.content.number} [${i.content.state}] ${i.content.title}`));
}

let applyFailed = 0;

if (APPLY && labeledNotInProject.length > 0) {
    console.log(`\n[apply] Adding ${labeledNotInProject.length} labeled item(s) to Project #${PROJECT_NUMBER}...`);
    let added = 0;
    for (const issue of labeledNotInProject) {
        const mutation = `mutation { addProjectV2ItemById(input: {projectId: "${PROJECT_ID}", contentId: "${issue.id}"}) { item { id } } }`;
        try {
            gh(`api graphql -f query='${mutation}'`, {parse: false, throws: true});
            console.log(`  ✓ added #${issue.number}`);
            added++;
        } catch (err) {
            console.error(`  ✗ failed #${issue.number}: ${err.stderr?.toString() || err.message}`);
            applyFailed++;
        }
    }
    console.log(`[apply] ${added} added, ${applyFailed} failed.`);
}

// Exit 0 only when --apply fully heals drift AND no unlabeled-Project-items remain.
// Exit 1 covers: report-only with drift, --apply with residual unlabeled items, or --apply with per-item failures.
const fullyHealed = APPLY && applyFailed === 0 && inProjectNotLabeled.length === 0;
process.exit(fullyHealed ? 0 : 1);
