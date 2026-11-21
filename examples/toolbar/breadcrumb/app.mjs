import MainContainer from './view/MainContainer.mjs';

/**
 * @summary Starts the breadcrumb folder example in the requested `?theme=` or the first configured theme.
 * @returns {Neo.controller.Application}
 */
export const onStart = () => {
    const
        {themes, url} = Neo.config,
        requested     = new URLSearchParams(url?.search).get('theme');

    return Neo.app({
        mainView: {module: MainContainer, theme: themes.includes(requested) ? requested : themes[0]},
        name    : 'Neo.examples.toolbar.breadcrumb'
    })
};
