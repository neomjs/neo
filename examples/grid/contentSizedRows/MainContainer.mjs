import CheckBox      from '../../../src/form/field/CheckBox.mjs';
import GridContainer from '../../../src/grid/Container.mjs';
import MainStore     from './MainStore.mjs';
import NumberField   from '../../../src/form/field/Number.mjs';
import Toolbar       from '../../../src/toolbar/Base.mjs';
import Viewport      from '../../../src/container/Viewport.mjs';

/**
 * @summary Content-sized rows on 100k records: each row is as tall as its longest wrapped text.
 *
 * `title` wraps in the locked start body, `summary` in the center, `notes` in the locked end body, and `details`
 * in a center column that starts past the horizontal range. The checkbox switches the grid back to fixed-height
 * rows, the control, and "Jump to row" scrolls a row into view.
 * @class Neo.examples.grid.contentSizedRows.MainContainer
 * @extends Neo.container.Viewport
 */
class MainContainer extends Viewport {
    static config = {
        /**
         * @member {String} className='Neo.examples.grid.contentSizedRows.MainContainer'
         * @protected
         */
        className: 'Neo.examples.grid.contentSizedRows.MainContainer',
        /**
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
         */
        layout: {ntype: 'vbox', align: 'stretch'},
        /**
         * @member {Object[]} items
         */
        items: [{
            module: Toolbar,
            flex  : 'none',
            items : [{
                module    : CheckBox,
                checked   : true,
                hideLabel : true,
                listeners : {change: 'up.onContentSizedChange'},
                reference : 'content-sized',
                valueLabel: 'Content-sized rows'
            }, {
                module       : NumberField,
                labelPosition: 'inline',
                labelText    : 'Jump to row',
                listeners    : {change: 'up.onJumpToRowChange'},
                maxValue     : 100000,
                minValue     : 1,
                reference    : 'jump-to-row',
                style        : {marginLeft: '1em'},
                width        : 160
            }]
        }, {
            module          : GridContainer,
            contentSizedRows: true,
            flex            : 1,
            reference       : 'grid',
            store           : MainStore,
            columns         : [
                {dataField: 'id',      locked: 'start', text: '#',       width: 70},
                {dataField: 'title',   locked: 'start', text: 'Title',   width: 160, wrapText: true},
                {dataField: 'summary',                  text: 'Summary', width: 280, wrapText: true},
                {dataField: 'owner',                    text: 'Owner',   width: 110},
                {dataField: 'status',                   text: 'Status',  width: 110},
                {dataField: 'country',                  text: 'Country', width: 120},
                {dataField: 'score',                    text: 'Score',   width: 90},
                {dataField: 'details',                  text: 'Details', width: 240, wrapText: true},
                {dataField: 'notes',   locked: 'end',   text: 'Notes',   width: 160, wrapText: true}
            ]
        }]
    }

    /**
     * @param {Object} data
     * @param {Boolean} data.value
     */
    onContentSizedChange({value}) {
        this.getReference('grid').contentSizedRows = value
    }

    /**
     * Scrolls the row into view, through the path keyboard navigation takes
     * @param {Object} data
     * @param {Number|null} data.value The row number, 1-based
     */
    onJumpToRowChange({value}) {
        value > 0 && this.getReference('grid').view.scrollByRows(0, value - 1)
    }
}

export default Neo.setupClass(MainContainer);
