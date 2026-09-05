import Viewport    from './view/Viewport.mjs';
import Transaction from '../../src/manager/Transaction.mjs';

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

    const params  = new URLSearchParams(config.url?.search ?? ''),
          carried = config.topologyIdentity;
    // A popup cannot cold-create its absent root before that root selects durable truth.
    if ((params.has('popout') || params.has('workspace')) && carried?.groupId && !Transaction.get(carried.groupId)) {
        config.topologyIdentity = {}
    }

    return Neo.app({
        mainView: {module: Viewport, theme},
        name    : 'Workstation',
        windowId
    })
};
