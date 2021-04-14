import MainContainer  from './MainContainer.mjs';

const onStart = () => Neo.app({
    mainView: MainContainer,
    name    : 'Neo.examples.viewport'
});

export {onStart as onStart};