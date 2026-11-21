import Viewport from './Viewport.mjs';

/**
 * @summary Boots the time-zone support rota example in the requested or default theme.
 * @returns {Neo.controller.Application}
 */
export const onStart = () => {
    const
        {themes, url} = Neo.config,
        theme         = new URLSearchParams(url?.search).get('theme');

    return Neo.app({
        mainView: {
            module: Viewport,
            theme : themes.includes(theme) ? theme : themes[0]
        },
        name: 'SchedulerTimeZones'
    })
};
