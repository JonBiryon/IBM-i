"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
const vscode = require("vscode");
const comments_1 = require("./comments");
const formatter_1 = require("./formatter");
function activate(context) {
    const output = vscode.window.createOutputChannel("Jon's RPGLE-free formatter");
    context.subscriptions.push(output);
    context.subscriptions.push(vscode.languages.registerDocumentFormattingEditProvider([{ language: 'rpgle' }, { language: 'sqlrpgle' }], {
        provideDocumentFormattingEdits(document, _options, token) {
            if (token.isCancellationRequested) {
                return [];
            }
            try {
                const lines = Array.from({ length: document.lineCount }, (_, line) => document.lineAt(line).text);
                if (token.isCancellationRequested) {
                    return [];
                }
                const plan = (0, formatter_1.formatSource)(lines);
                if (token.isCancellationRequested) {
                    return [];
                }
                for (const notice of plan.notices) {
                    output.appendLine(String(notice));
                }
                return plan.edits.map(edit => vscode.TextEdit.replace(new vscode.Range(edit.line, edit.start, edit.line, edit.end), edit.text));
            }
            catch (error) {
                if (!token.isCancellationRequested) {
                    output.appendLine('Formatting failed: ' + String(error));
                }
                return [];
            }
        }
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
            if (plan.delegate) {
                // Preserve the existing language extension's fixed-format implementation.
                await vscode.commands.executeCommand('editor.action.commentLine');
                return;
            }
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