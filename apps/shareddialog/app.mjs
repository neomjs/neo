import MainContainer from './MainContainer.mjs';

Neo.onStart = () => Neo.app({
    appPath : 'apps/shareddialog/',
    mainView: MainContainer,
    name    : 'SharedDialog'
});