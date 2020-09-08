import MainContainer from './app/view/MainContainer.mjs';

const onStart = () => Neo.app({
    appPath : 'docs/',
    mainView: MainContainer,
    name    : 'Docs'
});

export {onStart as onStart};