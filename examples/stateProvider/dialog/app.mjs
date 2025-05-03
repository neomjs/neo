import MainContainer from './MainContainer.mjs';

export const onStart = () => Neo.app({
    mainView: MainContainer,
    name    : 'Neo.examples.stateProvider.dialog'
});
