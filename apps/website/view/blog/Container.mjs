import {default as BaseContainer} from '../../../../src/container/Base.mjs';
import List                       from './List.mjs';
import {default as SearchField}   from '../../../../src/form/field/Search.mjs';
import Toolbar                    from '../../../../src/container/Toolbar.mjs';

/**
 * @class Website.view.blog.Container
 * @extends Neo.container.Base
 */
class Container extends BaseContainer {
    static getConfig() {return {
        /**
         * @member {String} className='Website.view.blog.Container'
         * @protected
         */
        className: 'Website.view.blog.Container',
        /**
         * @member {Array} items
         */
        items: [{
            module: Toolbar,
            height: 40,

            items: [{
                module         : SearchField,
                placeholderText: 'Filter Items',
                style          : {padding: '10px'},
                width          : 240
            }]
        }, {
            module: List,
            flex  : 1
        }],
        /**
         * @member {Object} layout={ntype: 'vbox', align: 'stretch'}
         */
        layout: {ntype: 'vbox', align: 'stretch'}
    }}
}

Neo.applyClassConfig(Container);

export {Container as default};