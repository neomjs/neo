import Viewport from './view/Viewport.mjs';

export const onStart = () => Neo.app({
    appThemeFolder: 'colors',
    mainView      : Viewport,
    name          : 'ColorsWidget'
});
