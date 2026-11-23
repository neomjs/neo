import * as childProcess from 'node:child_process';
import {EventEmitter}    from 'node:events';
import fs                from 'node:fs';
import {fileURLToPath}   from 'node:url';

export * from 'node:child_process';

/**
 * @summary Loader hook: a build script's `child_process` import resolves to this stub; libraries keep the real module.
 * @param {String}   specifier
 * @param {Object}   context
 * @param {Function} nextResolve
 * @returns {Promise<Object>}
 */
export async function resolve(specifier, context, nextResolve) {
    const {parentURL} = context;

    if ((specifier === 'child_process' || specifier === 'node:child_process') &&
        parentURL !== import.meta.url && parentURL?.includes('/buildScripts/')) {
        return {shortCircuit: true, url: import.meta.url}
    }

    return nextResolve(specifier, context)
}

/**
 * @summary Runs no build step. It appends each command line to `NEO_STUB_LOG` and answers status 7 for the step whose
 * command line contains `NEO_STUB_FAIL`, so a spec can fail one step of a build script. `buildThreads.mjs` is the one
 * step that runs, under this stub too: its stamp is what a spec of `all.mjs` has to observe.
 * @param {String}   command
 * @param {String[]} [args=[]]
 * @param {Object}   [options={}]
 * @returns {Object} `{status}`
 */
export function spawnSync(command, args=[], options={}) {
    const line = [command, ...args].join(' '),
          fail = process.env.NEO_STUB_FAIL;

    process.env.NEO_STUB_LOG && fs.appendFileSync(process.env.NEO_STUB_LOG, `${line}\n`);

    if (fail && line.includes(fail)) {
        return {status: 7}
    }

    // The spec's workspace has no build scripts of its own: run the repository's
    if (args[0]?.endsWith('buildThreads.mjs')) {
        const preload = fileURLToPath(new URL('./registerChildProcessStub.mjs', import.meta.url)),
              script  = fileURLToPath(new URL('../../../../../buildScripts/webpack/buildThreads.mjs', import.meta.url));

        return childProcess.spawnSync(process.execPath, ['--import', preload, script, ...args.slice(1)], {cwd: options.cwd, env: options.env, stdio: 'inherit'})
    }

    return {status: 0}
}

/**
 * @summary The asynchronous twin of {@link spawnSync}, for the steps `all.mjs` runs together: it records and answers
 * the same way, and reports the status through a `close` event.
 * @param {String}   command
 * @param {String[]} [args=[]]
 * @param {Object}   [options={}]
 * @returns {EventEmitter}
 */
export function spawn(command, args=[], options={}) {
    const child    = new EventEmitter(),
          {status} = spawnSync(command, args, options);

    setImmediate(() => child.emit('close', status));

    return child
}

export default {...childProcess, spawn, spawnSync};
