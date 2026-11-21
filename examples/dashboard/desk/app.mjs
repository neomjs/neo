import MainContainer from './MainContainer.mjs';
import Viewport      from '../../../src/container/Viewport.mjs';

/**
 * @summary Starts the operations desk example in the requested `?theme=` or the first configured theme.
 * @returns {Neo.controller.Application}
 */
export const onStart = () => {
    const
        {themes, url} = Neo.config,
        requested     = new URLSearchParams(url?.search).get('theme');

    return Neo.app({
        mainView: {
            module: Viewport,
            items : [{module: MainContainer, flex: 1}],
            theme : themes.includes(requested) ? requested : themes[0]
        },
        name: 'Neo.examples.dashboard.desk'
    })
};
