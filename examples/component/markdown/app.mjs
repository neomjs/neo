import MainContainer from './MainContainer.mjs';

export const onStart = () => {
    const {themes, url} = Neo.config, theme = new URLSearchParams(url?.search).get('theme');

    return Neo.app({
        mainView: {module: MainContainer, theme: themes.includes(theme) ? theme : themes[0]},
        name    : 'Neo.examples.component.markdown'
    })
};
