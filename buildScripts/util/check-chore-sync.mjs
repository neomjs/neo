import { execSync } from 'node:child_process';
import process from 'node:process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Anchor git checks to the repository that owns this hook script, not the caller's cwd.
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const scriptRoot = path.resolve(__dirname, '../..');

// Get absolute git repository root to prevent cross-checkout branch diagnostics.
let gitRoot;
try {
    gitRoot = execSync('git rev-parse --show-toplevel', { cwd: scriptRoot, encoding: 'utf-8' }).trim();
} catch (e) {
    console.error('\x1b[31mError: Could not determine git repository root.\x1b[0m');
    process.exit(1);
}

const normalizedGitRoot = path.resolve(gitRoot);
const normalizedScriptRoot = path.resolve(scriptRoot);

if (normalizedScriptRoot !== normalizedGitRoot) {
    console.error(`\x1b[31mError: Script repository root mismatch.\x1b[0m`);
    console.error(`check-chore-sync.mjs is located under '${normalizedScriptRoot}', but the git repository root is '${normalizedGitRoot}'.`);
    console.error(`This prevents cross-checkout branch diagnostics and ensures hook ownership alignment.`);
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

// Generated GitHub workflow content that should not leak into feature commits.
const generatedSyncPaths = [
    'resources/content/issues/',
    'resources/content/discussions/',
    'resources/content/pulls/',
    'resources/content/release-notes/',
    'resources/content/archive/',
    'resources/content/_index.json',
    'resources/content/.sync-metadata.json'
];

const isGeneratedSyncFile = file => generatedSyncPaths.some(item =>
    item.endsWith('/') ? file.startsWith(item) : file === item
);

// If NEO_SYNC_AUTOCOMMIT is set, we must strictly enforce that ONLY data files are staged.
// This prevents auto-commits from leaking manually staged source code files into sync commits.
if (process.env.NEO_SYNC_AUTOCOMMIT === '1') {
    const nonSyncFiles = stagedFiles.filter(file => !isGeneratedSyncFile(file));
    if (nonSyncFiles.length > 0) {
        console.error(`\x1b[31mError: NEO_SYNC_AUTOCOMMIT bypass rejected.\x1b[0m`);
        console.error(`Automated sync commits must ONLY contain data files. The following non-sync files are staged:`);
        nonSyncFiles.forEach(f => console.error(`  - ${f}`));
        process.exit(1);
    }
    process.exit(0);
}

const violatingFiles = stagedFiles.filter(file =>
    isGeneratedSyncFile(file)
);

// Allow explicit override via --force-data or bypassing hooks
// Git provides --no-verify by default, which is the standard way to bypass pre-commit hooks
if (violatingFiles.length > 0) {
    const allowedList = ALLOWED_PREFIXES.map(p => `'${p}*'`).join(' or ');
    console.error(`\x1b[31mError: Sync-data leakage detected.\x1b[0m`);
    console.error(`Branch '${branch}' (in root '${normalizedGitRoot}') is not a designated data-sync branch (e.g., ${allowedList}).`);
    console.error(`The following data files are staged for commit:`);
    violatingFiles.forEach(f => console.error(`  - ${f}`));
    console.error(`\nIf you must commit these files, either:`);
    console.error(`  1. Switch to a branch prefixed with ${allowedList}`);
    console.error(`  2. Unstage the files using 'git restore --staged <file>'`);
    console.error(`  3. Use 'git commit --no-verify' to bypass this check entirely.`);
    process.exit(1);
}

process.exit(0);
