import {default as BaseContainer} from '../../../../src/container/Base.mjs';
import Component                  from './Component.mjs';
import Panel                      from '../../../../src/container/Panel.mjs';

/**
 * @class Covid.view.mapboxGl.Container
 * @extends Neo.container.Base
 */
class Container extends BaseContainer {
    static getConfig() {return {
        /**
         * @member {String} className='Covid.view.mapboxGl.Container'
         * @private
         */
        className: 'Covid.view.mapboxGl.Container',
        /**
         * @member {String} ntype='covid-mapboxgl-container'
         * @private
         */
        ntype: 'covid-mapboxgl-container',
        /**
         * @member {Object[]} items
         */
        items: [{
            module   : Component,
            reference: 'mapboxglmap'
        }, {
            module      : Panel,
            ignoreLayout: true,

            headers: [{
                dock: 'top',
                items: [{
                    ntype: 'button',
                    text : 'X'
                }, {
                    ntype    : 'label',
                    reference: 'historical-data-label',
                    text     : 'Historical Data'
                }]
            }],

            items: [{
                ntype: 'component',
                vdom : {
                    html: 'Hello World!'
                }
            }]
        }],
        /**
         * @member {Object} layout={ntype: 'fit'}
         */
        layout: {ntype: 'fit'}
    }}
}

Neo.applyClassConfig(Container);

export {Container as default};