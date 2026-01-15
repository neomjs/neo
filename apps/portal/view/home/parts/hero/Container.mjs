import BaseContainer from '../BaseContainer.mjs';
import Canvas        from './Canvas.mjs';
import Content       from './Content.mjs';

/**
 * @class Portal.view.home.parts.hero.Container
 * @extends Portal.view.home.parts.BaseContainer
 */
class Container extends BaseContainer {
    static config = {
        /**
         * @member {String} className='Portal.view.home.parts.hero.Container'
         * @protected
         */
        className: 'Portal.view.home.parts.hero.Container',
        /**
         * @member {String[]} cls=['portal-home-hero-container']
         * @reactive
         */
        cls: ['portal-home-hero-container'],
        /**
         * @member {Object} domListeners
         */
        domListeners: {
            click     : 'onClick',
            mouseleave: 'onMouseLeave',
            mousemove : {fn: 'onMouseMove', local: true}
        },
        /**
         * @member {Object[]} items
         */
        items: [{
            module   : Canvas,
            reference: 'canvas'
        }, {
            module   : Content,
            reference: 'content'
        }]
    }

    /**
     *
     */
    activate() {
        this.getItem('content').activate();
        this.getItem('canvas')?.resume()
    }

    /**
     *
     */
    deactivate() {
        this.getItem('content').deactivate();
        this.getItem('canvas')?.pause()
    }

    /**
     * @param {Object} data
     */
    onClick(data) {
        this.getItem('canvas')?.onClick(data)
    }

    /**
     * @param {Object} data
     */
    onMouseLeave(data) {
        this.getItem('canvas')?.onMouseLeave(data)
    }

    /**
     * @param {Object} data
     */
    onMouseMove(data) {
        this.getItem('canvas')?.onMouseMove(data)
    }
}

export default Neo.setupClass(Container);