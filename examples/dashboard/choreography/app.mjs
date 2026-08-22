import DemoAWorkspace from './DemoAWorkspace.mjs';

export const onStart = () => Neo.app({
    mainView: DemoAWorkspace,
    name    : 'Neo.examples.dashboard.choreography'
});
