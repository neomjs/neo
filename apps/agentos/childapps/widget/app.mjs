import Viewport from './view/Viewport.mjs';

export const onStart = () => Neo.app({
    appThemeFolder: 'agent-os',
    mainView: Viewport,
    name: 'AgentOSWidget'
});
