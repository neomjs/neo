import {default as Component} from '../../component/Base.mjs';

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
                    cls: ['neo-time-axis'],
                    cn : []
                }, {
                    cls: ['neo-c-w-content'],
                    cn : []
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
            content   = me.getVdomContent(),
            headerRow = me.getVdomHeaderRow(),
            timeAxis  = me.getVdomTimeAxis(),
            i         = 0,
            columnCls, html;

        for (; i < 7; i++) {
            columnCls = ['neo-c-w-column'];

            if (i === 0 || i === 6) {
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

        for (i=1; i < 25; i++) {
            html = i === 24 ? '00:00' : (i < 10 ? '0' : '') + i + ':00';

            timeAxis.cn.push({
                cls: ['neo-c-w-timeaxis-item'],
                cn : [{
                    html: html
                }]
            });
        }
    }

    /**
     *
     */
    getVdomContent() {
        return this.vdom.cn[1].cn[1];
    }

    /**
     *
     */
    getVdomHeaderRow() {
        return this.vdom.cn[0];
    }

    /**
     *
     */
    getVdomTimeAxis() {
        return this.vdom.cn[1].cn[0];
    }
}

Neo.applyClassConfig(WeekComponent);

export {WeekComponent as default};