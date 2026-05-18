import { execSync } from 'node:child_process';
import process from 'node:process';
import path from 'node:path';

// Allow explicit override via temporary environment flag NEO_SYNC_AUTOCOMMIT=1
if (process.env.NEO_SYNC_AUTOCOMMIT === '1') {
    process.exit(0);
}

// Get absolute git repository root to prevent cross-checkout branch diagnostics
let gitRoot;
try {
    gitRoot = execSync('git rev-parse --show-toplevel', { encoding: 'utf-8' }).trim();
} catch (e) {
    console.error('\x1b[31mError: Could not determine git repository root.\x1b[0m');
    process.exit(1);
}

// Verify that the current working directory matches the expected repository root
const normalizedCwd = path.resolve(process.cwd());
const normalizedGitRoot = path.resolve(gitRoot);

if (normalizedCwd !== normalizedGitRoot) {
    console.error(`\x1b[31mError: Repository root mismatch.\x1b[0m`);
    console.error(`check-chore-sync.mjs is running in '${normalizedCwd}', but the git repository root is '${normalizedGitRoot}'.`);
    console.error(`This prevents cross-checkout branch diagnostics and ensures context alignment.`);
    process.exit(1);
}

// Get current branch
let branch;
try {
    branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: gitRoot, encoding: 'utf-8' }).trim();
} catch (e) {
    console.error('Error getting git branch');
    process.exit(1);
}

// Allowed branches for chore-sync data
const ALLOWED_PREFIXES = ['chore/sync-', 'agent/sync-'];
const isDataBranch = ALLOWED_PREFIXES.some(prefix => branch.startsWith(prefix));

if (isDataBranch) {
    process.exit(0);
}

// Get staged files
let stagedFiles = [];
try {
    const output = execSync('git diff --cached --name-only', { cwd: gitRoot, encoding: 'utf-8' }).trim();
    if (output) {
        stagedFiles = output.split('\n');
    }
} catch (e) {
    console.error('Error getting staged files');
    process.exit(1);
}

// Define the generated data directories that should not be committed outside data branches
const dataDirs = [
    'resources/content/issues/',
    'resources/content/discussions/'
];

const violatingFiles = stagedFiles.filter(file =>
    dataDirs.some(dir => file.startsWith(dir))
);

// Allow explicit override via --force-data or bypassing hooks
// Git provides --no-verify by default, which is the standard way to bypass pre-commit hooks
if (violatingFiles.length > 0) {
    const allowedList = ALLOWED_PREFIXES.map(p => `'${p}*'`).join(' or ');
    console.error(`\x1b[31mError: Sync-data leakage detected.\x1b[0m`);
    console.error(`Branch '${branch}' is not a designated data-sync branch (e.g., ${allowedList}).`);
    console.error(`The following data files are staged for commit:`);
    violatingFiles.forEach(f => console.error(`  - ${f}`));
    console.error(`\nIf you must commit these files, either:`);
    console.error(`  1. Switch to a branch prefixed with ${allowedList}`);
    console.error(`  2. Unstage the files using 'git restore --staged <file>'`);
    console.error(`  3. Use 'git commit --no-verify' to bypass this check entirely.`);
    process.exit(1);
}

process.exit(0);
