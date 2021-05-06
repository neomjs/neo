import MainContainer from './MainContainer.mjs';

const onStart = () => Neo.app({
    appThemeFolder: 'covid',
    mainView      : MainContainer,
    name          : 'SharedCovidChart'
});

export {onStart as onStart};