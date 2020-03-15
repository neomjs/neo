import MainContainer from './MainContainer.mjs';

Neo.onStart = function() {
    Neo.app({
        appPath : 'apps/covid/',
        mainView: MainContainer,
        name    : 'Covid'
    });
};