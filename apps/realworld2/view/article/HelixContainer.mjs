import HelixMainContainer from '../../../../examples/component/helix/HelixMainContainer.mjs';

/**
 * @class RealWorld2.view.article.HelixContainer
 * @extends Neo.list.Base
 */
class HelixContainer extends HelixMainContainer {
    static getConfig() {return {
        /**
         * @member {String} className='RealWorld2.view.article.HelixContainer'
         * @private
         */
        className: 'RealWorld2.view.article.HelixContainer'
    }}
}

Neo.applyClassConfig(HelixContainer);

export {HelixContainer as default};