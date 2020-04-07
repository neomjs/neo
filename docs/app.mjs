import MainContainer from './app/view/MainContainer.mjs';

Neo.onStart = () => Neo.app({
    appPath : 'docs/',
    mainView: MainContainer,
    name    : 'Docs'
});