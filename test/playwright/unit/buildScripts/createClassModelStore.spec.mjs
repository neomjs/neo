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

    test('binds companion data.Store to the exact newly generated Model across root and non-model namespaces (MyApp.User, MyApp.domain.User)', () => {
        for (const [className, expectedModelRel, expectedStoreRel, expectedStoreClassName] of [
            ['MyApp.User',        ['User.mjs'],                   ['store', 'Users.mjs'],           'MyApp.store.Users'],
            ['MyApp.domain.User', ['domain', 'User.mjs'],         ['domain', 'store', 'Users.mjs'], 'MyApp.domain.store.Users']
        ]) {
            execFileSync(
                process.execPath,
                [classScriptPath, '-c', className, '-b', 'data.Model', '-n', 'no', '-m', 'yes'],
                {cwd: tmpDir, stdio: 'pipe'}
            );

            const
                modelFile    = path.join(tmpDir, 'apps', 'myapp', ...expectedModelRel),
                storeFile    = path.join(tmpDir, 'apps', 'myapp', ...expectedStoreRel),
                storeContent = fs.readFileSync(storeFile, 'utf8'),
                importMatch  = storeContent.match(/import\s+User\s+from\s+'([^']+)';/);

            expect(fs.existsSync(modelFile)).toBe(true);
            expect(fs.existsSync(storeFile)).toBe(true);
            expect(importMatch).not.toBeNull();
            expect(path.resolve(path.dirname(storeFile), importMatch[1])).toBe(modelFile);
            expect(storeContent).toContain(`className: '${expectedStoreClassName}'`);
            expect(storeContent).toContain('model: User');

            execFileSync(process.execPath, ['--check', modelFile], {stdio: 'pipe'});
            execFileSync(process.execPath, ['--check', storeFile], {stdio: 'pipe'});
        }
    });

    test('disambiguates collision-prone model import identifier when model is named Store (MyApp.model.Store)', () => {
        execFileSync(
            process.execPath,
            [classScriptPath, '-c', 'MyApp.model.Store', '-b', 'data.Model', '-n', 'no', '-m', 'yes'],
            {cwd: tmpDir, stdio: 'pipe'}
        );

        const
            modelFile    = path.join(tmpDir, 'apps', 'myapp', 'model', 'Store.mjs'),
            storeFile    = path.join(tmpDir, 'apps', 'myapp', 'store', 'Stores.mjs'),
            storeContent = fs.readFileSync(storeFile, 'utf8'),
            importMatch  = storeContent.match(/import\s+StoreModel\s+from\s+'([^']+)';/);

        expect(fs.existsSync(modelFile)).toBe(true);
        expect(fs.existsSync(storeFile)).toBe(true);

        //Syntax check must pass without duplicate identifier `Store`
        execFileSync(process.execPath, ['--check', modelFile], {stdio: 'pipe'});
        execFileSync(process.execPath, ['--check', storeFile], {stdio: 'pipe'});

        expect(storeContent).toContain('class Stores extends Store');
        expect(importMatch).not.toBeNull();
        expect(path.resolve(path.dirname(storeFile), importMatch[1])).toBe(modelFile);
        expect(storeContent).toContain('model: StoreModel');
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
