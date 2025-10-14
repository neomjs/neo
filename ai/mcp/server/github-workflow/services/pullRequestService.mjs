import {exec} from 'child_process';
import {promisify} from 'util';

const execAsync = promisify(exec);

/**
 * Fetches a list of open pull requests from GitHub.
 * @param {number} limit - The maximum number of PRs to return.
 * @returns {Promise<object>} A promise that resolves to the list of pull requests.
 */
async function listPullRequests(limit = 30) {
    try {
        const {stdout} = await execAsync(`gh pr list --limit ${limit} --json number,title,author,url,state,createdAt`);
        const pullRequests = JSON.parse(stdout);
        return {
            count: pullRequests.length,
            pullRequests: pullRequests.map(pr => ({
                ...pr,
                author: pr.author.login
            }))
        };
    } catch (error) {
        console.error('Error fetching pull requests:', error);
        throw new Error('Failed to fetch pull requests from GitHub.');
    }
}

/**
 * Checks out a specific pull request locally.
 * @param {number} prNumber - The number of the pull request to check out.
 * @returns {Promise<object>} A promise that resolves to a success message.
 */
async function checkoutPullRequest(prNumber) {
    try {
        const {stdout} = await execAsync(`gh pr checkout ${prNumber}`);
        return {message: `Successfully checked out PR #${prNumber}`};
    } catch (error) {
        console.error(`Error checking out PR #${prNumber}:`, error);
        throw new Error(`Failed to checkout PR #${prNumber}.`);
    }
}

/**
 * Gets the diff for a specific pull request.
 * @param {number} prNumber - The number of the pull request.
 * @returns {Promise<string>} A promise that resolves to the diff text.
 */
async function getPullRequestDiff(prNumber) {
    try {
        const {stdout} = await execAsync(`gh pr diff ${prNumber}`);
        return stdout;
    } catch (error) {
        console.error(`Error getting diff for PR #${prNumber}:`, error);
        throw new Error(`Failed to get diff for PR #${prNumber}.`);
    }
}

export {
    listPullRequests,
    checkoutPullRequest,
    getPullRequestDiff
};
