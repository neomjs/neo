import {execFileSync}  from 'child_process';
import fs              from 'fs-extra';
import os              from 'os';
import path            from 'path';
import {fileURLToPath} from 'url';
import {test, expect}  from '@playwright/test';

const
    __dirname       = path.dirname(fileURLToPath(import.meta.url)),
    classScriptPath = path.resolve(__dirname, '../../../../buildScripts/create/class.mjs');

test.describe('buildScripts/create/class.mjs data.Model -> data.Store generation (#3255)', () => {
    let tmpDir;

    test.beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-create-class-'));
        fs.mkdirpSync(path.join(tmpDir, 'apps', 'myapp'));
    });

    test.afterEach(() => {
        if (tmpDir && fs.existsSync(tmpDir)) {
            fs.removeSync(tmpDir);
        }
    });

    test('generates a matching data.Store wired to the new data.Model when createStore is yes', () => {
        execFileSync(
            process.execPath,
            [classScriptPath, '-c', 'MyApp.model.User', '-b', 'data.Model', '-n', 'no', '-m', 'yes'],
            {cwd: tmpDir, stdio: 'pipe'}
        );

        const
            modelFile = path.join(tmpDir, 'apps', 'myapp', 'model', 'User.mjs'),
            storeFile = path.join(tmpDir, 'apps', 'myapp', 'store', 'Users.mjs');

        expect(fs.existsSync(modelFile)).toBe(true);
        expect(fs.existsSync(storeFile)).toBe(true);

        const
            modelContent = fs.readFileSync(modelFile, 'utf8'),
            storeContent = fs.readFileSync(storeFile, 'utf8');

        expect(modelContent).toContain("className: 'MyApp.model.User'");
        expect(storeContent).toContain("className: 'MyApp.store.Users'");
        expect(storeContent).toContain("import User  from '../model/User.mjs';");
        expect(storeContent).toContain('model: User');
    });

    test('pluralizes -y model names to -ies stores and singularizes back to link the model', () => {
        execFileSync(
            process.execPath,
            [classScriptPath, '-c', 'MyApp.model.Company', '-b', 'data.Model', '-n', 'no', '-m', 'yes'],
            {cwd: tmpDir, stdio: 'pipe'}
        );

        const
            modelFile = path.join(tmpDir, 'apps', 'myapp', 'model', 'Company.mjs'),
            storeFile = path.join(tmpDir, 'apps', 'myapp', 'store', 'Companies.mjs');

        expect(fs.existsSync(modelFile)).toBe(true);
        expect(fs.existsSync(storeFile)).toBe(true);

        const storeContent = fs.readFileSync(storeFile, 'utf8');

        expect(storeContent).toContain("className: 'MyApp.store.Companies'");
        expect(storeContent).toContain("import Company from '../model/Company.mjs';");
        expect(storeContent).toContain('model: Company');
    });

    test('does not generate a data.Store when createStore is no', () => {
        execFileSync(
            process.execPath,
            [classScriptPath, '-c', 'MyApp.model.Order', '-b', 'data.Model', '-n', 'no', '-m', 'no'],
            {cwd: tmpDir, stdio: 'pipe'}
        );

        const
            modelFile = path.join(tmpDir, 'apps', 'myapp', 'model', 'Order.mjs'),
            storeFile = path.join(tmpDir, 'apps', 'myapp', 'store', 'Orders.mjs');

        expect(fs.existsSync(modelFile)).toBe(true);
        expect(fs.existsSync(storeFile)).toBe(false);
    });
});
