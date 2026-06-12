/**
 * @summary Minimal Neo-like fixture class used by the #11638 ingestion tests.
 */
export default class MainView {
    static className = 'MiniNeo.MainView';

    /**
     * @summary Emits the alpha tenant sentinel content for parser parity checks.
     * @returns {String}
     */
    render() {
        return 'alpha-exclusive-query neo workspace panel';
    }
}
