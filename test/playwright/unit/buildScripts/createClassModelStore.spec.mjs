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

test.describe('buildScripts/create/class.mjs data.Store -> data.Model generation (#3602)', () => {
    let tmpDir;

    test.beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-create-class-store-'));
        fs.mkdirpSync(path.join(tmpDir, 'apps', 'myapp'));
    });

    test.afterEach(() => {
        if (tmpDir && fs.existsSync(tmpDir)) {
            fs.removeSync(tmpDir);
        }
    });

    test('generates a matching data.Model and wires it into the new data.Store when createModel is yes', () => {
        execFileSync(
            process.execPath,
            [classScriptPath, '-c', 'MyApp.store.Users', '-b', 'data.Store', '-n', 'no', '-M', 'yes'],
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

    test('singularizes -ies store names to -y models and links the generated model into the store', () => {
        execFileSync(
            process.execPath,
            [classScriptPath, '-c', 'MyApp.store.Companies', '-b', 'data.Store', '-n', 'no', '-M', 'yes'],
            {cwd: tmpDir, stdio: 'pipe'}
        );

        const
            modelFile = path.join(tmpDir, 'apps', 'myapp', 'model', 'Company.mjs'),
            storeFile = path.join(tmpDir, 'apps', 'myapp', 'store', 'Companies.mjs');

        expect(fs.existsSync(modelFile)).toBe(true);
        expect(fs.existsSync(storeFile)).toBe(true);

        const
            modelContent = fs.readFileSync(modelFile, 'utf8'),
            storeContent = fs.readFileSync(storeFile, 'utf8');

        expect(modelContent).toContain("className: 'MyApp.model.Company'");
        expect(storeContent).toContain("className: 'MyApp.store.Companies'");
        expect(storeContent).toContain("import Company from '../model/Company.mjs';");
        expect(storeContent).toContain('model: Company');
    });

    test('binds newly generated data.Model across root and non-store namespaces (MyApp.Users, MyApp.domain.Users)', () => {
        for (const [className, expectedStoreRel, expectedModelRel, expectedModelClassName] of [
            ['MyApp.Users',        ['Users.mjs'],           ['model', 'User.mjs'],           'MyApp.model.User'],
            ['MyApp.domain.Users', ['domain', 'Users.mjs'], ['domain', 'model', 'User.mjs'], 'MyApp.domain.model.User']
        ]) {
            execFileSync(
                process.execPath,
                [classScriptPath, '-c', className, '-b', 'data.Store', '-n', 'no', '-M', 'yes'],
                {cwd: tmpDir, stdio: 'pipe'}
            );

            const
                storeFile    = path.join(tmpDir, 'apps', 'myapp', ...expectedStoreRel),
                modelFile    = path.join(tmpDir, 'apps', 'myapp', ...expectedModelRel),
                modelContent = fs.readFileSync(modelFile, 'utf8'),
                storeContent = fs.readFileSync(storeFile, 'utf8'),
                importMatch  = storeContent.match(/import\s+User\s+from\s+'([^']+)';/);

            expect(fs.existsSync(modelFile)).toBe(true);
            expect(fs.existsSync(storeFile)).toBe(true);
            expect(modelContent).toContain(`className: '${expectedModelClassName}'`);
            expect(importMatch).not.toBeNull();
            expect(path.resolve(path.dirname(storeFile), importMatch[1])).toBe(modelFile);
            expect(storeContent).toContain('model: User');

            execFileSync(process.execPath, ['--check', modelFile], {stdio: 'pipe'});
            execFileSync(process.execPath, ['--check', storeFile], {stdio: 'pipe'});
        }
    });

    test('disambiguates collision-prone model import identifier when store singularizes to Store (MyApp.store.Stores)', () => {
        execFileSync(
            process.execPath,
            [classScriptPath, '-c', 'MyApp.store.Stores', '-b', 'data.Store', '-n', 'no', '-M', 'yes'],
            {cwd: tmpDir, stdio: 'pipe'}
        );

        const
            modelFile    = path.join(tmpDir, 'apps', 'myapp', 'model', 'Store.mjs'),
            storeFile    = path.join(tmpDir, 'apps', 'myapp', 'store', 'Stores.mjs'),
            storeContent = fs.readFileSync(storeFile, 'utf8'),
            importMatch  = storeContent.match(/import\s+StoreModel\s+from\s+'([^']+)';/);

        expect(fs.existsSync(modelFile)).toBe(true);
        expect(fs.existsSync(storeFile)).toBe(true);

        execFileSync(process.execPath, ['--check', modelFile], {stdio: 'pipe'});
        execFileSync(process.execPath, ['--check', storeFile], {stdio: 'pipe'});

        expect(storeContent).toContain('class Stores extends Store');
        expect(importMatch).not.toBeNull();
        expect(path.resolve(path.dirname(storeFile), importMatch[1])).toBe(modelFile);
        expect(storeContent).toContain('model: StoreModel');
    });

    test('does not generate a data.Model when createModel is no', () => {
        execFileSync(
            process.execPath,
            [classScriptPath, '-c', 'MyApp.store.Orders', '-b', 'data.Store', '-n', 'no', '-M', 'no'],
            {cwd: tmpDir, stdio: 'pipe'}
        );

        const
            modelFile = path.join(tmpDir, 'apps', 'myapp', 'model', 'Order.mjs'),
            storeFile = path.join(tmpDir, 'apps', 'myapp', 'store', 'Orders.mjs');

        expect(fs.existsSync(storeFile)).toBe(true);
        expect(fs.existsSync(modelFile)).toBe(false);
    });

    test('detects and wires an existing model beside the store without creating a duplicate model/User.mjs', () => {
        execFileSync(
            process.execPath,
            [classScriptPath, '-c', 'MyApp.User', '-b', 'data.Model', '-n', 'no', '-m', 'no'],
            {cwd: tmpDir, stdio: 'pipe'}
        );

        execFileSync(
            process.execPath,
            [classScriptPath, '-c', 'MyApp.Users', '-b', 'data.Store', '-n', 'no', '-M', 'yes'],
            {cwd: tmpDir, stdio: 'pipe'}
        );

        const
            siblingModelFile   = path.join(tmpDir, 'apps', 'myapp', 'User.mjs'),
            duplicateModelFile = path.join(tmpDir, 'apps', 'myapp', 'model', 'User.mjs'),
            storeFile          = path.join(tmpDir, 'apps', 'myapp', 'Users.mjs'),
            storeContent       = fs.readFileSync(storeFile, 'utf8');

        expect(fs.existsSync(siblingModelFile)).toBe(true);
        expect(fs.existsSync(duplicateModelFile)).toBe(false);
        expect(fs.existsSync(storeFile)).toBe(true);
        expect(storeContent).toContain("import User  from './User.mjs';");
        expect(storeContent).toContain('model: User');

        execFileSync(process.execPath, ['--check', siblingModelFile], {stdio: 'pipe'});
        execFileSync(process.execPath, ['--check', storeFile], {stdio: 'pipe'});
    });
});

test.describe('buildScripts/create/class.mjs view -> controller.Component & state.Provider generation', () => {
    let tmpDir;

    test.beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-create-class-view-'));
        fs.mkdirpSync(path.join(tmpDir, 'apps', 'myapp'));
    });

    test.afterEach(() => {
        if (tmpDir && fs.existsSync(tmpDir)) {
            fs.removeSync(tmpDir);
        }
    });

    test('generates and wires both controller.Component and state.Provider into a container.Base view', () => {
        execFileSync(
            process.execPath,
            [classScriptPath, '-c', 'MyApp.view.MainContainer', '-b', 'container.Base', '-n', 'no', '-C', 'yes', '-p', 'yes'],
            {cwd: tmpDir, stdio: 'pipe'}
        );

        const
            viewFile          = path.join(tmpDir, 'apps', 'myapp', 'view', 'MainContainer.mjs'),
            controllerFile    = path.join(tmpDir, 'apps', 'myapp', 'view', 'MainContainerController.mjs'),
            stateProviderFile = path.join(tmpDir, 'apps', 'myapp', 'view', 'MainContainerStateProvider.mjs');

        expect(fs.existsSync(viewFile)).toBe(true);
        expect(fs.existsSync(controllerFile)).toBe(true);
        expect(fs.existsSync(stateProviderFile)).toBe(true);

        const
            viewContent          = fs.readFileSync(viewFile, 'utf8'),
            controllerContent    = fs.readFileSync(controllerFile, 'utf8'),
            stateProviderContent = fs.readFileSync(stateProviderFile, 'utf8');

        expect(controllerContent).toContain("className: 'MyApp.view.MainContainerController'");
        expect(stateProviderContent).toContain("className: 'MyApp.view.MainContainerStateProvider'");

        expect(viewContent).toContain("import MainContainerController    from './MainContainerController.mjs';");
        expect(viewContent).toContain("import MainContainerStateProvider from './MainContainerStateProvider.mjs';");
        expect(viewContent).toContain('controller: MainContainerController,');
        expect(viewContent).toContain('stateProvider: MainContainerStateProvider');

        execFileSync(process.execPath, ['--check', viewFile], {stdio: 'pipe'});
        execFileSync(process.execPath, ['--check', controllerFile], {stdio: 'pipe'});
        execFileSync(process.execPath, ['--check', stateProviderFile], {stdio: 'pipe'});
    });

    test('places controller and stateProvider configs before _vdom on component.Base views', () => {
        execFileSync(
            process.execPath,
            [classScriptPath, '-c', 'MyApp.view.HeaderComponent', '-b', 'component.Base', '-n', 'no', '-C', 'yes', '-p', 'yes'],
            {cwd: tmpDir, stdio: 'pipe'}
        );

        const
            viewFile          = path.join(tmpDir, 'apps', 'myapp', 'view', 'HeaderComponent.mjs'),
            controllerFile    = path.join(tmpDir, 'apps', 'myapp', 'view', 'HeaderComponentController.mjs'),
            stateProviderFile = path.join(tmpDir, 'apps', 'myapp', 'view', 'HeaderComponentStateProvider.mjs'),
            viewContent       = fs.readFileSync(viewFile, 'utf8');

        expect(fs.existsSync(viewFile)).toBe(true);
        expect(fs.existsSync(controllerFile)).toBe(true);
        expect(fs.existsSync(stateProviderFile)).toBe(true);

        const
            controllerIdx    = viewContent.indexOf('controller: HeaderComponentController,'),
            stateProviderIdx = viewContent.indexOf('stateProvider: HeaderComponentStateProvider,'),
            vdomIdx          = viewContent.indexOf('_vdom:');

        expect(controllerIdx).toBeGreaterThan(-1);
        expect(stateProviderIdx).toBeGreaterThan(controllerIdx);
        expect(vdomIdx).toBeGreaterThan(stateProviderIdx);

        execFileSync(process.execPath, ['--check', viewFile], {stdio: 'pipe'});
        execFileSync(process.execPath, ['--check', controllerFile], {stdio: 'pipe'});
        execFileSync(process.execPath, ['--check', stateProviderFile], {stdio: 'pipe'});
    });

    test('does not generate controller or stateProvider when createController and createStateProvider are no', () => {
        execFileSync(
            process.execPath,
            [classScriptPath, '-c', 'MyApp.view.FooterComponent', '-b', 'component.Base', '-n', 'no', '-C', 'no', '-p', 'no'],
            {cwd: tmpDir, stdio: 'pipe'}
        );

        const
            viewFile          = path.join(tmpDir, 'apps', 'myapp', 'view', 'FooterComponent.mjs'),
            controllerFile    = path.join(tmpDir, 'apps', 'myapp', 'view', 'FooterComponentController.mjs'),
            stateProviderFile = path.join(tmpDir, 'apps', 'myapp', 'view', 'FooterComponentStateProvider.mjs');

        expect(fs.existsSync(viewFile)).toBe(true);
        expect(fs.existsSync(controllerFile)).toBe(false);
        expect(fs.existsSync(stateProviderFile)).toBe(false);
    });
});
