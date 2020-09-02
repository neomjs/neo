import MainContainer from './MainContainer.mjs';

Neo.onStart = () => Neo.app({
    appPath : 'apps/shareddialog2/',
    mainView: MainContainer,
    name    : 'SharedDialog2'
});