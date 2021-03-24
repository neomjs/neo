import MainContainer from './MainContainer.mjs';

const onStart = () => Neo.app({
    appPath : 'examples/panel/',
    mainView: MainContainer,
    name    : 'ComponentModelExample'
});

export {onStart as onStart};