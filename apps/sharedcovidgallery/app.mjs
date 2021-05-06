import MainContainer from './MainContainer.mjs';

const onStart = () => Neo.app({
    appThemeFolder: 'covid',
    mainView      : MainContainer,
    name          : 'SharedCovidGallery'
});

export {onStart as onStart};