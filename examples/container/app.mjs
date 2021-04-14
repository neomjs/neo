import MainContainer from './MainContainer.mjs';

const onStart = () => Neo.app({
    mainView: MainContainer,
    name    : 'Neo.examples.container',
    parentId: 'main-container'
});

export {onStart as onStart};