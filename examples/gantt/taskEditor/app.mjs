import Viewport from './Viewport.mjs';

/**
 * @summary Starts the task editor example in the theme `?theme=` names, else in the dark theme when the system
 * prefers dark, else in the first configured theme.
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
        name    : 'GanttTaskEditor'
    })
};
