import Container from '../../../src/container/Base.mjs';

/**
 * @class SharedCovid.view.FooterContainer
 * @extends Neo.container.Base
 */
class FooterContainer extends Container {
    static config = {
        /**
         * @member {String} className='SharedCovid.view.FooterContainer'
         * @protected
         */
        className: 'SharedCovid.view.FooterContainer',
        /**
         * @member {Number} height=20
         * @reactive
         */
        height: 25,
        /**
         * @member {Object} layout={ntype: 'hbox'}
         * @reactive
         */
        layout: {ntype: 'hbox'},
        /**
         * @member {String} reference='footer'
         * @reactive
         */
        reference: 'footer',
        /**
         * @member {Object} style={overflow: 'visible'}
         */
        style: {overflow: 'visible'},
        /**
         * @member {Object} itemDefaults
         */
        itemDefaults: {
            ntype: 'component',
            cls  : ['neo-link-color'],
            style: {fontSize: '13px', padding: '10px', paddingTop: 0}
        },
        /**
         * @member {Array} items
         */
        items: [{
            html : 'App created with <a target="_blank" href="https://github.com/neomjs/neo">neo.mjs</a>.'
        }, {
            flex: 1
        }, {
            html : 'Data provided by <a target="_blank" href="https://github.com/disease-sh/API">disease-sh/API</a>.'
        }, {
            flex: 1
        }, {
            html : 'Country Flag Icons made by <a target="_blank" href="https://www.flaticon.com/authors/freepik" title="Freepik">Freepik</a> from <a target="_blank" href="https://www.flaticon.com/" title="Flaticon"> www.flaticon.com</a>.'
        }, {
            ntype  : 'button',
            cls    : ['neo-button'],
            handler: 'onRemoveFooterButtonClick',
            height : 24,
            style  : {margin: 0, marginRight: '10px', marginTop: '-5px'},
            text   : 'Remove Footer'
        }]
    }
}

export default Neo.setupClass(FooterContainer);
