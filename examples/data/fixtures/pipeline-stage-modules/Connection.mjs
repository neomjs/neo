import Base from '../../../../src/data/connection/Base.mjs';

/** @summary Real-worker regression fixture; never imported by the App worker. */
class Connection extends Base {
    static config = {
        className: 'PipelineStageModules.Connection'
    }

    /** @summary Identifies the executing realm and any leaked loader metadata. @returns {Promise<Object[]>} */
    async read() {
        return [{id: 1, connectionRealm: Neo.workerId, connectionPath: Object.hasOwn(this, 'modulePath')}]
    }
}

export default Neo.setupClass(Connection);
