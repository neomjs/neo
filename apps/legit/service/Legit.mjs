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
 * - **Git Operations:** Providing methods to load file trees (`loadTree`) and calculate deltas between commits (`loadTreeDelta`).
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
     * Recursively loads the file tree structure from a given path.
     * @param {String} treePath The path to start loading the tree from.
     * @returns {Promise<{hash: string, subEntries: {}}>} The tree structure with hashes.
     */
    async loadTree(treePath) {
        await this.ready();

        const
            me         = this,
            subEntries = {},
            pathEntries = await me.readdir(treePath);

        for (const entryName of pathEntries) {
            const stat = await me.stat(treePath + entryName);

            if (stat.isDirectory()) {
                subEntries[entryName] = await me.loadTree(treePath + entryName + '/');
            } else {
                const contenHash = await crypto.subtle.digest("SHA-1", await me.readFile(treePath + entryName));

                subEntries[entryName] = {
                    // for now its the content instead of the hash
                    hash: contenHash,
                    name: entryName,
                };
            }
        }

        return {
            hash: '',
            subEntries
        }
    }

    /**
     * Calculates the difference between two tree states (commits).
     * Useful for identifying added, deleted, and modified files.
     * @param {String} currentState The hash or path of the current state.
     * @param {String} newState The hash or path of the new state.
     * @returns {Promise<{deleted: String[], added: String[], modified: String[]}>} An object containing arrays of changed file paths.
     */
    async loadTreeDelta(currentState, newState) {
        await this.ready();

        const me = this;

        const prefixNewState = newState.slice(0, 2);
        const suffixNewState = newState.slice(2);

        let currentstateTree = {}

        if (currentState) {
            const prefixCurrentState = currentState.slice(0, 2);
            const suffixCurrentState = currentState.slice(2);

            currentstateTree = await me.loadTree('/.legit/commits/' + prefixCurrentState + '/' + suffixCurrentState + '/');
        }
        const newStateTree = await me.loadTree('/.legit/commits/' + prefixNewState + '/' + suffixNewState + '/');

        const deleted  = [];
        const added    = [];
        const modified = [];

        function flattenTree(tree, path = '') {
            const result = {};

            if (tree.subEntries) {
                for (const [key, value] of Object.entries(tree.subEntries)) {
                    const currentPath = path ? `${path}/${key}` : key;

                    if (value.subEntries) {
                        Object.assign(result, flattenTree(value, currentPath));
                    } else {
                        result[currentPath] = value.hash;
                    }
                }
            }

            return result;
        }

        const currentStateFlat = currentState !== '' ? flattenTree(currentstateTree) : {};
        const newStateFlat     = flattenTree(newStateTree);

        // Find deleted (in current but not in new)
        for (const path in currentStateFlat) {
            if (!(path in newStateFlat)) {
                deleted.push(path);
            }
        }

        // Find added (in new but not in current)
        for (const path in newStateFlat) {
            if (!(path in currentStateFlat)) {
                added.push(path);
            }
        }

        // Find modified (in both but hash differs)
        for (const path in newStateFlat) {
            if (path in currentStateFlat) {
                const currentHash = new Uint8Array(currentStateFlat[path]);
                const newHash     = new Uint8Array(newStateFlat[path]);

                if (currentHash.length !== newHash.length ||
                    !currentHash.every((byte, i) => byte === newHash[i])) {
                    modified.push(path);
                }
            }
        }

        return {
            deleted,
            added,
            modified
        }
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

        let mdFile = await fetch('../../learn/benefits/FormsEngine.md');
        mdFile = await mdFile.text();

        await me.writeFile({
            data     : mdFile,
            path     : `${me.path}/FormsEngine.md`,
            skipReady: true
        });

        mdFile = await fetch('../../learn/benefits/OffTheMainThread.md');
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
                "        className           : 'Portal.view.MultiWindowHelix',",
                "        showGitHubStarButton: false,",
                "        theme               : 'neo-theme-dark'",
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
                "        className           : 'Portal.view.MultiWindowHelix',",
                "        showGitHubStarButton: false,",
                "        theme               : 'neo-theme-dark'",
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
