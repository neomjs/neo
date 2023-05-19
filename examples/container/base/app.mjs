import MainContainer from './MainContainer.mjs';

export const onStart = () => Neo.app({
    mainView: MainContainer,
    name    : 'Neo.examples.container.base',
    parentId: 'main-container'
});
