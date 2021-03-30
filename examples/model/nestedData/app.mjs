import MainContainer from './MainContainer.mjs';

const onStart = () => Neo.app({
    appPath : 'examples/model/nestedData/',
    mainView: MainContainer,
    name    : 'Neo.examples.model.nestedData'
});

export {onStart as onStart};