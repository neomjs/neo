import MainContainer from './MainContainer.mjs';

const onStart = () => Neo.app({
    appPath : 'examples/model/inline/',
    mainView: MainContainer,
    name    : 'Neo.examples.model.inline'
});

export {onStart as onStart};