import GalleryMainContainer  from './GalleryMainContainer.mjs';

const onStart = () => Neo.app({
    appPath : 'examples/component/coronaGallery/',
    mainView: GalleryMainContainer,
    name    : 'TestApp'
});

export {onStart as onStart};