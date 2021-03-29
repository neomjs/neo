import MainContainer from './MainContainer.mjs';

const onStart = () => Neo.app({
    appPath : 'examples/button/split/',
    mainView: MainContainer,
    name    : 'Neo.examples.button.split'
});

export {onStart as onStart};