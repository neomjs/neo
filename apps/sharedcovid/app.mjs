import MainContainer from './view/MainContainer.mjs';

export const onStart = () => Neo.app({
    appThemeFolder: 'covid',
    mainView      : MainContainer,
    name          : 'SharedCovid'
});
