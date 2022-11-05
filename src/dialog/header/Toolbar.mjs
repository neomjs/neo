import Base from '../../toolbar/Base.mjs';

/**
 * @class Neo.dialog.header.Toolbar
 * @extends Neo.toolbar.Base
 */
class Toolbar extends Base {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.dialog.header.Toolbar'
         * @protected
         */
        className: 'Neo.dialog.header.Toolbar',
        /**
         * @member {String[]|null} actions=['close','maximise']
         */
        actions: ['close', 'maximise']
    }}

    createItems() {
        let me    = this,
            items = me.items || [];

        if (me.actions) {
            items.push('->');

            me.actions.forEach(action => {
                switch(action) {
                    case 'close': {
                        items.push({
                            flag   : 'close-button',
                            iconCls: 'far fa-window-close'
                            //handler: me.closeOrHide.bind(me)
                        });
                        break;
                    }
                }
            })
        }

        me.items = items;
        console.log(me.actions, me.items);

        super.createItems();
    }
}

Neo.applyClassConfig(Toolbar);

export default Toolbar;
