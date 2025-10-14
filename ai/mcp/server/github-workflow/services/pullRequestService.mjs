import {exec} from 'child_process';
import {promisify} from 'util';

const execAsync = promisify(exec);

/**
 * Fetches a list of pull requests from GitHub.
 * @param {object} [options] - The options for listing pull requests.
 * @param {number} [options.limit=30] - The maximum number of PRs to return.
 * @param {string} [options.state='open'] - The state of the pull requests to list (open, closed, merged, all).
 * @returns {Promise<object>} A promise that resolves to the list of pull requests.
 */
async function listPullRequests(options = {}) {
    const {limit = 30, state = 'open'} = options;
    
    try {
        const command = `gh pr list --state ${state} --limit ${limit} --json number,title,author,url,state,createdAt`;
        const {stdout} = await execAsync(command);
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
        return {message: `Successfully checked out PR #${prNumber}`, details: stdout.trim()};
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

/**
 * Creates a comment on a specific pull request.
 * @param {number} prNumber - The number of the pull request.
 * @param {string} body - The content of the comment.
 * @returns {Promise<object>} A promise that resolves to a success message.
 */
async function createComment(prNumber, body) {
    return new Promise((resolve, reject) => {
        const command = `gh pr comment ${prNumber} --body-file -`;
        const child = exec(command, (error, stdout, stderr) => {
            if (error) {
                console.error(`Error creating comment on PR #${prNumber}:`, error);
                reject(new Error(`Failed to create comment on PR #${prNumber}.`));
                return;
            }
            resolve({message: `Successfully created comment on PR #${prNumber}`, details: stdout.trim()});
        });

        // Write the comment body to the stdin of the child process
        child.stdin.write(body);
        child.stdin.end();
    });
}

/**
 * Gets the full conversation for a specific pull request.
 * @param {number} prNumber - The number of the pull request.
 * @returns {Promise<object>} A promise that resolves to the conversation data.
 */
async function getConversation(prNumber) {
    try {
        const {stdout} = await execAsync(`gh pr view ${prNumber} --json title,body,comments`);
        return JSON.parse(stdout);
    } catch (error) {
        console.error(`Error getting conversation for PR #${prNumber}:`, error);
        throw new Error(`Failed to get conversation for PR #${prNumber}.`);
    }
}

export {
    listPullRequests,
    checkoutPullRequest,
    getPullRequestDiff,
    createComment,
    getConversation
};
