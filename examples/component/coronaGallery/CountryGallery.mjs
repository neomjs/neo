import Gallery from '../../../src/component/Gallery.mjs';

/**
 * @class Neo.examples.component.coronaGallery.CountryGallery
 * @extends Neo.component.Gallery
 */
class CountryGallery extends Gallery {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.examples.component.coronaGallery.CountryGallery'
         * @private
         */
        className: 'Neo.examples.component.coronaGallery.CountryGallery',
        /**
         * @member {String[]} cls=['rw2-article-gallery', 'neo-gallery', 'page', 'view']
         */
        cls: ['rw2-article-gallery', 'neo-gallery', 'page', 'view'],
        /**
         * The image height of the gallery
         * @member {Number} imageHeight=240
         */
        imageHeight: 240,
        /**
         * The image width of the gallery
         * @member {Number} imageWidth=320
         */
        imageWidth: 320
    }}
}

Neo.applyClassConfig(CountryGallery);

export {CountryGallery as default};