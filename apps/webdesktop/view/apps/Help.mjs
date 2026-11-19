import Markdown from '../../../../src/component/Markdown.mjs';

/**
 * @summary The Help app: the desktop's guide, a Markdown file shipped with the demo's data
 * (`resources/data/help.md`), rendered by the engine's Markdown component.
 * @class WebDesktop.view.apps.Help
 * @extends Neo.component.Markdown
 */
class Help extends Markdown {
    static config = {
        /**
         * @member {String} className='WebDesktop.view.apps.Help'
         * @protected
         */
        className: 'WebDesktop.view.apps.Help',
        /**
         * @member {String[]} cls=['webdesktop-help']
         */
        cls: ['webdesktop-help'],
        /**
         * Resolved like the demo's stores resolve their data files
         * @member {String} url='../../apps/webdesktop/resources/data/help.md'
         */
        url: '../../apps/webdesktop/resources/data/help.md'
    }

    /**
     * Loads the guide once the window's view exists.
     * @returns {Promise<void>}
     */
    async initAsync() {
        await super.initAsync();

        let me       = this,
            response = await me.trap(fetch(me.url));

        me.value = await me.trap(response.text())
    }
}

export default Neo.setupClass(Help);
