/**
 * @plane host
 */
import {execFile}  from 'child_process';
import path        from 'path';
import {promisify} from 'util';

const execFileAsync = promisify(execFile);

/**
 * @summary Detects the current Git branch for the GitHub Workflow sync CLI.
 * @param {Object} [options]
 * @param {String} [options.projectRoot=process.cwd()] Repository root expected by the CLI.
 * @param {Function} [options.execFileAsyncImpl=execFileAsync] Test seam for Git commands.
 * @returns {Promise<String>} Active branch name, or an empty string for detached HEAD.
 */
async function defaultSyncGithubWorkflowBranchDetector({projectRoot = process.cwd(), execFileAsyncImpl = execFileAsync} = {}) {
    let toplevel;
    try {
        const {stdout} = await execFileAsyncImpl('git', ['rev-parse', '--show-toplevel'], {cwd: projectRoot});
        toplevel = stdout.trim();
    } catch (error) {
        throw new Error(`syncGithubWorkflow REJECTED: could not resolve git top-level (git error: ${error.message}).`);
    }

    const
        normalizedProjectRoot = path.resolve(projectRoot),
        normalizedToplevel    = path.resolve(toplevel);

    if (normalizedProjectRoot !== normalizedToplevel) {
        throw new Error(
            `syncGithubWorkflow REJECTED: Root mismatch. CLI projectRoot '${normalizedProjectRoot}' ` +
            `does not match git repository top-level '${normalizedToplevel}'. ` +
            `This prevents cross-checkout branch diagnostics and context leakage.`
        );
    }

    const {stdout} = await execFileAsyncImpl('git', ['branch', '--show-current'], {cwd: projectRoot});
    return stdout.trim();
}

/**
 * @summary Wraps the GitHub Workflow sync CLI delegate with a dev-branch-only guard.
 * @param {Function} delegate Delegate to invoke when the active branch is dev.
 * @param {Function} [getBranch=defaultSyncGithubWorkflowBranchDetector] Branch detector.
 * @returns {Function} Guarded delegate.
 */
function buildSyncGithubWorkflowDevBranchGuard(delegate, getBranch = defaultSyncGithubWorkflowBranchDetector) {
    return async function syncGithubWorkflowOnDevOnly(...args) {
        let branch;
        try {
            branch = await getBranch();
        } catch (error) {
            if (error.message?.startsWith('syncGithubWorkflow REJECTED:')) {
                throw error;
            }
            throw new Error(`syncGithubWorkflow REJECTED: could not determine current branch (git error: ${error.message}). Refusing to sync without branch confirmation.`);
        }

        if (branch !== 'dev') {
            throw new Error(
                `syncGithubWorkflow REJECTED: working-tree is on branch '${branch || '(detached)'}', not 'dev'. ` +
                `syncGithubWorkflow writes to resources/content/{issues,pulls,discussions,release-notes}/ and metadata, which would pollute a non-dev branch. ` +
                `Switch to 'dev' and rerun npm run ai:sync-github-workflow, or let the scheduled Data Sync pipeline emit from its canonical dev context.`
            );
        }

        return delegate(...args);
    };
}

export {
    buildSyncGithubWorkflowDevBranchGuard,
    defaultSyncGithubWorkflowBranchDetector
};
