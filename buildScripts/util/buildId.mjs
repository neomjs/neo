/**
 * @summary The identity of one build run, shared by every step that writes into a dist folder.
 *
 * `buildScripts/build/all.mjs` resolves it before it spawns the build steps, which inherit it through
 * `process.env.NEO_BUILD_ID`; a step run on its own resolves its own. Each app's `neo-config.json` carries it as
 * `buildId`, and the service worker keys its cache on it (`Neo.worker.ServiceBase#buildId`), so a redeploy that keeps
 * its version still replaces the previous build's cached files.
 * @returns {String}
 */
export function getBuildId() {
    return process.env.NEO_BUILD_ID ||= Date.now().toString(36)
}
