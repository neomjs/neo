import fs   from 'node:fs';
import path from 'node:path';

const idPattern    = /^[\w-]+$/,
      stampPattern = /neo-build-id:[\w-]*/g;

/**
 * @summary The identity of one build run, shared by every step that writes into a dist folder.
 *
 * `buildScripts/build/all.mjs` resolves it before it spawns the build steps, which inherit it through
 * `process.env.NEO_BUILD_ID`; a step run on its own resolves its own.
 * @returns {String}
 */
export function getBuildId() {
    return process.env.NEO_BUILD_ID ||= Date.now().toString(36)
}

/**
 * @summary Whether this build step leaves publishing the id to the build that runs it. `buildScripts/build/all.mjs` runs
 * its steps with `--no-stamp` and stamps every dist folder it built after its last step, so a step that fails after
 * another one succeeded publishes nothing.
 * @param {String[]} [argv=process.argv]
 * @returns {Boolean}
 */
export function stampDeferred(argv=process.argv) {
    return argv.includes('--no-stamp')
}

/**
 * @summary Publishes a build run's id in a dist folder. Call it only after the run succeeded: a build step run on its own
 * stamps once it succeeded, and `all.mjs` runs its steps with `--no-stamp` ({@link stampDeferred}) and stamps after its
 * last step.
 *
 * Each app's `neo-config.json` gets it as `buildId`: the page registers the service worker under it, and names its
 * own workers after it. The service worker scripts get it behind their `neo-build-id:` stamp, which
 * `Neo.worker.ServiceBase` reads as its own identity: their bytes change with every build, so a registration of the
 * bare worker URL installs the new worker as well. Stamping a folder again replaces the previous id, so a partial build
 * publishes its own.
 * @param {Object} options
 * @param {String} options.buildId Letters, digits, `_` and `-`: it travels in URLs, and a later stamp must find it whole
 * @param {String} options.distPath The dist folder, e.g. `dist/production`
 */
export function stampBuildId({buildId, distPath}) {
    if (!idPattern.test(buildId)) {
        throw new Error(`The build id "${buildId}" may only hold letters, digits, "_" and "-"`)
    }

    if (!fs.existsSync(distPath)) return;

    for (const entry of fs.readdirSync(distPath, {recursive: true, withFileTypes: true})) {
        if (!entry.isFile()) continue;

        const file = path.join(entry.parentPath ?? entry.path, entry.name);

        if (entry.name === 'neo-config.json') {
            const text   = fs.readFileSync(file, 'utf8'),
                  config = JSON.parse(text);

            config.buildId = buildId;
            fs.writeFileSync(file, text.includes('\n') ? JSON.stringify(config, null, 4) : JSON.stringify(config))
        } else if (entry.name === 'serviceworker.js' || entry.name === 'ServiceWorker.mjs' || entry.name === 'ServiceBase.mjs') {
            const text  = fs.readFileSync(file, 'utf8'),
                  stamp = `neo-build-id:${buildId}`;

            // The ESM entry imports the stamped ServiceBase: a stamp comment changes its own bytes too
            if (text.includes('neo-build-id:')) {
                fs.writeFileSync(file, text.replace(stampPattern, stamp))
            } else if (entry.name === 'ServiceWorker.mjs') {
                fs.writeFileSync(file, `${text}\n// ${stamp}\n`)
            }
        }
    }
}
