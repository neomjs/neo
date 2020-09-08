import MainContainer from './MainContainer.mjs';

const onStart = () => Neo.app({
    appPath : 'examples/component/dateSelector/',
    mainView: MainContainer,
    name    : 'TestApp'
});

export {onStart as onStart};