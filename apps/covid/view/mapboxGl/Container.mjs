import {default as BaseContainer} from '../../../../src/container/Base.mjs';
import CheckBox                   from '../../../../src/form/field/CheckBox.mjs';
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
            height      : 200,
            ignoreLayout: true,

            containerConfig: {
                style: {
                    opacity: 0.6,
                    padding: '10px'
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
                module   : CheckBox,
                checked  : true,
                labelText: 'Show Terrain'
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
        layout: {ntype: 'fit'},

        /**
         * @member {Object} _vdom
         */
        _vdom: {
            style: {position: 'relative', height: '100%', width: '100%'},
            cn: [{
                style: {position: 'absolute', height: '100%', width: '100%'},
                cn: [{
                    style: {height: '100%'},
                    cn: []
                }]
            }]
        }
    }}

    /**
     *
     */
    getVdomRoot() {
        return this.vdom.cn[0].cn[0];
    }

    /**
     *
     */
    getVnodeRoot() {
        return this.vnode.childNodes[0].childNodes[0];
    }
}

Neo.applyClassConfig(Container);

export {Container as default};