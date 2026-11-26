"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
const vscode = require("vscode");
const comments_1 = require("./comments");
const formatter_1 = require("./formatter");
function activate(context) {
    const output = vscode.window.createOutputChannel("Jon's RPGLE-free formatter");
    context.subscriptions.push(output);
    const decoration = vscode.window.createTextEditorDecorationType({
        textDecoration: 'underline wavy rgba(220, 170, 0, 1)',
        rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
    });
    const feedback = new Map();
    function paint(document, decorations) {
        for (const editor of vscode.window.visibleTextEditors) {
            if (editor.document === document) editor.setDecorations(decoration, decorations);
        }
    }
    function remap(position, edits) {
        let point = { line: position.line, character: position.character };
        // Apply from the end so every edit is still in original coordinates.
        for (const edit of [...edits].sort((a, b) =>
            b.range.start.line - a.range.start.line || b.range.start.character - a.range.start.character)) {
            const { start, end } = edit.range;
            if (point.line < end.line || point.line === end.line && point.character < end.character) continue;
            const parts = edit.newText.split(/\r\n|\n|\r/);
            const newEnd = { line: start.line + parts.length - 1,
                character: parts.length === 1 ? start.character + parts[0].length : parts.at(-1).length };
            if (point.line === end.line) {
                point = { line: newEnd.line, character: newEnd.character + point.character - end.character };
            } else point.line += newEnd.line - end.line;
        }
        return point;
    }
    function clear(document) {
        const state = feedback.get(document);
        if (state) clearTimeout(state.timer);
        feedback.delete(document);
        for (const editor of vscode.window.visibleTextEditors) {
            if (editor.document === document) editor.setDecorations(decoration, []);
        }
    }
    function clearAll() {
        for (const document of feedback.keys()) clear(document);
    }
    context.subscriptions.push(decoration, { dispose: clearAll });
    context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(event => {
        const state = feedback.get(event.document);
        if (!state || !event.contentChanges.length) return;
        // Ignore only the exact, next-version formatting transaction, not an
        // arbitrary edit while an async command or provider result is pending.
        const expected = state.expected;
        state.expected = undefined;
        const same = expected && event.document.version === state.version + 1 &&
            expected.length === event.contentChanges.length && expected.every(edit =>
                event.contentChanges.some(change => change.text === edit.newText &&
                    change.range.isEqual(edit.range)));
        if (!same) {
            clear(event.document);
        } else {
            state.decorations = state.decorations.map(item => {
                const start = remap(item.range.start, expected);
                const end = remap(item.range.end, expected);
                return { ...item, range: new vscode.Range(start.line, start.character, end.line, end.character) };
            });
            state.version = event.document.version;
            paint(event.document, state.decorations);
        }
    }));
    context.subscriptions.push(vscode.workspace.onDidCloseTextDocument(clear));
    function publish(document, plan, edits) {
        for (const notice of plan.notices) output.appendLine(String(notice));
        const decorations = plan.skipped.map(skip => ({
            range: new vscode.Range(skip.start.line, skip.start.character, skip.end.line, skip.end.character),
            hoverMessage: "Jon's RPGLE-free formatter: " + skip.reason
        }));
        if (decorations.length) {
            const state = { version: document.version, expected: edits, decorations,
                timer: setTimeout(() => clear(document), 12000) };
            feedback.set(document, state);
            paint(document, decorations);
        }
        vscode.window.setStatusBarMessage(`RPGLE: ${edits.length} edit(s), ${plan.skipped.length} skipped range(s).`, 4000);
    }
    function provide(document, ranges, token) {
            clearAll();
            if (token.isCancellationRequested) {
                return [];
            }
            try {
                const lines = Array.from({ length: document.lineCount }, (_, line) => document.lineAt(line).text);
                if (token.isCancellationRequested) {
                    return [];
                }
                const plan = (0, formatter_1.planFormatting)(lines, ranges);
                if (token.isCancellationRequested) {
                    return [];
                }
                const edits = plan.edits.map(edit => vscode.TextEdit.replace(new vscode.Range(edit.line, edit.start, edit.endLine ?? edit.line, edit.end), edit.text.replace(/\n/g, document.eol === vscode.EndOfLine.CRLF ? '\r\n' : '\n')));
                publish(document, plan, edits);
                return edits;
            }
            catch (error) {
                if (!token.isCancellationRequested) {
                    output.appendLine('Formatting failed: ' + String(error));
                }
                return [];
            }
    }
    const selector = [{ language: 'rpgle' }, { language: 'sqlrpgle' }];
    context.subscriptions.push(vscode.languages.registerDocumentFormattingEditProvider(selector, {
        provideDocumentFormattingEdits(document, _options, token) { return provide(document, undefined, token); }
    }));
    context.subscriptions.push(vscode.languages.registerDocumentRangeFormattingEditProvider(selector, {
        provideDocumentRangeFormattingEdits(document, range, _options, token) { return provide(document, [range], token); },
        provideDocumentRangesFormattingEdits(document, ranges, _options, token) { return provide(document, ranges, token); }
    }));
    let formatting = false;
    context.subscriptions.push(vscode.commands.registerCommand('rpgleFreeFormatter.formatSelectionOrDocument', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor || formatting || !['rpgle', 'sqlrpgle'].includes(editor.document.languageId)) return;
        formatting = true;
        const document = editor.document;
        try {
            const version = document.version;
            const ranges = editor.selections.filter(selection => !selection.isEmpty);
            const edits = provide(document, ranges.length ? ranges : undefined, { isCancellationRequested: false });
            if (!edits.length) return;
            if (document.version !== version || !await editor.edit(builder => {
                for (const edit of edits) builder.replace(edit.range, edit.newText);
            }, { undoStopBefore: true, undoStopAfter: true })) {
                clear(document);
                vscode.window.setStatusBarMessage('RPGLE: formatting edits could not be applied.', 4000);
            }
        } catch (error) {
            clear(document);
            output.appendLine('Formatting failed: ' + String(error));
        } finally { formatting = false; }
    }));
    let busy = false;
    context.subscriptions.push(vscode.commands.registerCommand('rpgleFreeFormatter.toggle', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor || busy || !['rpgle', 'sqlrpgle'].includes(editor.document.languageId)) {
            return;
        }
        busy = true;
        try {
            const document = editor.document;
            const version = document.version;
            const selections = [...editor.selections];
            const lines = Array.from({ length: document.lineCount }, (_, line) => document.lineAt(line).text);
            const plan = (0, comments_1.planToggle)(lines, (0, comments_1.selectedLines)(selections, lines.length));
            if (plan.edits.length && document.version === version) {
                const applied = await editor.edit(builder => {
                    for (const edit of plan.edits) {
                        builder.replace(new vscode.Range(edit.line, edit.start, edit.line, edit.end), edit.text);
                    }
                }, { undoStopBefore: true, undoStopAfter: true });
                if (applied && vscode.window.activeTextEditor === editor && document.version === version + 1) {
                    editor.selections = selections.map(selection => {
                        const anchor = (0, comments_1.mapPoint)(selection.anchor, plan.edits);
                        const active = (0, comments_1.mapPoint)(selection.active, plan.edits);
                        return new vscode.Selection(anchor.line, anchor.character, active.line, active.character);
                    });
                }
                else if (!applied) {
                    void vscode.window.showWarningMessage("Jon's RPGLE-free formatter: the document could not be edited.");
                }
            }
            if (plan.notices.length) {
                void vscode.window.showWarningMessage("Jon's RPGLE-free formatter: " + plan.notices.join(' '));
            }
        }
        catch (error) {
            void vscode.window.showErrorMessage("Jon's RPGLE-free formatter: " + String(error));
        }
        finally {
            busy = false;
        }
    }));
}
//# sourceMappingURL=extension.js.map