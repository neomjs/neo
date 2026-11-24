import ContentComponent   from '../../../../src/app/content/Component.mjs';
import StringUtil         from '../../../../src/util/String.mjs';
import {rewriteRepoLinks} from '../../Util.mjs';

/**
 * @class Portal.view.learn.Component
 * @extends Neo.app.content.Component
 */
class Component extends ContentComponent {
    static config = {
        /**
         * @member {String} className='Portal.view.learn.Component'
         * @protected
         */
        className: 'Portal.view.learn.Component',
        /**
         * Relative Markdown links inside a guide are rewritten onto the learn route, so the same
         * authored link works for a GitHub reader and inside the app.
         * @member {String} contentRoute='#/learn/'
         */
        contentRoute: '#/learn/',
        /**
         * @member {String} issuesUrl='#/news/tickets/'
         */
        issuesUrl: '#/news/tickets/'
    }

    /**
     * @param {Object} record
     * @returns {String|null}
     */
    getContentPath(record) {
        let path        = this.getStateProvider().getData('contentPath'),
            pagesFolder = path.includes('/learn/') ? '' : 'pages/';

        return path + `${pagesFolder + record.id.replaceAll('.', '/')}.md`
    }

    /**
     * @summary Resolves relative repository links and upgrades canonical `https://neomjs.com/learn/<id>` links
     * to in-SPA `#/learn/<id>` navigation whenever `<id>` is present in the loaded Learn tree store.
     * @param {String} html
     * @returns {String}
     */
    rewriteLinks(html) {
        let me          = this,
            path        = me.getContentPath(me.record),
            routePrefix = StringUtil.toRouteHref(me.contentRoute),
            store       = me.getStateProvider()?.getStore('tree');

        // Less the base path, the fetch path is the file's path in the repository
        html = rewriteRepoLinks(super.rewriteLinks(html), path.slice(Neo.config.basePath.length));

        return html.replace(/<a\b[^>]*>/gi, tag => {
            const match = /(\shref\s*=\s*)(["'])https:\/\/neomjs\.com\/learn\/([^"'?#]+)(#[^"']*)?\2/i.exec(tag);

            if (!match) {
                return tag
            }

            const [, attr, quote, itemId, fragment = ''] = match;

            if (store?.get(itemId)) {
                return tag.replace(match[0], `${attr}${quote}${routePrefix}${itemId}${fragment}${quote}`)
            }

            return /\starget\s*=/i.test(tag) ? tag : tag.replace(/>$/, ' target="_blank">')
        })
    }
}

export default Neo.setupClass(Component);
