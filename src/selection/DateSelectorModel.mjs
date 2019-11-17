import DateUtil from '../util/Date.mjs';
import Model    from './Model.mjs';

/**
 * @class Neo.selection.DateSelectorModel
 * @extends Neo.selection.Model
 */
class DateSelectorModel extends Model {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.selection.DateSelectorModel'
         * @private
         */
        className: 'Neo.selection.DateSelectorModel',
        /**
         * @member {String} ntype='selection-dateselectormodel'
         * @private
         */
        ntype: 'selection-dateselectormodel',
        /**
         * true to stay inside the same column when navigating up or downwards
         * @member {Boolean} stayInColumn=false
         */
        stayInColumn: false
    }}

    /**
     *
     * @param {Object} data
     * @returns {Date}
     */
    getCellDate(data) {
        let selection = this.getSelection(),
            idArray, tmpArray;

        if (selection[0]) {
            idArray = selection[0].split('__');
        } else {
            idArray = data.path[0].id.split('__');
        }

        tmpArray = idArray[1].split('-').map(e => parseInt(e));

        tmpArray[1]--; // the month inside the view is 1 based, a date needs 0 based

        return new Date(...tmpArray);
    }

    /**
     *
     * @param {Object} data
     */
    onKeyDownDown(data) {
        this.onNavKeyRow(data, 7);
    }

    /**
     *
     * @param {Object} data
     */
    onKeyDownLeft(data) {
        this.onNavKeyColumn(data, -1);
    }

    /**
     *
     * @param {Object} data
     */
    onKeyDownRight(data) {
        this.onNavKeyColumn(data, 1);
    }

    /**
     *
     * @param {Object} data
     */
    onKeyDownUp(data) {
        this.onNavKeyRow(data, -7);
    }

    /**
     *
     * @param {Object} data
     * @param {Number} step
     */
    onNavKeyColumn(data, step) {
        let me       = this,
            cellDate = me.getCellDate(data),
            view     = me.view,
            daysInMonth, id, newDay;

        daysInMonth = DateUtil.getDaysInMonth(cellDate);
        newDay      = (cellDate.getDate() + step) % daysInMonth;

        newDay = newDay === 0 ? daysInMonth : newDay;

        id = view.getCellId(cellDate.getFullYear(), cellDate.getMonth() + 1, newDay);

        me.select(id);
        view.focus(id);
    }

    /**
     *
     * @param {Object} data
     * @param {Number} step
     */
    onNavKeyRow(data, step) {
        let me       = this,
            cellDate = me.getCellDate(data),
            view     = me.view,
            daysInMonth, id, newDay;

        daysInMonth = DateUtil.getDaysInMonth(cellDate);
        newDay      = cellDate.getDate() + step;

        if (newDay > daysInMonth) {
            if (!me.stayInColumn) {
                newDay += 1;
            }

            while (newDay > 7) {
                newDay -= step;
            }
        } else if (newDay < 1) {
            if (!me.stayInColumn) {
                newDay -= 1;
            }

            while (newDay < daysInMonth - 6) {
                newDay -= step;
            }
        }

        id = view.getCellId(cellDate.getFullYear(), cellDate.getMonth() + 1, newDay);

        me.select(id);
        view.focus(id);
    }

    /**
     *
     * @param {Neo.component.Base} component
     */
    register(component) {
        super.register(component);

        let me   = this,
            id   = me.id,
            view = me.view;

        if (view.keys) {
            view.keys._keys.push(
                {fn: 'onKeyDownDown'  ,key: 'Down'  ,scope: id},
                {fn: 'onKeyDownLeft'  ,key: 'Left'  ,scope: id},
                {fn: 'onKeyDownRight' ,key: 'Right' ,scope: id},
                {fn: 'onKeyDownUp'    ,key: 'Up'    ,scope: id}
            );
        }
    }

    /**
     *
     */
    unregister() {
        let me   = this,
            id   = me.id,
            view = me.view;

        if (view.keys) {
            view.keys.removeKeys([
                {fn: 'onKeyDownDown'  ,key: 'Down'  ,scope: id},
                {fn: 'onKeyDownLeft'  ,key: 'Left'  ,scope: id},
                {fn: 'onKeyDownRight' ,key: 'Right' ,scope: id},
                {fn: 'onKeyDownUp'    ,key: 'Up'    ,scope: id}
            ]);
        }

        super.unregister();
    }
}

Neo.applyClassConfig(DateSelectorModel);

export {DateSelectorModel as default};