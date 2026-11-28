/**
 * @module Neo.util.Theme
 * @summary Dependency-free theme rules shared by the runtime and source tooling.
 */

/**
 * @summary Maps a class to its theme-map namespace, omitting only the leading application view segment.
 * @param {String} className Class name used by the theme loader.
 * @param {String|null} [appThemeFolder] Optional application theme-root projection.
 * @returns {String} The namespace used in the theme map's fileInfo.
 */
export function getThemeNamespace(className, appThemeFolder) {
    if (className.startsWith('Neo.')) return className;

    const parts = className.split('.'), root = parts.shift();

    if (parts[0] === 'view') parts.shift();

    return `apps.${appThemeFolder || root.toLowerCase()}.${parts.join('.')}`
}

/**
 * @summary The classic theme of the same scheme, for a requested Neo theme an app does not configure.
 * @type {Object<String, String>}
 */
const sameSchemeTheme = {
    'neo-theme-neo-dark' : 'neo-theme-dark',
    'neo-theme-neo-light': 'neo-theme-light'
};

/**
 * @summary Resolves the theme an app starts in: the theme `?theme=` names when it is configured, else
 * the classic theme of the requested Neo theme's scheme when that one is configured, else
 * `neo-theme-neo-dark` when the system prefers dark and that theme is configured, else the first
 * configured theme. An explicit request outranks the system preference.
 * @param {Object} config
 * @param {Boolean} [config.prefersDarkTheme] Whether the system prefers a dark theme.
 * @param {String[]} config.themes The configured theme names.
 * @param {Object|URL} [config.url] The current URL as Neo.config.url holds it ({base, href, search}), or a URL; its search is read for a theme query parameter.
 * @returns {String} The theme name to start in.
 */
export function resolveStartTheme({prefersDarkTheme, themes, url}) {
    const requested = new URLSearchParams(url?.search).get('theme'),
          fallback  = sameSchemeTheme[requested],
          dark      = 'neo-theme-neo-dark';

    if (themes.includes(requested)) return requested;
    if (themes.includes(fallback))  return fallback;
    if (prefersDarkTheme && themes.includes(dark)) return dark;

    return themes[0]
}

/**
 * @summary The color scheme a theme declares: its `--neo-color-scheme`, which the theme build writes into
 * `theme-map.json` as `schemes`. `null` until that map reaches the App worker, and for a theme the build never saw.
 * @param {String|null} theme A theme class name.
 * @returns {'dark'|'light'|null}
 */
export function declaredScheme(theme) {
    return (theme && globalThis.Neo?.cssMap?.fileInfo?.schemes?.[theme]) || null
}

/**
 * @summary Resolves a component's renderer value for a theme. An explicit `themeMap` entry wins, a `null` one
 * included; otherwise the theme's declared scheme picks from `schemeMap`.
 * @param {String|null} theme A theme class name.
 * @param {Object} themeMap Theme class → renderer value.
 * @param {Object} schemeMap `{dark, light}` → renderer value.
 * @returns {*} `undefined` when neither answers.
 */
export function resolveThemeValue(theme, themeMap, schemeMap) {
    if (theme && Object.hasOwn(themeMap, theme)) return themeMap[theme];

    const scheme = declaredScheme(theme);
    return scheme ? schemeMap[scheme] : undefined
}

/**
 * @summary Re-applies a component's color scheme once the theme map arrives, if it has not yet. A component built
 * before the map resolves a theme its `themeMap` does not name to its fallback; the declared scheme can only
 * answer after `Neo.worker.App#createThemeMap` fires `themeMapLoaded`.
 * @param {Neo.component.Base} component Offers `themeMap`, `getTheme()` and `applyColorScheme()`.
 */
export function reapplyOnThemeMap(component) {
    const {Neo} = globalThis;

    !Neo?.cssMap?.fileInfo && Neo?.currentWorker?.on?.('themeMapLoaded', () => {
        !component.isDestroyed && !Object.hasOwn(component.themeMap, component.getTheme() ?? '') && component.applyColorScheme()
    }, component, {once: true})
}
