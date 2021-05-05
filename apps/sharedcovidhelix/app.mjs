import MainContainer from './MainContainer.mjs';

const onStart = () => Neo.app({
    appThemeFolder: 'covid',
    mainView      : MainContainer,
    name          : 'SharedCovidHelix'
});

export {onStart as onStart};