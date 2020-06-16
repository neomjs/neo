import MainContainer from './MainContainer.mjs';

Neo.onStart = () => Neo.app({
    appPath : 'apps/sharedcovid_gallery/',
    mainView: MainContainer,
    name    : 'CovidGallery'
});