import Container    from '../../container/Base.mjs';
import TabContainer from '../../tab/Container.mjs';

/**
 * @class Neo.calendar.view.SettingsContainer
 * @extends Neo.container.Base
 */
class SettingsContainer extends Container {
    static config = {
        /**
         * @member {String} className='Neo.calendar.view.SettingsContainer'
         * @protected
         */
        className: 'Neo.calendar.view.SettingsContainer',
        /**
         * @member {String[]} baseCls=['neo-calendar-settingscontainer', 'neo-container']
         */
        baseCls: ['neo-calendar-settingscontainer', 'neo-container'],
        /**
         * Read only
         * @member {Boolean} collapsed=false
         */
        collapsed: false,
        /**
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
         * @protected
         * @reactive
         */
        layout: {ntype: 'vbox', align: 'stretch'},
        /**
         * True to only keep the active view inside the DOM
         * @member {Boolean} removeInactiveCards=true
         */
        removeInactiveCards: true
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        if (me.collapsed) {
            me.vdom.removeDom = true
        }
    }

    /**
     * @param {Number} width
     */
    collapse(width) {
        let me    = this,
            style = me.style || {};

        style.marginRight = `-${width}px`;
        me._style         = style; // silent update
        me._vdom.style    = style; // silent update

        me.parent.updateDepth = -1;

        me.parent.promiseUpdate().then(() => {
            me.timeout(400).then(() => {
                me.collapsed = true;

                me.vdom.removeDom = true;
                me.update();

                me.mounted = false
            })
        })
    }

    /**
     *
     */
    createItems() {
        let me = this;

        me.items = [{
            ntype : 'component',
            cls   : ['neo-header'],
            height: 48,
            html  : '<i class="fa fa-cog"></i>Settings'
        }, {
            module             : TabContainer,
            removeInactiveCards: me.removeInactiveCards,

            items: [{
                module: () => import('./settings/GeneralContainer.mjs'),
                flag  : 'general',
                header: {text: 'General'},
                style : {padding: '20px'}
            }, {
                ntype : 'component',
                flag  : 'day',
                header: {text: 'Day'},
                style : {padding: '20px'},
                test  : 'Day'
            }, {
                module: () => import('./settings/WeekContainer.mjs'),
                flag  : 'week',
                header: {text: 'Week'},
                style : {padding: '20px'}
            }, {
                module: () => import('./settings/MonthContainer.mjs'),
                flag  : 'month',
                header: {text: 'Month'},
                style : {padding: '20px'}
            }, {
                module: () => import('./settings/YearContainer.mjs'),
                flag  : 'year',
                header: {text: 'Year'},
                style : {padding: '20px'}
            }],

            listeners: {
                activeIndexChange: me.onCardIndexChange,
                scope            : me
            }
        }];

        super.createItems()
    }

    /**
     *
     */
    expand() {
        let me = this,
            style;

        delete me.vdom.removeDom;

        me.parent.updateDepth = -1;

        me.parent.promiseUpdate().then(() => {
            me.collapsed = false;
            me.mounted   = true;

            me.timeout(50).then(() => {
                style = me.style || {}
                style.marginRight = '0px';
                me.style = style
            })
        })
    }

    /**
     * @returns {Neo.calendar.view.MainContainer}
     */
    getMainContainer() {
        return this.up('calendar-maincontainer')
    }

    /**
     * @param {Object} data
     */
    onCardIndexChange(data) {
        let me            = this,
            container     = data.item,
            mainContainer = me.getMainContainer();

        if (mainContainer) {
            if (Neo.isFunction(container.createContent) && container.items.length < 1) {
                if (Neo.typeOf(mainContainer[`${container.flag}Component`]) !== 'NeoInstance') {
                    mainContainer.on('cardLoaded', () => {
                        me.timeout(30).then(() => {container.createContent()})
                    }, me, {once: true})
                } else {
                    me.timeout(30).then(() => {container.createContent()})
                }
            }

            if (container.flag !== 'general') {
                mainContainer.activeView = container.flag
            }
        }
    }
}

export default Neo.setupClass(SettingsContainer);
