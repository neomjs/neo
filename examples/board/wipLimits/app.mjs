import Viewport from './Viewport.mjs';

/**
 * @summary Starts the repair workshop WIP-limits board example in `?theme=` when requested, else dark when preferred,
 * else the first configured theme (`neo-theme-neo-dark`).
 * @returns {Neo.controller.Application}
 */
export const onStart = () => {
    const
        {prefersDarkTheme, themes, url} = Neo.config,
        requested                       = new URLSearchParams(url?.search).get('theme'),
        dark                            = 'neo-theme-neo-dark';

    let theme = themes[0];

    if (themes.includes(requested)) {
        theme = requested
    } else if (prefersDarkTheme && themes.includes(dark)) {
        theme = dark
    }

    return Neo.app({
        mainView: {module: Viewport, theme},
        name    : 'BoardWipLimits'
    })
};
