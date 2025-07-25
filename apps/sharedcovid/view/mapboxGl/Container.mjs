import BaseContainer       from '../../../../src/container/Base.mjs';
import CheckBox            from '../../../../src/form/field/CheckBox.mjs';
import Component           from './Component.mjs';
import ContainerController from './ContainerController.mjs';
import Panel               from '../../../../src/container/Panel.mjs';

/**
 * @class SharedCovid.view.mapboxGl.Container
 * @extends Neo.container.Base
 */
class Container extends BaseContainer {
    static config = {
        /**
         * @member {String} className='SharedCovid.view.mapboxGl.Container'
         * @protected
         */
        className: 'SharedCovid.view.mapboxGl.Container',
        /**
         * @member {String} ntype='covid-mapboxgl-container'
         * @protected
         */
        ntype: 'covid-mapboxgl-container',
        /**
         * @member {Neo.controller.Component} controller=ContainerController
         * @reactive
         */
        controller: ContainerController,
        /**
         * @member {Object[]} items
         */
        items: [{
            module      : Panel,
            height      : 150,
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
                    ntype  : 'button',
                    handler: 'onWindowMapMaximizeButtonClick',
                    iconCls: 'far fa-window-maximize'
                }, {
                    ntype: 'label',
                    text : 'Map Controls'
                }],
                style: {
                    opacity: 1
                }
            }],

            itemDefaults: {
                module    : CheckBox,
                flex      : '0 1 auto',
                labelWidth: 100
            },

            items: [{
                checked  : true,
                labelText: 'Detail Circles',
                listeners: {change: 'onDetailCirclesChange'}
            }, {
                checked  : true,
                labelText: 'HeatMap',
                listeners: {change: 'onHeatMapChange'},
                style    : {marginTop: '5px'}
            }, {
                checked  : true,
                labelText: 'Terrain',
                listeners: {change: 'onTerrainChange'},
                style    : {marginTop: '5px'}
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
         * @reactive
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
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this,

        map = Neo.create({
            module   : Component,
            appName  : me.appName,
            parentId : me.id,
            reference: 'mapboxglmap',

            stateProvider: {
                parent: me.getStateProvider()
            }
        });

        me.items.unshift(map);
    }

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

export default Neo.setupClass(Container);
