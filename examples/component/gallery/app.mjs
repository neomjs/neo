import GalleryMainContainer  from './GalleryMainContainer.mjs';

Neo.onStart = function() {
    Neo.app({
        appPath : 'examples/component/gallery/',
        mainView: GalleryMainContainer,
        name    : 'TestApp'
    });
};