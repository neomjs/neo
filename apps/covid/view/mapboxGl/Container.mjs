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

            containerConfig: {
                style: {
                    opacity: 0.6
                }
            },

            headers: [{
                dock: 'top',
                items: [{
                    ntype: 'button',
                    text : 'X'
                }, {
                    ntype: 'label',
                    text : 'Map Controls'
                }],
                style: {
                    opacity: 1
                }
            }],

            items: [{
                ntype : 'component',
                height: 200,
                vdom  : {
                    html: 'Hello World!'
                }
            }],

            style: {
                backgroundColor: 'transparent',
                position       : 'absolute',
                right          : '10px',
                top            : '10px'
            }
        }],
        /**
         * @member {Object} layout={ntype: 'fit'}
         */
        layout: {ntype: 'fit'}
    }}
}

Neo.applyClassConfig(Container);

export {Container as default};