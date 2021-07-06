import MainContainer from './MainContainer.mjs';

const onStart = () => Neo.app({
    mainView: MainContainer,
    name    : 'Neo.examples.menu.list'
});

export {onStart as onStart};
