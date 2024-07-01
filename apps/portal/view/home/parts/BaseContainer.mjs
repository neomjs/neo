import Container from '../../../../../src/container/Base.mjs';

/**
 * Abstract base class for all views inside the landing page
 * @class Portal.view.home.parts.BaseContainer
 * @extends Neo.container.Base
 * @abstract
 */
class BaseContainer extends Container {
    static config = {
        /**
         * @member {String} className='Portal.view.home.parts.BaseContainer'
         * @protected
         */
        className: 'Portal.view.home.parts.BaseContainer',
        /**
         * @member {String[]} cls=['portal-home-content-view','neo-container']
         */
        baseCls: ['portal-home-content-view', 'neo-container'],
        /**
         * @member {Object} responsiveConfig
         */
        responsiveConfig: {
            medium: {maxWidth: 840},
            large : {minWidth: 841}
        }
    }

    /**
     * Hook which will trigger whenever the container fully gets scrolled into the visible area.
     * Override it as needed.
     */
    activate() {}
}

Neo.setupClass(BaseContainer);

export default BaseContainer;
