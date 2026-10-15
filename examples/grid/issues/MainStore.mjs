import Model from './MainModel.mjs';
import Store from '../../../src/data/Store.mjs';

/**
 * @summary The 497 most recent issues of `neomjs/neo` on 2026-10-15, newest first.
 *
 * The snapshot is real tracker data, so its text varies the way an application's does: one-line titles beside
 * three-line ones, terse summaries beside dense ones. It was taken with `gh issue list --state all --limit 500` and
 * reduced to public fields: the title, the opening sentences of the body (its Context section, else its first prose
 * paragraph, at most 220 characters), the type and the first area label, the state, the author's login, the creation
 * day and the comment count. Records whose title or summary held an email address, a token, a local path, a private
 * name or a session id were dropped rather than edited.
 *
 * The snapshot lives in `neomjs/pages` and loads through the GitHub CDN, as the covid apps' data does, so neither this
 * repository nor its npm package carries it.
 * @class Neo.examples.grid.issues.MainStore
 * @extends Neo.data.Store
 */
class MainStore extends Store {
    static config = {
        /**
         * @member {String} className='Neo.examples.grid.issues.MainStore'
         * @protected
         */
        className: 'Neo.examples.grid.issues.MainStore',
        /**
         * @member {Boolean} autoLoad=true
         */
        autoLoad: true,
        /**
         * @member {Neo.data.Model} model=Model
         */
        model: Model,
        /**
         * @member {Object[]} sorters=[{property: 'id', direction: 'DESC'}]
         */
        sorters: [{property: 'id', direction: 'DESC'}],
        /**
         * @member {String} url='https://raw.githubusercontent.com/neomjs/pages/main/resources_pub/data/neo_issues.json'
         */
        url: 'https://raw.githubusercontent.com/neomjs/pages/main/resources_pub/data/neo_issues.json'
    }
}

export default Neo.setupClass(MainStore);
