import Base from '../../../../src/data/parser/Base.mjs';

/** @summary Real-worker regression fixture; never imported by the App worker. */
class Parser extends Base {
    static config = {
        className: 'PipelineStageModules.Parser'
    }

    /** @summary Marks rows parsed in the worker. @param {Object[]} rows @returns {Object[]} */
    read(rows) {
        return rows.map(row => ({...row, parserRealm: Neo.workerId, parserPath: Object.hasOwn(this, 'modulePath')}))
    }
}

export default Neo.setupClass(Parser);
