import Viewport from './Viewport.mjs';

export const onStart = () => {
    const {themes, url} = Neo.config, theme = new URLSearchParams(url?.search).get('theme');
    return Neo.app({
        mainView: {module: Viewport, theme: themes.includes(theme) ? theme : themes[0]},
        name    : 'GanttBasic'
    })
};
