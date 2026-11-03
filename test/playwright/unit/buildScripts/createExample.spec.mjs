import fs                from 'fs-extra';
import os                from 'os';
import path              from 'path';
import {test, expect}    from '@playwright/test';
import {generateExample} from '../../../../buildScripts/create/example.mjs';

test.describe('buildScripts/create/example.mjs depth-aware relative paths', () => {
    let tmpDir;

    test.beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-create-example-'));
    });

    test.afterEach(() => {
        if (tmpDir && fs.existsSync(tmpDir)) {
            fs.removeSync(tmpDir);
        }
    });

    test('computes 3-level relative rootPrefix and 2-level examplesPrefix for 2-segment class names', () => {
        const folder    = generateExample('Neo.button.Base', tmpDir),
              indexHtml = fs.readFileSync(path.join(folder, 'index.html'), 'utf8'),
              neoConfig = JSON.parse(fs.readFileSync(path.join(folder, 'neo-config.json'), 'utf8')),
              mainCont  = fs.readFileSync(path.join(folder, 'MainContainer.mjs'), 'utf8');

        expect(folder).toBe(path.join(tmpDir, 'examples', 'button', 'base'));
        expect(indexHtml).toContain('<script src="../../../src/MicroLoader.mjs" type="module"></script>');
        expect(indexHtml.trim().endsWith('</html>')).toBe(true);
        expect(neoConfig.appPath).toBe('examples/button/base/app.mjs');
        expect(neoConfig.basePath).toBe('../../../');
        expect(mainCont).toContain("import ConfigurationViewport from '../../ConfigurationViewport.mjs';");
        expect(mainCont).toContain("import NumberField           from '../../../src/form/field/Number.mjs';");
        expect(mainCont).toContain("import Base               from '../../../src/button/Base.mjs';");
    });

    test('computes 4-level relative rootPrefix and 3-level examplesPrefix for 3-segment class names', () => {
        const folder    = generateExample('Neo.form.field.Text', tmpDir),
              indexHtml = fs.readFileSync(path.join(folder, 'index.html'), 'utf8'),
              neoConfig = JSON.parse(fs.readFileSync(path.join(folder, 'neo-config.json'), 'utf8')),
              mainCont  = fs.readFileSync(path.join(folder, 'MainContainer.mjs'), 'utf8');

        expect(folder).toBe(path.join(tmpDir, 'examples', 'form', 'field', 'text'));
        expect(indexHtml).toContain('<script src="../../../../src/MicroLoader.mjs" type="module"></script>');
        expect(indexHtml.trim().endsWith('</html>')).toBe(true);
        expect(neoConfig.appPath).toBe('examples/form/field/text/app.mjs');
        expect(neoConfig.basePath).toBe('../../../../');
        expect(mainCont).toContain("import ConfigurationViewport from '../../../ConfigurationViewport.mjs';");
        expect(mainCont).toContain("import NumberField           from '../../../../src/form/field/Number.mjs';");
        expect(mainCont).toContain("import Text               from '../../../../src/form/field/Text.mjs';");
    });
});
