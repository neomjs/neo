import MainContainer from './view/MainContainer.mjs';

const onStart = () => Neo.app({
    appThemeFolder: 'covid',
    mainView      : MainContainer,
    name          : 'SharedCovid'
});

export {onStart as onStart};