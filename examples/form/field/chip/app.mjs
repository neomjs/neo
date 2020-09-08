import MainContainer from './MainContainer.mjs';

const onStart = () => Neo.app({
    appPath : 'examples/form/field/chip/',
    mainView: MainContainer,
    name    : 'TestApp'
});

export {onStart as onStart};