import Viewport from './view/Viewport.mjs';

/**
 * @summary Resolves one Workstation window's carried Neo theme against that window's configured themes.
 * @param {Object} options
 * @param {String} [options.search=''] Serialized main-thread URL search.
 * @param {String[]} [options.themes=[]] Themes admitted for this exact window.
 * @returns {String|undefined} The carried configured theme, or the configured default.
 */
export function resolveBootstrapTheme({search='', themes=[]} = {}) {
    const candidate = new URLSearchParams(search).get('theme');

    return themes.includes(candidate) ? candidate : themes[0]
}

/**
 * @summary Starts each Workstation window with its carried theme on the first viewport instance.
 * @returns {Neo.controller.Application}
 */
export const onStart = () => {
    const
        windowId = Neo.bootingWindowId,
        config   = Neo.windowConfigs?.[windowId] || Neo.config,
        theme    = resolveBootstrapTheme({
            search: config.url?.search,
            themes: config.themes
        });

    return Neo.app({
        mainView: {module: Viewport, theme},
        name    : 'Workstation',
        windowId
    })
};
