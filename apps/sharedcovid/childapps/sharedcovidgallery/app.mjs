import MainContainer from './MainContainer.mjs';

export const onStart = () => Neo.app({
    appThemeFolder: 'covid',
    mainView      : MainContainer,
    name          : 'SharedCovidGallery'
});
