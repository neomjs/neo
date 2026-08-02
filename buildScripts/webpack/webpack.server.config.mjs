import {
    DEVELOPMENT_THEME_BUILD_COMMAND,
    inspectDevelopmentThemeAssets
} from '../util/developmentThemeAssets.mjs';

export const DEVELOPMENT_THEME_RECHECK_INTERVAL_MS = 5000;

const DEVELOPMENT_THEME_CSS_PREFIX = '/dist/development/css/';

/**
 * @summary Returns whether a dev-server request targets generated development-theme CSS.
 * @param {Object} request Express request object.
 * @returns {Boolean}
 */
function isDevelopmentThemeCssRequest(request) {
    const pathname = request.url?.split(/[?#]/, 1)[0] || '';

    return pathname.startsWith(DEVELOPMENT_THEME_CSS_PREFIX) && pathname.endsWith('.css')
}

/**
 * @summary Creates webpack-dev-server lifecycle hooks that inspect development-theme freshness
 * at startup and at most once per recheck interval while theme CSS is actively requested.
 * Freshness warnings and inspector-error warnings are independently transition-de-duplicated;
 * neither inspection failures nor logging failures can block server startup or a response.
 * @param {Object} [options]
 * @param {Function} [options.inspect] Development-theme inspector.
 * @param {Object} [options.logger] Warning logger.
 * @param {Function} [options.now] Millisecond clock.
 * @param {Number} [options.recheckIntervalMs] Minimum request-time inspection interval.
 * @returns {{onListening: Function, setupMiddlewares: Function}}
 */
export function createDevelopmentThemeFreshnessHooks({
    inspect = inspectDevelopmentThemeAssets,
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

            if (!ready && lastReady !== false) {
                warn(
                    '[dev-server] WARNING: development theme assets are missing, stale, invalid, ' +
                    'or borrowed. Served CSS may trail current SCSS sources.\n' +
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

        setupMiddlewares(middlewares) {
            middlewares.unshift({
                name      : 'development-theme-freshness',
                middleware: (request, response, next) => {
                    if (isDevelopmentThemeCssRequest(request)) inspectIfDue();

                    next()
                }
            });

            return middlewares
        }
    }
}

const developmentThemeFreshnessHooks = createDevelopmentThemeFreshnessHooks();

/**
 * An agent seat's dev-server port cannot be a committed value — several seats share one machine, so the
 * port has to be chosen at launch time and told to us. The Claude-Code browser pane does exactly that: it
 * allocates a free port when the configured one is taken and publishes the choice through `PORT`.
 *
 * Without reading it, two independent port selections run and disagree — the pane points at the port it
 * allocated while webpack-dev-server auto-bumps to its own, so the preview loads nothing while a perfectly
 * healthy server serves the tree on a different number. Passing `--port` instead does not fix it; that
 * pins webpack and leaves the pane's allocation unread, which is the same divergence with the sides
 * swapped.
 *
 * Left unset, this resolves to `undefined` and webpack-dev-server keeps its own default and auto-bump, so
 * an ordinary `npm run server-start` is unchanged.
 * @type {Number|undefined}
 */
const port = process.env.PORT ? Number(process.env.PORT) : undefined;

export default {
    mode: 'production',

    devServer: {
        ...developmentThemeFreshnessHooks,

        port,

        static: {
            directory: process.cwd(),
            watch    : false
        }
    }
};
