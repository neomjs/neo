import Viewport from './Viewport.mjs';

/**
 * @summary Starts the cross-window dashboard example in the requested `?theme=` or the first configured theme.
 * @returns {Neo.controller.Application}
 */
export const onStart = () => {
    const
        {themes, url} = Neo.config,
        requested     = new URLSearchParams(url?.search).get('theme');

    return Neo.app({
        mainView: {module: Viewport, theme: themes.includes(requested) ? requested : themes[0]},
        name    : 'Neo.examples.dashboard.crossWindow'
    })
};
