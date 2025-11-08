import { execSync } from 'child_process';

/**
 * Lightweight gate helper for GH integration tests.
 * See ai/mcp/server/github-workflow/test-support/ghGate.mjs for original placement.
 */
export function getGateStatus() {
    const reasons = [];

    if (process.env.RUN_GH_INTEGRATION !== 'true') {
        reasons.push('RUN_GH_INTEGRATION != true');
        return { run: false, reasons };
    }

    if (process.env.GITHUB_TOKEN) {
        return { run: true, reasons };
    }

    try {
        const out = execSync('gh auth status', { stdio: ['ignore', 'pipe', 'pipe'] }).toString();
        if (out.includes('Logged in to github.com')) {
            return { run: true, reasons };
        }
        reasons.push('gh not authenticated');
        return { run: false, reasons };
    } catch (e) {
        reasons.push('gh not available');
        return { run: false, reasons };
    }
}

export function shouldRunGhIntegration() {
    return getGateStatus().run;
}
