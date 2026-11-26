'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const flag = process.argv.indexOf('--vscode-executable');
let ts;
let vscodeTypes;
if (flag >= 0) {
  const app = path.join(path.dirname(process.argv[flag + 1]), 'resources', 'app');
  ts = require(path.join(app, 'extensions', 'node_modules', 'typescript', 'lib', 'typescript.js'));
  vscodeTypes = path.join(app, 'out', 'vscode-dts', 'vscode.d.ts');
  if (!fs.existsSync(vscodeTypes)) { throw new Error('VS Code bundled declarations not found. Use npm install and npm run compile.'); }
} else {
  ts = require('typescript');
}
const configPath = path.join(root, 'tsconfig.json');
const config = ts.readConfigFile(configPath, ts.sys.readFile);
if (config.error) { throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n')); }
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
if (vscodeTypes) {
  parsed.options.baseUrl = root;
  parsed.options.paths = { vscode: [vscodeTypes] };
  parsed.options.types = [];
}
const program = ts.createProgram(parsed.fileNames, parsed.options);
const diagnostics = [...parsed.errors, ...ts.getPreEmitDiagnostics(program)];
if (!diagnostics.length) {
  diagnostics.push(...program.emit().diagnostics);
}
if (diagnostics.length) {
  console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCurrentDirectory: () => root,
    getCanonicalFileName: file => file,
    getNewLine: () => '\n'
  }));
  process.exitCode = 1;
} else {
  console.log(`Compiled Jon's RPGLE-free formatter (TypeScript ${ts.version}).`);
}