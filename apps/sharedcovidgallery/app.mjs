import MainContainer from './MainContainer.mjs';

const onStart = () => Neo.app({
    mainView: MainContainer,
    name    : 'SharedCovidGallery'
});

export {onStart as onStart};