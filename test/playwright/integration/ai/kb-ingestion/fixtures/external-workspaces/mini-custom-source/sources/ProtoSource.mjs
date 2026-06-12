/**
 * @summary Custom external-source fixture that enumerates proto schema files.
 */
export default class ProtoSource {
    static className = 'Fixture.MiniCustomSource.ProtoSource';
    static sourceName = 'ProtoSource';

    /**
     * @summary Returns the proto source paths covered by the custom-source fixture.
     * @returns {String[]}
     */
    extract() {
        return ['schemas/agent.proto', 'schemas/task.proto', 'schemas/result.proto'];
    }
}
