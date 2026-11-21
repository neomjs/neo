/**
 * @module Neo.util.Theme
 * @summary Dependency-free theme namespace rules shared by the runtime and source tooling.
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
 * @summary Resolves the theme an app starts in: the theme `?theme=` names when it is configured, else
 * `neo-theme-neo-dark` when the system prefers dark and that theme is configured, else the first
 * configured theme.
 * @param {Object} config
 * @param {Boolean} [config.prefersDarkTheme] Whether the system prefers a dark theme.
 * @param {String[]} config.themes The configured theme names.
 * @param {String|URL} [config.url] The current URL, searched for a `theme` query parameter.
 * @returns {String} The theme name to start in.
 */
export function resolveStartTheme({prefersDarkTheme, themes, url}) {
    const requested = new URLSearchParams(url?.search).get('theme'),
          dark      = 'neo-theme-neo-dark';

    if (themes.includes(requested)) return requested;
    if (prefersDarkTheme && themes.includes(dark)) return dark;

    return themes[0]
}
