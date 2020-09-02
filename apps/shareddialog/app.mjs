import MainContainer from './view/MainContainer.mjs';

Neo.onStart = () => Neo.app({
    appPath : 'apps/shareddialog/',
    mainView: MainContainer,
    name    : 'SharedDialog'
});