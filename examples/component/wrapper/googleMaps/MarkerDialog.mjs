import DialogBase from '../../../../src/dialog/Base.mjs';

/**
 * @class Neo.examples.component.wrapper.googleMaps.MarkerDialog
 * @extends Neo.dialog.Base
 */
class MarkerDialog extends DialogBase {
    static config = {
        className: 'Neo.examples.component.wrapper.googleMaps.MarkerDialog',

        // turn off dragging and resizing
        draggable           : false,
        resizable           : false,

        // custom property
        record_: null,

        containerConfig: {style: {padding: '10px'}},
        headerConfig: {actions: ['close']},
        // custom config used to align the popup
        offsetConfig: {x: -15,y: -15},

        items: [{
            ntype: 'component',
            cls  : ['detail-container'],
            vdom : {/* here goes the itemTpl */}
        }],

        itemTpl: data => [
            {cls: ['detail-depth'],   innerHTML: `Depth: ${data.depth}`},
            {cls: ['detail-date'],    innerHTML: `${data.visualDate}`},
            {cls: ['detail-quality'], innerHTML: `Quality: ${data.quality}`},
            {cls: ['detail-quality'], innerHTML: `Size: ${data.size}`}
        ]
    }

    /**
     * Update the view based on the data
     * @param value
     * @param oldValue
     *
     * @example
     *      depth: 11.9
     *      humanReadableLocation: "19,9 km N af Sigöldustöð"
     *      latitude: 64.35
     *      longitude : -19.173
     *      quality: 53.79
     *      size: 0.9
     *      timestamp: "2017-10-11T18:34:56.000Z"
     */
    afterSetRecord(value, oldValue) {
        let me              = this,
            outputContainer = me.items[0],
            vdom            = outputContainer.vdom;

        value.visualDate = me.calcVisualDate(value.timestamp);

        me.title = `${value.humanReadableLocation} | ${value.size}`;
        vdom.cn  = me.itemTpl(value);
    }

    calcVisualDate(dateString) {
        const date = new Date(dateString),
            day = date.toLocaleDateString('en-US', { day: 'numeric' }),
            month = date.toLocaleDateString('en-US', { month: 'short' }),
            year = date.toLocaleDateString('en-US', { year: 'numeric' }),
            hour = date.toLocaleTimeString('en-US', { hour: 'numeric', hour12: false }),
            minute = date.toLocaleTimeString('en-US', { minute: 'numeric' });

        return `${day}. ${month} <b>${year}</b> ${hour}:${minute}`
    }

    async onRender(data, automount) {
        super.onRender(data, automount)

        let me = this;

        /**
         * Center on Map
         */
        // let futureParent = Neo.getComponent(me.boundaryContainerId),
        //     futureParentRect = await futureParent.getDomRect(),
        //     rect = await me.getDomRect();
        //
        // me.wrapperStyle = {
        //     top: (futureParentRect.top + (futureParentRect.height - rect.height) / 2) + 'px',
        //     left: (futureParentRect.left + (futureParentRect.width - rect.width) / 2) + 'px',
        //     height: me.height,
        //     width: me.width
        // }

        /**
         * Add to click position
         */
        me.wrapperStyle = {
            top: me.domEvent.clientY + me.offsetConfig.y + 'px',
            left: me.domEvent.clientX + me.offsetConfig.x + 'px',
            height: me.height,
            width: me.width
        }
    }
}

Neo.applyClassConfig(MarkerDialog);

export default MarkerDialog;
