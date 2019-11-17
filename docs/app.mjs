import MainContainer from './app/view/MainContainer.mjs';

Neo.onStart = () => {
    Neo.app({
        appPath       : 'docs/',
        createMainView: true,
        mainView      : MainContainer,
        name          : 'Docs'
    });
};