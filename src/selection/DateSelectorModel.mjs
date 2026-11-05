import DateUtil from '../util/Date.mjs';
import Model    from './Model.mjs';

/**
 * @class Neo.selection.DateSelectorModel
 * @extends Neo.selection.Model
 * @summary Navigates calendar days with immediate selection or an uncommitted destination selected on Enter.
 */
class DateSelectorModel extends Model {
    static config = {
        /**
         * @member {String} className='Neo.selection.DateSelectorModel'
         * @protected
         */
        className: 'Neo.selection.DateSelectorModel',
        /**
         * @member {String} ntype='selection-dateselectormodel'
         * @protected
         */
        ntype: 'selection-dateselectormodel',
        /**
         * @member {String} navigationCls='neo-navigated'
         */
        navigationCls: 'neo-navigated',
        /**
         * The uncommitted keyboard destination; selection items remain committed.
         * @member {String|null} navigationId=null
         * @protected
         */
        navigationId: null,
        /**
         * True selects on arrow navigation; false highlights a destination and commits on Enter.
         * @member {Boolean} selectOnNavigate=true
         */
        selectOnNavigate: true,
        /**
         * true to stay inside the same column when navigating up or downwards
         * @member {Boolean} stayInColumn=false
         */
        stayInColumn: false,
        /**
         * true to stay inside the current month when navigating with the arrow keys,
         * false to walk into adjacent months and years.
         * @member {Boolean} stayInMonth=true
         */
        stayInMonth: true
    }

    /**
     * @summary Reads the uncommitted destination first when navigation and selection are separate.
     * @param {Object} data
     * @returns {Date}
     */
    getCellDate(data) {
        let selection    = this.getSelection(),
            navigationId = !this.selectOnNavigate && this.navigationId,
            idArray;

        if (navigationId) {
            idArray = navigationId.split('__')
        } else if (selection[0]) {
            idArray = selection[0].split('__')
        } else {
            idArray = data.path[0].id.split('__')
        }

        return this.view.dateFromValue(idArray[1])
    }

    /**
     * @param {Object} data
     */
    onKeyDownDown(data) {
        this.onNavKeyRow(data, 7)
    }

    /**
     * @summary Commits the keyboard destination without changing default select-on-navigation behavior.
     * @param {Object} data
     */
    onKeyDownEnter(data) {
        if (!this.selectOnNavigate) {
            let id = this.navigationId || this.items[0];

            id && this.view.selectDate(id.split('__')[1])
        }
    }

    /**
     * @param {Object} data
     */
    onKeyDownLeft(data) {
        this.onNavKeyColumn(data, -1)
    }

    /**
     * @param {Object} data
     */
    onKeyDownRight(data) {
        this.onNavKeyColumn(data, 1)
    }

    /**
     * @param {Object} data
     */
    onKeyDownUp(data) {
        this.onNavKeyRow(data, -7)
    }

    /**
     * @summary Wraps within the current month when `stayInMonth` is `true`, or walks into adjacent months/years when `false`.
     * @param {Object} data
     * @param {Number} step
     */
    onNavKeyColumn(data, step) {
        let me           = this,
            cellDate     = me.getCellDate(data),
            initialMonth = cellDate.getMonth(),
            initialYear  = cellDate.getFullYear(),
            {view}       = me,
            daysInMonth, id, newDay;

        if (me.stayInMonth) {
            daysInMonth = DateUtil.getDaysInMonth(cellDate);
            newDay      = (cellDate.getDate() + step) % daysInMonth;

            newDay = newDay === 0 ? daysInMonth : newDay
        } else {
            cellDate.setDate(cellDate.getDate() + step);
            newDay = cellDate.getDate()
        }

        id = view.getCellId(cellDate.getFullYear(), cellDate.getMonth() + 1, newDay);

        me.navigate(id);

        if (me.selectOnNavigate && cellDate.getMonth() === initialMonth && cellDate.getFullYear() === initialYear) {
            view.focus(id)
        }
    }

    /**
     * @summary Folds back into the current month when `stayInMonth` is `true`, or walks into adjacent months/years when `false`.
     * @param {Object} data
     * @param {Number} step
     */
    onNavKeyRow(data, step) {
        let me           = this,
            cellDate     = me.getCellDate(data),
            initialMonth = cellDate.getMonth(),
            initialYear  = cellDate.getFullYear(),
            {view}       = me,
            daysInMonth, id, newDay;

        if (me.stayInMonth) {
            daysInMonth = DateUtil.getDaysInMonth(cellDate);
            newDay      = cellDate.getDate() + step;

            if (newDay > daysInMonth) {
                if (!me.stayInColumn) {
                    newDay += 1
                }

                while (newDay > 7) {
                    newDay -= step
                }
            } else if (newDay < 1) {
                if (!me.stayInColumn) {
                    newDay -= 1
                }

                while (newDay < daysInMonth - 6) {
                    newDay -= step
                }
            }
        } else {
            cellDate.setDate(cellDate.getDate() + step);
            newDay = cellDate.getDate()
        }

        id = view.getCellId(cellDate.getFullYear(), cellDate.getMonth() + 1, newDay);

        me.navigate(id);

        if (me.selectOnNavigate && cellDate.getMonth() === initialMonth && cellDate.getFullYear() === initialYear) {
            view.focus(id)
        }
    }

    /**
     * @summary Routes arrow movement to committed selection or to the view's uncommitted date display.
     * @param {String} id
     * @protected
     */
    navigate(id) {
        if (this.selectOnNavigate) {
            this.select(id)
        } else {
            this.navigationId = id;
            this.view.navigateToDate(this.view.dateFromValue(id.split('__')[1]))
        }
    }

    /**
     * @summary Removes the temporary keyboard annotation when a selection replaces it.
     */
    clearNavigation() {
        if (this.navigationId) {
            let node = this.view.getVdomChild(this.navigationId);

            if (node) {
                node.cls = node.cls.filter(cls => cls !== this.navigationCls)
            }

            this.navigationId = null;
            this.view.update()
        }
    }

    /**
     * @param {Neo.component.Base} component
     */
    register(component) {
        super.register(component);

        let scope  = {scope: this.id},
            {view} = this;

        view.keys?._keys.push(
            {fn: 'onKeyDownDown'  ,key: 'Down'  ,...scope},
            {fn: 'onKeyDownEnter' ,key: 'Enter' ,...scope},
            {fn: 'onKeyDownLeft'  ,key: 'Left'  ,...scope},
            {fn: 'onKeyDownRight' ,key: 'Right' ,...scope},
            {fn: 'onKeyDownUp'    ,key: 'Up'    ,...scope}
        )
    }

    /**
     * @returns {Object}
     */
    toJSON() {
        return {
            ...super.toJSON(),
            navigationCls   : this.navigationCls,
            selectOnNavigate: this.selectOnNavigate,
            stayInColumn    : this.stayInColumn,
            stayInMonth     : this.stayInMonth
        }
    }

    /**
     *
     */
    unregister() {
        let scope  = {scope: this.id},
            {view} = this;

        view.keys?.removeKeys([
            {fn: 'onKeyDownDown'  ,key: 'Down'  ,...scope},
            {fn: 'onKeyDownEnter' ,key: 'Enter' ,...scope},
            {fn: 'onKeyDownLeft'  ,key: 'Left'  ,...scope},
            {fn: 'onKeyDownRight' ,key: 'Right' ,...scope},
            {fn: 'onKeyDownUp'    ,key: 'Up'    ,...scope}
        ]);

        super.unregister()
    }
}

export default Neo.setupClass(DateSelectorModel);
