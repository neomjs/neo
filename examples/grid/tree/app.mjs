import MainContainer from './MainContainer.mjs';

/**
 * @summary Boots the Tree Grid example in `?theme=` when valid, else in dark mode when the OS prefers dark.
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
        mainView: {module: MainContainer, theme},
        name    : 'Neo.examples.grid.tree'
    })
};
