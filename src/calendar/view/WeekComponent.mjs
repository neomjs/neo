import {default as Component} from '../../component/Base.mjs';
import TimeAxisComponent      from './TimeAxisComponent.mjs';
import {default as VDomUtil}  from '../../util/VDom.mjs';

/**
 * @class Neo.calendar.view.WeekComponent
 * @extends Neo.container.Base
 */
class WeekComponent extends Component {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.calendar.view.WeekComponent'
         * @protected
         */
        className: 'Neo.calendar.view.WeekComponent',
        /**
         * @member {String} ntype='calendar-view-weekComponent'
         * @protected
         */
        ntype: 'calendar-view-weekComponent',
        /**
         * @member {String[]} cls=['neo-calendar-weekcomponent']
         */
        cls: ['neo-calendar-weekcomponent'],
        /**
         * @member {Object} timeAxis=null
         */
        timeAxis: null,
        /**
         * @member {Object} timeAxisConfig=null
         */
        timeAxisConfig: null,
        /**
         * @member {Object} vdom
         */
        vdom: {
            cn: [{
                cls: ['neo-header-row'],
                cn : [{
                    cls: ['neo-top-left-corner']
                }]
            }, {
                cls: ['neo-c-w-body'],
                cn : [{
                    cls  : ['neo-c-w-content'],
                    cn   : [],
                    flag : 'neo-c-w-content',
                    style: {}
                }]
            }]
        }
    }}

    /**
     *
     * @param {Object} config
     */
    constructor(config) {
        super(config);

        let me        = this,
            headerRow = me.getVdomHeaderRow(),
            i         = 0,
            columnCls, content;

        me.timeAxis = Neo.create(TimeAxisComponent, {
            listeners: {
                heightChange: me.adjustTotalHeight,
                scope       : me
            },
            ...me.timeAxisConfig || {}
        });

        me.vdom.cn[1].cn.unshift(me.timeAxis.vdom);

        content = me.getVdomContent();

        for (; i < 7; i++) {
            columnCls = ['neo-c-w-column'];

            if (i === 0 || i === 6) { // todo: startWeekday
                columnCls.push('neo-weekend');
            }

            content.cn.push({
                cls: columnCls
            });

            headerRow.cn.push({
                cls: ['neo-header-row-item'],
                cn : [{
                    cls: ['neo-day'],
                    html: 'Sun'
                }, {
                    cls: ['neo-date'],
                    html: '19'
                }]
            });
        }
    }

    /**
     *
     * @param {Object} data
     * @param {Neo.component.Base} data.component
     * @param {Number} data.rowHeight
     * @param {Number} data.rowsPerItem
     * @param {Number} data.totalHeight
     */
    adjustTotalHeight(data) {
        let me          = this,
            rowHeight   = data.rowHeight,
            rowsPerItem = data.rowsPerItem,
            vdom        = me.vdom,
            i           = 0,
            gradient    = [];

        for (; i < rowsPerItem; i++) {
            gradient.push(
                `var(--c-w-background-color) ${i * rowHeight + i}px`,
                `var(--c-w-background-color) ${(i + 1) * rowHeight + i}px`,
                'var(--c-w-border-color) 0'
            );
        }

        Object.assign(me.getVdomContent().style, {
            backgroundImage: `linear-gradient(${gradient.join(',')})`,
            backgroundSize : `1px ${rowsPerItem * rowHeight + rowsPerItem}px`,
            height         : `${data.totalHeight - rowHeight}px`,
            maxHeight      : `${data.totalHeight - rowHeight}px`
        });

        me.vdom = vdom;
    }

    /**
     *
     */
    getVdomContent() {
        return VDomUtil.getByFlag(this.vdom, 'neo-c-w-content');
    }

    /**
     *
     */
    getVdomHeaderRow() {
        return this.vdom.cn[0];
    }
}

Neo.applyClassConfig(WeekComponent);

export {WeekComponent as default};