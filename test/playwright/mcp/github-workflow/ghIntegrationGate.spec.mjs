import { getGateStatus } from './test-support/ghGate.mjs';

// Simple gate check used by CI to determine whether to run GH integration tests.
const status = getGateStatus();

if (!status.run) {
    console.log(`SKIP: GH integration tests gated off (${status.reasons.join('; ')})`);
    // Exit zero to indicate tests were skipped intentionally
    process.exit(0);
} else {
    console.log('RUN: GH integration gate enabled');
    process.exit(0);
}
