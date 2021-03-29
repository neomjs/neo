import MainContainer from './MainContainer.mjs';

const onStart = () => Neo.app({
    appPath : 'examples/button/base/',
    mainView: MainContainer,
    name    : 'Neo.examples.button.base'
});

export {onStart as onStart};