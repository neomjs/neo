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
