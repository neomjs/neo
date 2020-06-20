import MainContainer from './MainContainer.mjs';

Neo.onStart = () => Neo.app({
    appPath : 'apps/sharedcovidgallery/',
    mainView: MainContainer,
    name    : 'SharedCovidGallery'
});