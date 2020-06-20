import Container from '../../../../src/container/Base.mjs';

/**
 * @class RealWorld2.view.article.DetailsContainer
 * @extends Neo.form.Container
 */
class DetailsContainer extends Container {
    static getConfig() {return {
        /**
         * @member {String} className='RealWorld2.view.article.DetailsContainer'
         * @protected
         */
        className: 'RealWorld2.view.article.DetailsContainer',
        /**
         * @member {Array} items
         */
        items: [{
            ntype: 'component',
            html : 'article.DetailsContainer'
        }],
        /**
         * @member {Object} style
         */
        style: {
            padding: '20px'
        }
    }}
}

Neo.applyClassConfig(DetailsContainer);

export {DetailsContainer as default};