import Base from '../../core/Base.mjs';

const
    classNameRegex = /className\s*:\s*['"]([^'"]+)['"]/g,
    exportRegex    = /export\s+(?:default\s+)?(?:const|let|var|class|function|async\s+function|generator\s+function|async\s+generator\s+function|(\{[\s\S]*?\}))/g,
    importRegex    = /import\s+(?:([\w-]+)|\{([^}]+)\})\s+from\s+['"]([^'"]+)['"]/;

/**
 * @summary Executor implementation for Neo.mjs source code.
 *
 * This executor is responsible for taking raw Neo.mjs component code (as a string), resolving its dependencies,
 * and executing it within a container. It handles:
 * - **Dynamic Imports**: Parsing `import` statements and resolving them at runtime using `Promise.all` and `import()`.
 * - **Environment Handling**: Adjusting import paths based on the running environment (`development`, `dist/development`, `dist/production`) to ensure correct file resolution.
 * - **Code Execution**: Wrapping the code in a `new Function` context to execute it safely and inject the result into the target container.
 * - **Namespace Management**: Cleaning up previous class definitions to allow for iterative development and re-execution.
 *
 * @class Neo.code.executor.Neo
 * @extends Neo.core.Base
 */
class NeoExecutor extends Base {
    static config = {
        /**
         * @member {String} className='Neo.code.executor.Neo'
         * @protected
         */
        className: 'Neo.code.executor.Neo'
    }

    /**
     * @param {String} sourceCode
     * @returns {String[]}
     */
    findClassNames(sourceCode) {
        let classNames = [],
            match;

        while ((match = classNameRegex.exec(sourceCode)) !== null) {
            classNames.push(match[1])
        }

        return classNames
    }

    /**
     * @param {String} sourceCode
     * @returns {String|null}
     */
    findMainClassName(sourceCode) {
        let classNames = this.findClassNames(sourceCode),
            mainName   = null,
            prioNames  = ['MainContainer', 'MainComponent', 'MainView', 'Main'];

        if (classNames.length > 0) {
            for (const name of prioNames) {
                mainName = classNames.find(className => className.endsWith(name));
                if (mainName) {
                    break
                }
            }

            if (!mainName) {
                mainName = classNames[classNames.length - 1]
            }
        }

        return mainName
    }

    /**
     * Executes the provided Neo.mjs source code within the given container.
     *
     * This method performs a complex transformation to emulate a native module environment within the browser:
     * 1.  **Import Rewriting**: It parses the source for `import` statements and maps them to dynamic `import()` calls.
     *     Crucially, it adjusts relative paths based on the `environment` (dev vs. dist) to ensure the browser can resolve the files.
     * 2.  **Promise Resolution**: It wraps all imports in a `Promise.all` to ensure dependencies are ready before code execution.
     * 3.  **Sandbox Execution**: It constructs a function body string and executes it using `new Function`. This allows the code
     *     to run in the global scope but with injected variables (`container`, `module`).
     * 4.  **Namespace Cleaning**: It actively deletes the target class from the `Neo` namespace before execution. This is critical
     *     for **Hot Module Replacement (HMR)** workflows, ensuring that re-running the code actually updates the class definition
     *     instead of using a cached version.
     * @param {Object} data
     * @param {String} data.code
     * @param {Neo.container.Base} data.container
     * @returns {Promise<Object>}
     */
    async execute({code, container}) {
        let me                = this,
            {environment}     = Neo.config,
            source            = code,
            className         = me.findMainClassName(source),
            cleanLines        = [],
            moduleNameAndPath = [],
            params            = [],
            vars              = [],
            codeString, module, promises;

        source.split('\n').forEach(line => {
            let importMatch = line.match(importRegex);

            if (importMatch) {
                let defaultImport = importMatch[1],
                    namedImports  = importMatch[2]?.split(',').map(name => name.trim()),
                    path          = importMatch[3],
                    index;

                if (environment === 'development') {
                    if (path.startsWith('.')) {
                        path = '../' + path
                    }
                }
                // We want the non-minified version for code which can not get bundled.
                else if (environment === 'dist/development') {
                    index = path.lastIndexOf('../');

                    if (index === 0) {
                        path = '../../../../src/' + path.slice(index + 3)
                    } else {
                        path = path.slice(0, index) + '../../../' + path.slice(index + 3)
                    }
                }

                // We want the minified version of the code which can not get bundled.
                else if (environment === 'dist/production') {
                    index = path.lastIndexOf('../');

                    if (index === 0) {
                        path = '../../../esm/src/' + path.slice(index + 3)
                    } else {
                        path = path.slice(0, index) + '../../esm/' + path.slice(index + 3)
                    }
                }

                moduleNameAndPath.push({defaultImport, namedImports, path})
            } else if (line.match(exportRegex)) {
                // Skip export statements
            } else {
                cleanLines.push(`    ${line}`)
            }
        });

        promises = moduleNameAndPath.map((item, i) => {
            let moduleAlias = `Module${i}`;
            params.push(moduleAlias);
            if (item.defaultImport) {
                vars.push(`    const ${item.defaultImport} = ${moduleAlias}.default;`);
            }
            if (item.namedImports) {
                vars.push(`    const {${item.namedImports.join(', ')}} = ${moduleAlias};`);
            }
            return `import('${item.path}')`
        });

        codeString = [
            'Promise.all([',
            `    ${promises.join(',\n')}`,
            `]).then(([${params.join(', ')}]) => {`,
            `${vars.join('\n')}`,
            `    ${cleanLines.join('\n')}`,
            '',
            `    module = Neo.ns('${className}');`,
            '',
            `    if (module && (`,
            `        Neo.component.Base.isPrototypeOf(module) ||`,
            `        Neo.functional.component.Base.isPrototypeOf(module)`,
            `    )) {`,
            `        container.add({module})`,
            '    }',
            '})',
            '.catch(error => {',
            '    console.warn("LivePreview Error:", error);',
            '    container.add({ntype:\'component\', html:error.message});',
            '})'
        ].join('\n');

        // destroy, silent => merge changes into one update cycle
        container.removeAll(true, true);

        // We must ensure that classes inside the editor won't get cached, since this disables run-time changes
        // See: https://github.com/neomjs/neo/issues/5863
        me.findClassNames(codeString).forEach(item => {
            let nsArray   = item.split('.'),
                className = nsArray.pop(),
                ns        = Neo.ns(nsArray);

            if (ns) {
                delete ns[className]
            }
        });

        try {
            new Function('container', 'module', codeString)(container, module);
        } catch (error) {
            container.add({
                ntype: 'component',
                html : error.message
            })
        }

        return {}
    }
}

export default Neo.setupClass(NeoExecutor);
