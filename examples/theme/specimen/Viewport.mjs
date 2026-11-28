import Button     from '../../../src/button/Base.mjs';
import Component  from '../../../src/component/Base.mjs';
import Container  from '../../../src/container/Base.mjs';
import Viewport   from '../../../src/container/Viewport.mjs';
import Form       from '../../../src/form/Container.mjs';
import ComboBox   from '../../../src/form/field/ComboBox.mjs';
import TextField  from '../../../src/form/field/Text.mjs';
import Grid       from '../../../src/grid/Container.mjs';
import CellRow    from '../../../src/selection/grid/CellRowModel.mjs';
import Controller from './ViewportController.mjs';

/**
 * @summary Gives theme authors one seeded scene with real controls for pair and state comparisons.
 * @class Neo.examples.theme.specimen.Viewport
 * @extends Neo.container.Viewport
 */
class SpecimenViewport extends Viewport {
    static config = {
        /**
         * @member {String} className='Neo.examples.theme.specimen.Viewport'
         * @protected
         */
        className: 'Neo.examples.theme.specimen.Viewport',
        /**
         * @member {String[]} cls=['neo-specimen']
         */
        cls: ['neo-specimen'],
        /**
         * @member {Neo.controller.Component} controller=Controller
         */
        controller: Controller,
        /**
         * @member {Object[]} items
         * @reactive
         */
        items: [{
            module: Component,
            tag   : 'h1',
            text  : 'Theme specimen'
        }, {
            module   : Container,
            cls      : ['neo-specimen-themes'],
            layout   : 'base',
            reference: 'themes'
        }, {
            module: Container,
            cls   : ['neo-specimen-stage'],
            layout: 'base',
            items : [{
                module: Container,
                layout: {ntype: 'vbox', align: 'stretch'},
                items : [{
                    module: Component,
                    tag   : 'h2',
                    text  : 'Records'
                }, {
                    module     : Grid,
                    body       : {highlightModifiedCells: true},
                    cellEditing: true,
                    height     : 230,
                    id         : 'specimen-grid',
                    viewConfig : {selectionModel: CellRow},
                    columns    : [{
                        dataField: 'id',
                        text     : 'Record',
                        width    : 86
                    }, {
                        dataField: 'name',
                        editable : true,
                        text     : 'Name',
                        width    : 156
                    }, {
                        dataField: 'role',
                        editable : true,
                        text     : 'Role',
                        width    : 140
                    }],
                    store: {
                        model: {trackModifiedFields: true, fields: [
                            {name: 'id', type: 'Int'},
                            {name: 'name', type: 'String'},
                            {name: 'role', type: 'String'}
                        ]},
                        data: [
                            {id: 101, name: 'Atlas', role: 'Editor'},
                            {id: 102, name: 'Beacon', role: 'Reviewer'},
                            {id: 103, name: 'Cedar', role: 'Author'},
                            {id: 104, name: 'Drift', role: 'Reader'}
                        ]
                    }
                }]
            }, {
                module: Form,
                layout: {ntype: 'vbox', align: 'stretch'},
                cls   : ['neo-specimen-form'],
                items : [{
                    module: Component,
                    tag   : 'h2',
                    text  : 'Details'
                }, {
                    module       : TextField,
                    id           : 'specimen-note',
                    labelPosition: 'top',
                    labelText    : 'Note',
                    value        : 'Review palette'
                }, {
                    module       : ComboBox,
                    displayField : 'text',
                    id           : 'specimen-picker',
                    labelPosition: 'top',
                    labelText    : 'Status',
                    queryMode    : 'local',
                    value        : 'draft',
                    valueField   : 'id',
                    store        : {
                        model: {fields: [
                            {name: 'id', type: 'String'},
                            {name: 'text', type: 'String'}
                        ]},
                        data : [
                            {id: 'draft', text: 'Draft'},
                            {id: 'review', text: 'In review'},
                            {id: 'ready', text: 'Ready'}
                        ]
                    }
                }, {
                    module       : TextField,
                    disabled     : true,
                    id           : 'specimen-disabled',
                    labelPosition: 'top',
                    labelText    : 'Locked field',
                    value        : 'Reference value'
                }, {
                    module : Button,
                    handler: 'showToast',
                    text   : 'Show toast',
                    ui     : 'primary'
                }]
            }]
        }],
        /**
         * @member {String} layout='base'
         */
        layout: 'base'
    }

    /**
     * @summary Labels the configured theme choices and keeps their buttons on the same mounted scene.
     */
    onConstructed() {
        super.onConstructed();

        let me     = this,
            params = new URLSearchParams(Neo.config.url.search),
            light  = params.get('light'),
            dark   = params.get('dark'),
            blind  = params.get('blind') === '1',
            pairs  = [[blind ? 'A' : 'Neo', 'neo-theme-neo-light', 'neo-theme-neo-dark']];

        if (light && dark) {
            pairs.push([blind ? 'B' : 'Pair', light, dark])
        }

        me.getReference('themes').add(pairs.flatMap(([label, lightTheme, darkTheme]) => [
            {scheme: 'Light', theme: lightTheme},
            {scheme: 'Dark', theme: darkTheme}
        ].map(({scheme, theme}) => ({
            module   : Button,
            handler  : () => me.controller.selectTheme(theme),
            modelData: {theme},
            pressed  : me.getTheme() === theme,
            text     : label + ' ' + scheme
        }))))
    }
}

export default Neo.setupClass(SpecimenViewport);
