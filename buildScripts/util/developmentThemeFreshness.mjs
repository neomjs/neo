import {
    DEVELOPMENT_THEME_BUILD_COMMAND,
    getExpectedDevelopmentCss,
    inspectDevelopmentThemeAssets
} from './developmentThemeAssets.mjs';

export const DEVELOPMENT_THEME_RECHECK_INTERVAL_MS = 5000;

const DEVELOPMENT_THEME_CSS_PREFIX = '/dist/development/css/';

/**
 * @summary Returns whether a request path targets generated development-theme CSS.
 * @param {String} pathname URL path, without query or hash.
 * @returns {Boolean}
 */
export function isDevelopmentThemeCssPath(pathname) {
    return pathname.startsWith(DEVELOPMENT_THEME_CSS_PREFIX) && pathname.endsWith('.css')
}

/**
 * @summary Creates the development server's theme freshness check: it inspects development-theme
 * assets at startup and at most once per recheck interval while theme CSS is requested.
 * Freshness warnings and inspector-error warnings are independently transition-de-duplicated;
 * neither inspection failures nor logging failures can block server startup or a response.
 *
 * The root checked is the one the server serves. A root with no theme sources of its own, such as
 * an app workspace whose engine sits in `node_modules`, has no build for this check to keep fresh,
 * so it never warns there. The check warns; it builds nothing.
 * @param {Object} [options]
 * @param {String} [options.root] The served root.
 * @param {Function} [options.buildsThemes] Whether the served root has theme sources to build.
 * @param {Function} [options.inspect] Development-theme inspector.
 * @param {Object} [options.logger] Warning logger.
 * @param {Function} [options.now] Millisecond clock.
 * @param {Number} [options.recheckIntervalMs] Minimum request-time inspection interval.
 * @returns {{onListening: Function, onRequest: Function}}
 */
export function createDevelopmentThemeFreshness({
    root = process.cwd(),
    buildsThemes = () => getExpectedDevelopmentCss(root).length > 0,
    inspect = () => inspectDevelopmentThemeAssets({repoRoot: root}),
    logger = console,
    now = Date.now,
    recheckIntervalMs = DEVELOPMENT_THEME_RECHECK_INTERVAL_MS
} = {}) {
    let errorWarned   = false,
        lastCheckedAt = Number.NEGATIVE_INFINITY,
        lastReady     = null;

    /**
     * @summary Emits a best-effort warning without allowing logger failures to block the server.
     * @param {String} message Warning text.
     * @returns {void}
     */
    function warn(message) {
        try {
            logger.warn(message)
        } catch {}
    }

    /**
     * @summary Re-inspects theme assets when forced or when the bounded interval has elapsed.
     * @param {Boolean} [force] Bypass the request-time interval for server startup.
     * @returns {void}
     */
    function inspectIfDue(force = false) {
        const checkedAt = now();

        if (!force && checkedAt - lastCheckedAt < recheckIntervalMs) return;

        lastCheckedAt = checkedAt;

        try {
            const {ready} = inspect();

            errorWarned = false;

            if (!ready && lastReady !== false && buildsThemes()) {
                warn(
                    '[dev-server] WARNING: development theme assets are missing, stale, invalid, ' +
                    'or borrowed. Served CSS may trail the current theme sources.\n' +
                    `Recovery: ${DEVELOPMENT_THEME_BUILD_COMMAND}`
                )
            }

            lastReady = ready
        } catch (error) {
            if (!errorWarned) {
                errorWarned = true;

                warn(
                    `[dev-server] WARNING: could not inspect development theme assets: ${error.message}\n` +
                    `Recovery: ${DEVELOPMENT_THEME_BUILD_COMMAND}`
                )
            }
        }
    }

    return {
        onListening() {
            inspectIfDue(true)
        },

        /**
         * @param {String} pathname The requested URL path, without query or hash.
         */
        onRequest(pathname) {
            if (isDevelopmentThemeCssPath(pathname)) inspectIfDue()
        }
    }
}
