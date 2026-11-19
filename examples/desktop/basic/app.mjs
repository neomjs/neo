import Viewport from './Viewport.mjs';

/**
 * @summary Starts the web desktop example in the theme `?theme=` names, or the first configured theme.
 * @returns {Neo.controller.Application}
 */
export const onStart = () => {
    const
        {themes, url} = Neo.config,
        requested     = new URLSearchParams(url?.search).get('theme');

    return Neo.app({
        mainView: {module: Viewport, theme: themes.includes(requested) ? requested : themes[0]},
        name    : 'DesktopBasic'
    })
};
