'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

class Position {
  constructor(line, character) { this.line = line; this.character = character; }
}
class Range {
  constructor(sl, sc, el, ec) { this.start = new Position(sl, sc); this.end = new Position(el, ec); }
}
class Selection extends Range {
  constructor(al, ac, bl, bc) {
    const forward = al < bl || (al === bl && ac <= bc);
    super(...(forward ? [al, ac, bl, bc] : [bl, bc, al, ac]));
    this.anchor = new Position(al, ac); this.active = new Position(bl, bc);
  }
}

const callbacks = new Map();
const executed = [];
const warnings = [];
const errors = [];
const outputLines = [];
const replacements = [];
const registrations = [];
const formatterCalls = [];
let formatter = () => ({ edits: [], notices: [] });
const output = { appendLine(message) { outputLines.push(message); }, dispose() {} };
const vscode = {
  Range, Selection,
  TextEdit: {
    replace(range, newText) {
      const edit = { range, newText };
      replacements.push(edit);
      return edit;
    }
  },
  languages: {
    registerDocumentFormattingEditProvider(selector, provider) {
      const disposable = { dispose() {} };
      registrations.push({ selector, provider, disposable });
      return disposable;
    }
  },
  commands: {
    registerCommand(name, callback) { callbacks.set(name, callback); return { dispose() {} }; },
    async executeCommand(name) { executed.push(name); }
  },
  window: {
    activeTextEditor: undefined,
    createOutputChannel(name) { assert.equal(name, "Jon's RPGLE-free formatter"); return output; },
    showWarningMessage(message) { warnings.push(message); },
    showErrorMessage(message) { errors.push(message); }
  }
};
const originalLoad = Module._load;
let extension;
try {
  Module._load = function(name, ...args) {
    if (name === 'vscode') { return vscode; }
    // Test only the adapter contract, independent of the separately owned formatter.
    if (name === './formatter' && args[0]?.filename === require.resolve('../out/extension.js')) {
      return { formatSource(lines) { formatterCalls.push([...lines]); return formatter(lines); } };
    }
    return originalLoad.call(this, name, ...args);
  };
  extension = require('../out/extension.js');
} finally { Module._load = originalLoad; }
const context = { subscriptions: [] };
extension.activate(context);
const provider = registrations[0].provider;

function editorFor(lines, selections, languageId = 'rpgle') {
  const document = {
    languageId, version: 1, lineCount: lines.length,
    uri: 'member:/SYNTHLIB/QRPGLESRC/TEST.RPGLE',
    lineAt(line) { return { text: lines[line] }; }
  };
  return {
    document, selections, calls: 0,
    async edit(callback, options) {
      this.calls++; this.options = options;
      callback({ replace(range, text) {
        const index = range.start.line;
        lines[index] = lines[index].slice(0, range.start.character) + text + lines[index].slice(range.end.character);
      } });
      document.version++;
      return true;
    }
  };
}

test('adapter edits member documents in one undo unit and preserves reversed selections', async () => {
  const lines = ['**free', '  x();', '   y();', 'end;'];
  const editor = editorFor(lines, [new Selection(3, 0, 1, 2), new Selection(1, 2, 1, 2)]);
  vscode.window.activeTextEditor = editor;
  await callbacks.get('rpgleFreeFormatter.toggle')();
  assert.deepEqual(lines, ['**free', '// x();', '// y();', 'end;']);
  assert.equal(editor.calls, 1);
  assert.deepEqual(editor.options, { undoStopBefore: true, undoStopAfter: true });
  assert.deepEqual(editor.selections[0].anchor, new Position(3, 0));
  assert.deepEqual(editor.selections[0].active, new Position(1, 3));
});

test('adapter delegates fixed-only selection to the built-in toggle', async () => {
  const editor = editorFor(['     C                   return'], [new Selection(0, 0, 0, 0)]);
  vscode.window.activeTextEditor = editor;
  executed.length = 0;
  await callbacks.get('rpgleFreeFormatter.toggle')();
  assert.deepEqual(executed, ['editor.action.commentLine']);
  assert.equal(editor.calls, 0);
});

test('adapter leaves other languages unchanged, including when invoked directly', async () => {
  const editor = editorFor(['**free', 'x();'], [new Selection(1, 0, 1, 0)], 'javascript');
  vscode.window.activeTextEditor = editor;
  await callbacks.get('rpgleFreeFormatter.toggle')();
  assert.equal(editor.calls, 0);
});

test('adapter refuses mixed fixed/free selection without invoking the built-in command', async () => {
  const lines = ['     C                   return', '       x();'];
  const editor = editorFor(lines, [new Selection(0, 0, 1, 11)]);
  vscode.window.activeTextEditor = editor;
  executed.length = 0; warnings.length = 0;
  await callbacks.get('rpgleFreeFormatter.toggle')();
  assert.equal(editor.calls, 0);
  assert.deepEqual(executed, []);
  assert.match(warnings[0], /separately/);
});

test('formatter registers both languages without restricting schemes and disposes resources', () => {
  assert.equal(registrations.length, 1);
  assert.deepEqual(registrations[0].selector, [{ language: 'rpgle' }, { language: 'sqlrpgle' }]);
  assert.ok(context.subscriptions.includes(output));
  assert.ok(context.subscriptions.includes(registrations[0].disposable));
  assert.ok(callbacks.has('rpgleFreeFormatter.toggle'));
  assert.equal(callbacks.has('rpgleFreeCommenter.toggle'), false);
});

test('formatter maps only planned prefixes to TextEdit.replace for both member language modes', () => {
  for (const language of ['rpgle', 'sqlrpgle']) {
    const lines = ['**free', '    x();  ', 'y();'];
    const editor = editorFor(lines, [], language);
    const edits = [
      { line: 1, start: 0, end: 4, text: '  ' },
      { line: 2, start: 0, end: 0, text: '  ' }
    ];
    formatter = input => {
      assert.deepEqual(input, lines);
      return { edits, notices: [] };
    };
    replacements.length = 0;
    const result = provider.provideDocumentFormattingEdits(editor.document,
      { tabSize: 8, insertSpaces: false }, { isCancellationRequested: false });
    assert.deepEqual(result, [
      { range: new Range(1, 0, 1, 4), newText: '  ' },
      { range: new Range(2, 0, 2, 0), newText: '  ' }
    ]);
    assert.deepEqual(result, replacements);
    assert.strictEqual(result[0], replacements[0]);
    assert.deepEqual(lines, ['**free', '    x();  ', 'y();']);
    assert.equal(editor.calls, 0);
  }
});

test('formatter notices go only to the output channel, including unsupported-source notices', () => {
  const document = editorFor(['       x();'], []).document;
  formatter = () => ({ edits: [], notices: ['Mixed source is unsupported.', 'Skipped ambiguous statement.'] });
  outputLines.length = 0; warnings.length = 0; errors.length = 0;
  assert.deepEqual(provider.provideDocumentFormattingEdits(document, {}, { isCancellationRequested: false }), []);
  assert.deepEqual(outputLines, ['Mixed source is unsupported.', 'Skipped ambiguous statement.']);
  assert.deepEqual(warnings, []);
  assert.deepEqual(errors, []);
});

test('formatter cancellation before reading skips formatting, logging and replacements', () => {
  formatterCalls.length = 0; replacements.length = 0; outputLines.length = 0;
  const document = { get lineCount() { throw new Error('Cancelled document must not be read'); } };
  assert.deepEqual(provider.provideDocumentFormattingEdits(document, {}, { isCancellationRequested: true }), []);
  assert.deepEqual(formatterCalls, []);
  assert.deepEqual(replacements, []);
  assert.deepEqual(outputLines, []);
});

test('formatter cancellation while collecting lines skips the engine', () => {
  const token = { isCancellationRequested: false };
  const document = { lineCount: 1, lineAt() { token.isCancellationRequested = true; return { text: '**free' }; } };
  formatterCalls.length = 0;
  assert.deepEqual(provider.provideDocumentFormattingEdits(document, {}, token), []);
  assert.deepEqual(formatterCalls, []);
});

test('formatter cancellation after planning discards edits and notices', () => {
  const token = { isCancellationRequested: false };
  const document = editorFor(['**free', 'x();'], []).document;
  formatter = () => {
    token.isCancellationRequested = true;
    return { edits: [{ line: 1, start: 0, end: 0, text: '  ' }], notices: ['Do not log cancelled work.'] };
  };
  replacements.length = 0; outputLines.length = 0;
  assert.deepEqual(provider.provideDocumentFormattingEdits(document, {}, token), []);
  assert.deepEqual(replacements, []);
  assert.deepEqual(outputLines, []);
});

test('formatter failures log to output without format-on-save dialogs', () => {
  const document = editorFor(['**free', 'x();'], []).document;
  formatter = () => { throw new Error('Synthetic formatter failure'); };
  outputLines.length = 0; warnings.length = 0; errors.length = 0;
  assert.deepEqual(provider.provideDocumentFormattingEdits(document, {}, { isCancellationRequested: false }), []);
  assert.match(outputLines[0], /Formatting failed: Error: Synthetic formatter failure/);
  assert.deepEqual(warnings, []);
  assert.deepEqual(errors, []);
});