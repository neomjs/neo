import MainContainer from './MainContainer.mjs';

const onStart = () => Neo.app({
    appPath : 'examples/charts/',
    mainView: MainContainer,
    name    : 'Neo.examples.charts'
});

export {onStart as onStart};