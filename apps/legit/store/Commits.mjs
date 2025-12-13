import CommitModel from '../model/Commit.mjs';
import Store       from '../../../src/data/Store.mjs';

/**
 * @class Legit.store.Commits
 * @extends Neo.data.Store
 */
class Commits extends Store {
    static config = {
        /**
         * @member {String} className='Legit.store.Commits'
         * @protected
         */
        className: 'Legit.store.Commits',
        /**
         * @member {Neo.data.Model} model=CommitModel
         */
        model: CommitModel,
        /**
         * @member {Object[]} sorters=[{property:'timestamp',direction:'DESC'}]
         */
        sorters: [{
            property : 'timestamp',
            direction: 'DESC'
        }]
    }
}

export default Neo.setupClass(Commits);
