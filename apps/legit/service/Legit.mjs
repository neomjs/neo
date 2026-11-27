import Base from '../../../src/core/Base.mjs';

/**
 * @summary A singleton service that provides a virtual file system layer for the Legit IDE.
 *
 * This service acts as the central hub for file system operations within the Legit application.
 * It abstracts the underlying storage mechanism (using `memfs`) and provides a git-like interface
 * for interacting with file trees and commits (using `@legit-sdk/core`).
 *
 * Key responsibilities include:
 * - **Initialization:** Dynamically loading external dependencies (`memfs`, `@legit-sdk/core`) to ensure the app remains lightweight until needed.
 * - **File System Seeding:** Populating the in-memory file system with initial demo content.
 * - **Git Operations:** Reading commit history and comparing file paths and blob IDs between committed trees.
 * - **File I/O:** Exposing standard file system methods (`readFile`, `writeFile`, `readdir`, `stat`) that automatically await the service's ready state.
 *
 * This service is designed to be robust against initialization failures and provides a safe, asynchronous API for the `ViewportController` to consume.
 *
 * @class Legit.service.Legit
 * @extends Neo.core.Base
 * @singleton
 */
class Legit extends Base {
    static config = {
        /**
         * @member {String} className='Legit.service.Legit'
         * @protected
         */
        className: 'Legit.service.Legit',
        /**
         * @member {Object|null} fs=null
         */
        fs: null,
        /**
         * @member {Object|null} legitFs=null
         */
        legitFs: null,
        /**
         * @member {String} path='/.legit/branches/anonymous'
         */
        path: '/.legit/branches/anonymous',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * Initializes the service by dynamically importing dependencies and setting up the file system.
     * @returns {Promise<void>}
     */
    async initAsync() {
        await super.initAsync();

        const me = this;

        try {
            const {openLegitFs} = await import(/* webpackIgnore: true */ 'https://esm.sh/@legit-sdk/core');
            const fsModule      = await import(/* webpackIgnore: true */ 'https://esm.sh/memfs');

            me.fs = fsModule.default;

            me.legitFs = await openLegitFs({
                storageFs: me.fs,
                gitRoot  : '/',
                serverUrl: 'http://localhost:9999/',
                // publicKey: process.env.NEXT_PUBLIC_LEGIT_PUBLIC_KEY,
            });

            // For debugging
            globalThis.legitFs = me.legitFs;

            await me.#seedFileSystem();
        } catch (e) {
            console.error('Failed to initialize Legit Service', e);
        }
    }

    /**
     * Retrieves the commit history for a given branch.
     * @param {String} [branch='anonymous'] The branch name to load history for.
     * @returns {Promise<Object[]>} An array of commit objects.
     */
    async loadHistory(branch='anonymous') {
        await this.ready();

        try {
            const historyJson = await this.legitFs.readFile(`/.legit/branches/${branch}/.legit/history`, 'utf-8');
            return JSON.parse(historyJson);
        } catch (e) {
            console.warn(`Failed to load history for branch ${branch}`, e);
            return [];
        }
    }

    /**
     * @summary Compares the files in two committed snapshots using the same Git storage as Legit.
     * Equal object IDs prune unchanged trees. The SDK's `.keep` files represent empty directories
     * and do not appear in the editor. Without an earlier head, every file is an addition.
     * @param {String|null} currentState Previous commit ID.
     * @param {String} newState New commit ID.
     * @returns {Promise<{added: String[], modified: String[], deleted: String[]}>}
     */
    async loadTreeDelta(currentState, newState) {
        if (!newState) {
            throw new Error('A destination commit is required to compare file trees')
        }

        await this.ready();

        const {TREE, walk} = await import(/* webpackIgnore: true */ 'https://esm.sh/@legit-sdk/isomorphic-git@1.34.2?exports=TREE,walk'),
              delta        = {added: [], modified: [], deleted: []},
              trees        = [TREE({ref: newState})];

        if (currentState) {
            trees.push(TREE({ref: currentState}))
        }

        const changes = await walk({
            dir: '/',
            fs : this.fs,
            trees,
            async map(path, [next, previous]) {
                if (path === '.') {
                    return
                }

                if (path === '.keep' || path.endsWith('/.keep') || (next && previous && await next.oid() === await previous.oid())) {
                    return null
                }

                const isFile  = await next?.type() === 'blob',
                      wasFile = await previous?.type() === 'blob';

                if (isFile) {
                    return {path, kind: wasFile ? 'modified' : 'added'}
                }

                if (wasFile) {
                    return {path, kind: 'deleted'}
                }
            }
        });

        for (const {kind, path} of changes) {
            delta[kind].push(path)
        }

        return delta
    }

    /**
     * Reads the content of a file.
     * @param {String} path The file path.
     * @param {Object} [options] Read options.
     * @returns {Promise<*>} The file content.
     */
    async readFile(path, options) {
        await this.ready();
        return this.legitFs.readFile(path, options)
    }

    /**
     * Reads the contents of a directory.
     * @param {String} path The directory path.
     * @returns {Promise<String[]>} An array of file names.
     */
    async readdir(path) {
        await this.ready();
        return this.legitFs.readdir(path)
    }

    /**
     * Seeds the in-memory file system with initial demo content.
     * This method bypasses the `ready()` check to avoid deadlocks during initialization.
     * @returns {Promise<void>}
     * @private
     */
    async #seedFileSystem() {
        const me = this;

        let mdFile = await fetch('../../learn/benefits/body/FormsEngine.md');
        mdFile = await mdFile.text();

        await me.writeFile({
            data     : mdFile,
            path     : `${me.path}/FormsEngine.md`,
            skipReady: true
        });

        mdFile = await fetch('../../learn/benefits/body/OffTheMainThread.md');
        mdFile = await mdFile.text();

        await me.writeFile({
            data     : mdFile,
            path     : `${me.path}/OffTheMainThread.md`,
            skipReady: true
        });

        await me.writeFile({
            data: [
                "import Viewport from '../../examples/component/multiWindowHelix/Viewport.mjs';",
                "",
                "class MainView extends Viewport {",
                "    static config = {",
                "        className: 'Portal.view.MultiWindowHelix',",
                "        theme    : 'neo-theme-dark'",
                "    }",
                "}",
                "",
                "MainView = Neo.setupClass(MainView);"
            ].join('\n'),
            path     : `${me.path}/Helix.mjs`,
            skipReady: true
        });

        await me.writeFile({
            data: [
                "import Viewport from '../../examples/component/multiWindowCoronaGallery/Viewport.mjs';",
                "",
                "class MainView extends Viewport {",
                "    static config = {",
                "        className: 'Portal.view.MultiWindowHelix',",
                "        theme    : 'neo-theme-dark'",
                "    }",
                "}",
                "",
                "MainView = Neo.setupClass(MainView);"
            ].join('\n'),
            path     : `${me.path}/Gallery.mjs`,
            skipReady: true
        });
    }

    /**
     * Retrieves file statistics.
     * @param {String} path The file or directory path.
     * @returns {Promise<Object>} The file statistics object.
     */
    async stat(path) {
        await this.ready();
        return this.legitFs.stat(path)
    }

    /**
     * Writes data to a file.
     * @param {Object}        config Configuration object.
     * @param {String|Buffer} config.data The data to write.
     * @param {Object}        [config.options] Write options.
     * @param {String}        config.path The file path.
     * @param {Boolean}       [config.skipReady=false] If true, bypasses the `await this.ready()` check.
     * @returns {Promise<*>}
     */
    async writeFile({data, options, path, skipReady=false}) {
        !skipReady && await this.ready();
        return this.legitFs.writeFile(path, data, options)
    }
}

export default Neo.setupClass(Legit);
