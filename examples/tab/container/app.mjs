import MainContainer from './MainContainer.mjs';

const onStart = () => Neo.app({
    appPath : 'examples/tab/container/',
    mainView: MainContainer,
    name    : 'Neo.examples.tab.container'
});

export {onStart as onStart};