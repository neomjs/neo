import Base from './Base.mjs';

/**
 * Addon to register WebComponents
 * @class Neo.main.addon.WebComponent
 * @extends Neo.main.addon.Base
 */
class WebComponent extends Base {
    static config = {
        /**
         * @member {String} className='Neo.main.addon.WebComponent'
         * @protected
         */
        className: 'Neo.main.addon.WebComponent'
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);
        this.registerElementLoader()
    }

    /**
     *
     */
    registerElementLoader() {
        customElements.define('element-loader', class extends HTMLElement {
            async connectedCallback() {
                let me = this,
                    content, styles;

                // move OPs will trigger the connectedCallback() again
                if (!me.shadowRoot) {
                    content = await (await fetch(me.getAttribute('src'))).text();

                    me.attachShadow({mode: 'open'}).innerHTML = content;

                    styles = me.querySelector('style');
                    styles && me.shadowRoot.append(styles)
                }
            }
        });
    }
}

Neo.setupClass(WebComponent);

export default WebComponent;
