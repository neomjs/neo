import chalk   from 'chalk';
import {spawn} from 'child_process';
import os      from 'os';

/**
 * @module buildScripts/util/runSteps
 * @summary Runs build steps that share no output as child processes, a bounded number at a time.
 */

/**
 * @summary Runs build steps that share no output, as many at once as a quarter of the machine's cores allows: four on
 * 18 cores, one on a 4-core CI runner, where they keep their sequence. After a failed step no new one starts.
 * @param {Array[]} steps  `[label, command, args]` each
 * @param {Object}  cpOpts The `child_process.spawn` options every step runs with
 * @returns {Promise<Object[]>} `{label, status}` for each step that ran
 */
export async function runSteps(steps, cpOpts) {
    const cores   = os.availableParallelism?.() ?? os.cpus().length,
          limit   = Math.max(1, Math.min(steps.length, Math.floor(cores / 4))),
          queue   = [...steps],
          results = [];

    const lane = async () => {
        while (queue.length) {
            const result = await startStep(...queue.shift(), cpOpts);

            results.push(result);
            result.status && queue.splice(0)
        }
    };

    await Promise.all(Array.from({length: limit}, lane));

    return results
}

/**
 * @summary Starts one build step as a child process and settles with its exit status, never with a rejection.
 * @param {String}   label   The step's name in a failure message
 * @param {String}   command
 * @param {String[]} args
 * @param {Object}   cpOpts
 * @returns {Promise<Object>} `{label, status}`
 */
function startStep(label, command, args, cpOpts) {
    return new Promise(resolve => {
        const child = spawn(command, args, cpOpts);

        child.on('error', error => {
            console.error(chalk.red(`${label}: ${error.message}`));
            resolve({label, status: 1})
        });

        child.on('close', status => resolve({label, status: status ?? 1}))
    })
}
