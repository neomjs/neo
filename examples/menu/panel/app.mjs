import MainContainer from './MainContainer.mjs';

const onStart = () => Neo.app({
    mainView: MainContainer,
    name    : 'Neo.examples.menu.panel'
});

export {onStart as onStart};
