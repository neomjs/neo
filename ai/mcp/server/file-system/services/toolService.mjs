import path              from 'path';
import {fileURLToPath}   from 'url';
import FileSystemService from './FileSystemService.mjs';
import ToolService       from '../../../ToolService.mjs';

const __filename      = fileURLToPath(import.meta.url);
const __dirname       = path.dirname(__filename);
const openApiFilePath = path.join(__dirname, '../openapi.yaml');

const serviceMapping = {
    healthcheck          : FileSystemService.healthcheck.bind(FileSystemService),
    get_mcp_tool_handbook: toolId => toolService.getToolHandbook(toolId),
    read_file            : FileSystemService.readFile.bind(FileSystemService),
    write_file           : FileSystemService.writeFile.bind(FileSystemService),
    list_directory       : FileSystemService.listDirectory.bind(FileSystemService),
    check_syntax         : FileSystemService.checkSyntax.bind(FileSystemService),
    run_playwright_test  : FileSystemService.runPlaywrightTest.bind(FileSystemService)
};

const toolService = Neo.create(ToolService, {
    compactToolDescriptions     : true,
    compactToolSchemas          : true,
    openApiFilePath,
    serviceMapping,
    toolListDescriptionMaxLength: 120
});

const callTool  = toolService.callTool.bind(toolService);
const listTools = toolService.listTools.bind(toolService);

export {callTool, listTools};
