import Viewport from './view/Viewport.mjs';

export const onStart = () => Neo.app({
    appThemeFolder: 'workstation',
    mainView      : Viewport,
    name          : 'Workstation'
});
