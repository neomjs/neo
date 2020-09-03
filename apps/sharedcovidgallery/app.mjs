import MainContainer from './MainContainer.mjs';

const onStart = () => Neo.app({
    appPath : 'apps/sharedcovidgallery/',
    mainView: MainContainer,
    name    : 'SharedCovidGallery'
});

export {onStart as onStart};