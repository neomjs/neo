import {exec} from 'child_process';
import {promisify} from 'util';

const execAsync = promisify(exec);

/**
 * Adds labels to an issue or pull request.
 * @param {number} issueNumber - The number of the issue or PR.
 * @param {string[]} labels - An array of labels to add.
 * @returns {Promise<object>} A promise that resolves to a success message.
 */
async function addLabels(issueNumber, labels) {
    const labelString = labels.join(',');
    try {
        const {stdout} = await execAsync(`gh issue edit ${issueNumber} --add-label "${labelString}"`);
        return {message: `Successfully added labels to issue #${issueNumber}`, details: stdout.trim()};
    } catch (error) {
        console.error(`Error adding labels to issue #${issueNumber}:`, error);
        throw new Error(`Failed to add labels to issue #${issueNumber}.`);
    }
}

/**
 * Removes labels from an issue or pull request.
 * @param {number} issueNumber - The number of the issue or PR.
 * @param {string[]} labels - An array of labels to remove.
 * @returns {Promise<object>} A promise that resolves to a success message.
 */
async function removeLabels(issueNumber, labels) {
    const labelString = labels.join(',');
    try {
        const {stdout} = await execAsync(`gh issue edit ${issueNumber} --remove-label "${labelString}"`);
        return {message: `Successfully removed labels from issue #${issueNumber}`, details: stdout.trim()};
    } catch (error) {
        console.error(`Error removing labels from issue #${issueNumber}:`, error);
        throw new Error(`Failed to remove labels from issue #${issueNumber}.`);
    }
}

export {
    addLabels,
    removeLabels
};
