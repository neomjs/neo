import MainContainer from './MainContainer.mjs';

const onStart = () => Neo.app({
    appPath : 'examples/model/advanced/',
    mainView: MainContainer,
    name    : 'Neo.examples.model.advanced'
});

export {onStart as onStart};