import Viewport from './Viewport.mjs';

export const onStart = () => {
    const
        {themes, url} = Neo.windowConfigs?.[Neo.bootingWindowId] || Neo.config,
        requested     = new URLSearchParams(url?.search).get('theme'),
        theme         = themes.includes(requested) ? requested : themes[0];

    return Neo.app({
        mainView: {module: Viewport, theme},
        name    : 'Neo.examples.stateProvider.multiWindow2'
    })
};
