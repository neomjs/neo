import Base from '../../../../src/container/Base.mjs';

/**
 * @class Portal.view.home.FooterContainer
 * @extends Neo.container.Base
 */
class FooterContainer extends Base {
    static config = {
        /**
         * @member {String} className='Portal.view.home.FooterContainer'
         * @protected
         */
        className: 'Portal.view.home.FooterContainer',
        /**
         * @member {String[]} cls=['portal-home-footer-container']
         */
        cls: ['portal-home-footer-container'],
        /**
         * @member {Object[]} items
         */
        items: [{
            html: 'Footer'
        }],
        /**
         * @member {String} tag='footer'
         */
        tag: 'footer'
    }
}

Neo.setupClass(FooterContainer);

export default FooterContainer;
