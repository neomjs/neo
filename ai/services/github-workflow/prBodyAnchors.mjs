/**
 * Required template-anchor substrings for agent-authored PR bodies.
 * 
 * These anchors ensure that the PR description adheres to the `pull-request` skill
 * template (`.agents/skills/pull-request/references/pull-request-workflow.md §9`).
 */
export const REQUIRED_PR_BODY_ANCHORS = [
    "FAIR-band:",
    "Evidence:",
    "## Test Evidence",
    "## Post-Merge Validation"
];
