#!/usr/bin/env node
/**
 * @summary Fails a CI run when a PR or review body carries a confidential token — without printing it.
 *
 * The MCP dispatch guard cannot see this surface: a body written with `gh pr create --body-file`
 * reaches no MCP tool. This is that gap, and its disclosure contract is INVERTED relative to every
 * other caller — a workflow log on a public repository is world-readable, so naming the matched token
 * here would publish the value the scan exists to protect.
 *
 * Reads the body and denylist from the ENVIRONMENT, never argv: a body interpolated into a shell
 * command is a script-injection vector, and a denylist on a command line is visible in the process
 * table.
 *
 * Exit codes: 0 clean, unchecked or skipped · 1 blocked · 2 usage error.
 * @module ai/scripts/lint/lintPublicBodyConfidentiality
 */
import {
    SCAN_OUTCOME,
    TARGET_VISIBILITY,
    projectScanForPublicLog,
    scanForConfidentialTokens
} from '../../services/shared/confidentiality/confidentialTokenScanner.mjs';

const
    body     = process.env.NEO_PUBLIC_BODY ?? '',
    rawList  = process.env.NEO_CONFIDENTIAL_TOKEN_DENYLIST ?? '',
    label    = process.env.NEO_PUBLIC_BODY_LABEL || 'body',
    denylist = rawList.split(',').map(token => token.trim()).filter(Boolean);

// The target is this repository, which is public. Stated rather than resolved: a workflow has no
// cheap visibility lookup, and assuming public is the fail-toward-scanning direction anyway.
const
    result    = scanForConfidentialTokens(body, {denylist, targetVisibility: TARGET_VISIBILITY.public}),
    projected = projectScanForPublicLog(result);

console.log(`[confidentiality] ${label}: ${JSON.stringify(projected)}`);

if (projected.outcome === SCAN_OUTCOME.unchecked) {
    // Not a pass. A run with no configured denylist scanned nothing, and a green check that never
    // ran is the exact shape this whole lane exists to end — so it is stated, loudly, every time.
    console.log(
        `[confidentiality] NOT ENFORCED: no denylist configured for this run. ` +
        `Fork pull_request runs receive no secrets, so this is expected on fork contributions and ` +
        `a misconfiguration on internal ones.`
    );
    process.exit(0)
}

if (projected.outcome === SCAN_OUTCOME.blocked) {
    console.error(
        `[confidentiality] REFUSED: the ${label} contains ${projected.matchCount} confidential ` +
        `token occurrence(s) at character offset(s) ${projected.offsets.join(', ')}.\n` +
        `The matched value is deliberately NOT printed — this log is public. ` +
        `Open the body at those offsets and scrub before re-running.`
    );
    process.exit(1)
}

process.exit(0)
