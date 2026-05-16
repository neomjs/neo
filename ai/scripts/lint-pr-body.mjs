import fs from 'fs';
import path from 'path';

/**
 * Pre-Flight (structural fast-path): authoring `ai/scripts/lint-pr-body.mjs`
 * matches sibling pattern of `ai/scripts/lint-skill-manifest.mjs` in `ai/scripts/`;
 * both are mechanical enforcement / CI scripts for agent substrate validation;
 * §23 sibling-file-lift applies; no novel directory choice.
 */

// Github Actions exposes the PR body natively through the context
const body = process.env.PR_BODY || '';
const author = process.env.PR_AUTHOR || '';

// We only enforce this on agent-authored PRs
const agentAuthors = ['neo-opus-4-7', 'neo-gemini-3-1-pro', 'neo-gpt'];

if (!agentAuthors.includes(author) && !process.env.FORCE_LINT) {
    console.log(`\n⏭️  Skipping PR body lint: author '${author}' is not a tracked AI agent.`);
    process.exit(0);
}

console.log(`\n🔍 Checking PR body structure for agent '${author}'...`);

// From pull-request-workflow.md §9
const REQUIRED_ANCHORS = [
    { name: 'Resolution Keyword', regex: /^(?:Resolves|Closes|Fixes|Related:|Refs) #\d+/im },
    { name: 'Evidence Declaration', regex: /^Evidence:/m },
    { name: 'Deltas Section', regex: /^## Deltas/m },
    { name: 'Test Evidence Section', regex: /^## Test Evidence/m }
];

let hasError = false;

REQUIRED_ANCHORS.forEach(anchor => {
    if (!anchor.regex.test(body)) {
        console.error(`❌ Missing mandatory section: ${anchor.name}`);
        hasError = true;
    } else {
        console.log(`✅ Found mandatory section: ${anchor.name}`);
    }
});

if (hasError) {
    console.error(`\n❌ PR Body Lint FAILED!`);
    console.error(`The PR body must conform to the minimum-viable structure defined in pull-request-workflow.md §9.`);
    console.error(`Missing anchors must be added to the PR description before merging.`);
    process.exit(1);
}

console.log(`\n✅ PR Body Lint PASSED.\n`);
process.exit(0);
