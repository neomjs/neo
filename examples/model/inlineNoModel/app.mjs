import MainContainer from './MainContainer.mjs';

const onStart = () => Neo.app({
    appPath : 'examples/model/inlineNoModel/',
    mainView: MainContainer,
    name    : 'Neo.examples.model.inlineNoModel'
});

export {onStart as onStart};