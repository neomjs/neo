import Viewport from './view/Viewport.mjs';

export const onStart = () => Neo.app({
    appThemeFolder: 'agentos',
    mainView      : Viewport,
    name          : 'AgentOSStrategy'
});
