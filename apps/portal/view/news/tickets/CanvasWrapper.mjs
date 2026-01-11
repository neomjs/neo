import Container        from '../../../../../src/container/Base.mjs';
import ContentComponent from './Component.mjs';
import TimelineCanvas   from './TimelineCanvas.mjs';

/**
 * @class Portal.view.news.tickets.CanvasWrapper
 * @extends Neo.container.Base
 */
class CanvasWrapper extends Container {
    static config = {
        /**
         * @member {String} className='Portal.view.news.tickets.CanvasWrapper'
         * @protected
         */
        className: 'Portal.view.news.tickets.CanvasWrapper',
        /**
         * @member {String[]} cls=['portal-canvas-wrapper']
         */
        cls: ['portal-canvas-wrapper'],
        /**
         * @member {Neo.component.Base|null} contentComponent=ContentComponent
         */
        contentComponent: ContentComponent,
        /**
         * @member {Object} layout=null
         */
        layout: null,
        /**
         * @member {Object} style={minHeight:'100%',overflow:'visible',position:'relative'}
         */
        style: {minHeight: '100%', overflow: 'visible', position: 'relative'}
    }

    construct(config) {
        let me = this;

        config.items = [{
            module: TimelineCanvas,
            style : {
                position     : 'absolute',
                top          : 0,
                left         : 0,
                width        : '100%',
                height       : '100%',
                zIndex       : 2,
                pointerEvents: 'none'
            }
        }, {
            module: config.contentComponent || me.contentComponent,
            style : {
                position: 'relative',
                zIndex  : 1
            },
            listeners: {
                edit   : me.onContentEdit,
                refresh: me.onContentRefresh,
                scope  : me
            }
        }];

        super.construct(config);
    }

    /**
     * @param {Object} data
     */
    onContentEdit(data) {
        this.fire('edit', data)
    }

    /**
     * @param {Object} data
     */
    onContentRefresh(data) {
        this.fire('refresh', data)
    }
}

export default Neo.setupClass(CanvasWrapper);
