import MainContainer from './MainContainer.mjs';

const onStart = () => Neo.app({
    appPath : 'examples/list/chip/',
    mainView: MainContainer,
    name    : 'Neo.examples.list.chip'
});

export {onStart as onStart};