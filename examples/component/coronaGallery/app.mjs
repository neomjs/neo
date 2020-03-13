import GalleryMainContainer  from './GalleryMainContainer.mjs';

Neo.onStart = function() {
    Neo.app({
        appPath : 'examples/component/coronaGallery/',
        mainView: GalleryMainContainer,
        name    : 'TestApp'
    });
};