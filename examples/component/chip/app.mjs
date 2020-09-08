import MainContainer from './MainContainer.mjs';

const onStart = () => Neo.app({
    appPath : 'examples/component/chip/',
    mainView: MainContainer,
    name    : 'TestApp'
});

export {onStart as onStart};