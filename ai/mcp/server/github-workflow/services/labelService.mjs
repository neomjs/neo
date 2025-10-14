import {exec} from 'child_process';
import {promisify} from 'util';

const execAsync = promisify(exec);

/**
 * Fetches a list of all labels in the repository.
 * @returns {Promise<object>} A promise that resolves to the list of labels.
 */
async function listLabels() {
    try {
        const {stdout} = await execAsync('gh label list --json name,description,color');
        const labels = JSON.parse(stdout);
        return {
            count: labels.length,
            labels: labels
        };
    } catch (error) {
        console.error('Error fetching labels:', error);
        throw new Error('Failed to fetch labels from GitHub.');
    }
}

export {
    listLabels
};
