import Base from '../../../../src/data/normalizer/Base.mjs';

/** @summary Real-worker regression fixture; never imported by the App worker. */
class Normalizer extends Base {
    static config = {
        className: 'PipelineStageModules.Normalizer'
    }

    /** @summary Marks the final rows and returns the Store envelope. @param {Object[]} rows @returns {Object} */
    normalize(rows) {
        return {data: rows.map(row => ({...row, normalizerRealm: Neo.workerId,
            normalizerPath: Object.hasOwn(this, 'modulePath')})), totalCount: rows.length}
    }
}

export default Neo.setupClass(Normalizer);
