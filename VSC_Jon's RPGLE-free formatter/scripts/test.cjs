'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { formatSource, planFormatting } = require('../out/formatter');
const { planToggle, selectedLines } = require('../out/comments');

let passed = 0;
const tests = [];
function test(name, run) {
    tests.push({ name, run });
}
function apply(source, edits) {
    const lines = source.split('\n');
    const offsets = [];
    let offset = 0;
    for (const line of lines) { offsets.push(offset); offset += line.length + 1; }
    const ascending = [...edits].sort((a, b) => a.line - b.line || a.start - b.start);
    for (let index = 0; index < ascending.length; index++) {
        const edit = ascending[index];
        assert.ok(edit.line >= 0 && edit.line < lines.length);
        const endLine = edit.endLine ?? edit.line;
        assert.ok(endLine >= edit.line && endLine < lines.length);
        assert.ok(edit.start >= 0 && edit.start <= lines[edit.line].length && edit.end >= 0 && edit.end <= lines[endLine].length);
        assert.ok(offsets[edit.line] + edit.start <= offsets[endLine] + edit.end);
        const previous = ascending[index - 1];
        assert.ok(!previous || offsets[previous.endLine ?? previous.line] + previous.end < offsets[edit.line] + edit.start,
            'Edits must not overlap or share an ambiguous insertion boundary');
    }
    for (const edit of ascending.reverse()) {
        source = source.slice(0, offsets[edit.line] + edit.start) + edit.text + source.slice(offsets[edit.endLine ?? edit.line] + edit.end);
    }
    return source;
}
function fingerprint(source) {
    let code = '';
    const literals = [];
    const comments = [];
    for (let i = 0; i < source.length; i++) {
        const char = source[i];
        if (char === '/' && source[i + 1] === '/') {
            const end = source.indexOf('\n', i);
            comments.push(source.slice(i, end < 0 ? source.length : end));
            i = end < 0 ? source.length : end;
        } else if (char === "'" || char === '"') {
            const start = i;
            const quote = char;
            while (++i < source.length) {
                if (source[i] === quote) {
                    if (source[i + 1] === quote) i++;
                    else break;
                }
            }
            literals.push(source.slice(start, i + 1));
            code += ' literal ';
        } else if (!/\s/.test(char)) {
            code += char;
        }
    }
    return { code, literals, comments };
}
function formatted(source, expected) {
    const plan = formatSource(source.split('\n'));
    const result = apply(source, plan.edits);
    if (expected !== undefined) assert.equal(result, expected);
    assert.deepEqual(formatSource(result.split('\n')).edits, [], 'Formatting must be idempotent');
    // Only whitespace and final-semicolon placement may change, never tokens.
    assert.deepEqual(fingerprint(result), fingerprint(source));
    return result;
}
function unchanged(source) {
    const plan = formatSource(source.split('\n'));
    assert.deepEqual(plan.edits, []);
    assert.ok(plan.notices.length, 'Unsupported source must explain its refusal');
}

test('DATA-INTO general structural wrap', () => {
    formatted("**FREE\ndata-into target\n%data(payload : 'doc=file')\n%parser('parser');",
        "**FREE\n   data-into target\n      %data(payload : 'doc=file')\n      %parser('parser')\n   ;");
});
test('DATA-GEN nested closing expressions', () => {
    formatted("**FREE\ndata-gen target\n%data(output : 'doc=file')\n%gen('generator'\n: %options(\n'one'\n)\n);",
        "**FREE\n   data-gen target\n      %data(output : 'doc=file')\n      %gen('generator'\n         : %options(\n              'one'\n           )\n      )\n   ;");
});
test('SND-MSG structural wrap retains +1 continuation', () => {
    formatted("**FREE\nsnd-msg ('Hello ' +\nname);",
        "**FREE\n   snd-msg ('Hello ' +\n    name)\n   ;");
});
test('Calls are structural without operation-specific rules', () => {
    formatted('**FREE\nDoWork(first\n: second);', '**FREE\n   DoWork(first\n      : second)\n   ;');
});
test('Assignment readability wrapping uses +3', () => {
    formatted('**FREE\nvalue = first +\nsecond;', '**FREE\n   value = first +\n      second\n   ;');
});
test('Declaration structural wrapping', () => {
    formatted('**FREE\ndcl-s value char(20)\nin dim(2);',
        '**FREE\n   dcl-s value char(20)\n      in dim(2)\n   ;');
});
test('Standalone semicolon aligns with statement start', () => {
    formatted('**FREE\nDoWork(first\n: second)\n        ; // end',
        '**FREE\n   DoWork(first\n      : second)\n   ; // end');
});
test('Single-line statements retain attached ending', () => {
    formatted("**FREE\nsnd-msg 'Hello';\nDoWork();", "**FREE\n   snd-msg 'Hello';\n   DoWork();");
});
test('Literal + wrapping alone retains attached ending and spaces', () => {
    formatted("**FREE\nsnd-msg '  first  ' +\n'  second  ';",
        "**FREE\n   snd-msg '  first  ' +\n    '  second  ';");
});
test('Parenthesised literal-only wrapping retains attached ending', () => {
    formatted("**FREE\nsnd-msg ('  first  ' +\n'  second  ');",
        "**FREE\n   snd-msg ('  first  ' +\n    '  second  ');");
});
test('Code after a literal continuation does not create a structural break', () => {
    formatted("**FREE\nDoWork('first +\n second' : option);",
        "**FREE\n   DoWork('first +\n second' : option);");
});
test('User-style DATA-INTO literal wrap keeps attached ending', () => {
    const source = "**FREE\n   data-into p_OutDS %data(out_REST:'case=convert trim=all allowextra=yes +\n             allowmissing=yes') %parser('YAJLINTO':'{\"number_prefix\":\"YAJL_\"}');";
    formatted(source, source);
});
test('User-style nested DATA-GEN closing layout is stable', () => {
    const source = `**FREE
   data-gen p_InpDS
      %data(inp_REST:'countprefix=num_')
      %gen('YAJLDTAGEN':
         '{ +
            "write to stdout": false, +
            "include empty arrays" : false +
         }'
      )
   ;`;
    formatted(source, source);
});
test('Structural statement ending with a continued quote and parenthesis', () => {
    formatted("**FREE\nDoWork(\n'first +\n second'); // explanation",
        "**FREE\n   DoWork(\n      'first +\n second') // explanation\n   ;");
});
test('Continued literal whitespace is byte-for-byte protected', () => {
    formatted("**FREE\nsnd-msg '  first +   \n       second  ';",
        "**FREE\n   snd-msg '  first +   \n       second  ';");
});
test('Continued literals do not interpret source-like content', () => {
    formatted("**FREE\nvalue = 'first +\n// ; /COPY ( still literal\n**data is literal\nlast';",
        "**FREE\n   value = 'first +\n// ; /COPY ( still literal\n**data is literal\nlast';");
});
test('Structural wrap plus literal continuation still splits semicolon', () => {
    formatted("**FREE\nDoWork(\n'  first +  \n       second  ');",
        "**FREE\n   DoWork(\n      '  first +  \n       second  ')\n   ;");
});
test('Structural message ending on a literal is not a standalone semicolon', () => {
    formatted("**FREE\nsnd-msg 'Hi ' +\nname +\n'  end  ';",
        "**FREE\n   snd-msg 'Hi ' +\n    name +\n    '  end  '\n   ;");
});
test('Doubled quotes, comment markers and punctuation in literals', () => {
    formatted("**FREE\nDoWork('it''s // ; (  '\n: \"double \"\" quote ; )  \" );",
        "**FREE\n   DoWork('it''s // ; (  '\n      : \"double \"\" quote ; )  \" )\n   ;");
});
test('Final inline comments stay unchanged on their original code line', () => {
    formatted('**FREE\nDoWork(first\n: second);  // Keep ; here  ',
        '**FREE\n   DoWork(first\n      : second)  // Keep ; here  \n   ;');
});
test('Nested closers align with matching opening expression', () => {
    formatted('**FREE\nDoWork(\n%trim(\nvalue\n)\n);',
        '**FREE\n   DoWork(\n      %trim(\n         value\n      )\n   )\n   ;');
});
test('A combined closer line aligns with its innermost opening expression', () => {
    formatted('**FREE\nDoWork(\n%trim(\nvalue\n));',
        '**FREE\n   DoWork(\n      %trim(\n         value\n      ))\n   ;');
});
test('Block and branch indentation with structural condition', () => {
    formatted('**FREE\nif first and\nsecond;\nDoWork();\nelse;\nOtherWork();\nendif;',
        '**FREE\n   if first and\n    second\n   ;\n      DoWork();\n   else;\n      OtherWork();\n   endif;');
});
test('Operation-like assignment targets are not openers', () => {
    formatted('**FREE\nif = first +\nsecond;\nselect = 1;',
        '**FREE\n   if = first +\n      second\n   ;\n   select = 1;');
});
test('Single declarations and inline END declarations', () => {
    formatted('**FREE\ndcl-ds item likeds(other);\ndcl-pr Empty end-pr;');
    formatted('**FREE\ndcl-ds item likerec(other);\ndcl-pi *n end-pi;');
});
test('Comments, banners and commented-out code retain baseline policy', () => {
    formatted('**FREE\n// ordinary\n/// banner\n // old();\nDoWork(\n // inside\nvalue);',
        '**FREE\n  // ordinary\n/// banner\n // old();\n   DoWork(\n // inside\n      value)\n   ;');
});
test('Program data and /EOF protect the remainder', () => {
    for (const marker of ['**DATA', '/EOF']) {
        formatted('**FREE\nDoWork();\n' + marker + '\n\t untouched ( ;',
            '**FREE\n   DoWork();\n' + marker + '\n\t untouched ( ;');
    }
});
test('BOM and case-insensitive fully-free directive', () => {
    formatted('\uFEFF**free\nDoWork();', '\uFEFF**free\n   DoWork();');
});
test('Unsupported source formats are refused', () => {
    for (const source of ['DoWork();', ' **FREE\nDoWork();', '**FREE extra\nDoWork();', '      /FREE\nDoWork();']) {
        unchanged(source);
    }
});
test('Conditional directives and embedded SQL are refused atomically', () => {
    for (const source of ['/if defined(x)', '/else', '/endif', 'exec sql select 1;']) {
        unchanged('**FREE\nDoWork();\n' + source);
    }
});
test('COPY and INCLUDE before code preserve directive bytes in both formatting paths', () => {
    for (const directive of ['/copy lib,member  ', ' \t/InClUdE "missing path/member" // untouched  ']) {
        const source = '**FREE\n' + directive + '\nDoWork();';
        const expected = '**FREE\n' + directive + '\n   DoWork();';
        formatted(source, expected);
        const plan = planFormatting(source.split('\n'));
        const result = apply(source, plan.edits);
        assert.equal(result, expected);
        assert.equal(plan.skipped.length, 0);
        assert.ok(plan.edits.every(edit => edit.line === 2));
        assert.deepEqual(Buffer.from(result.split('\n')[1]), Buffer.from(directive));
        assert.deepEqual(planFormatting(result.split('\n')).edits, []);
    }
});
test('COPY and INCLUDE inside visible nested blocks retain local context', () => {
    const source = '**FREE\nif x;\n /COPY missing,one  \nif y;\n/include missing,two\nDoWork();\nelse;\nNext();\nendif;\nendif;';
    const expected = '**FREE\n   if x;\n /COPY missing,one  \n      if y;\n/include missing,two\n         DoWork();\n      else;\n         Next();\n      endif;\n   endif;';
    formatted(source, expected);
    const plan = planFormatting(source.split('\n'));
    assert.equal(apply(source, plan.edits), expected);
    assert.equal(plan.skipped.length, 0);
    assert.ok(plan.edits.every(edit => ![2, 4].includes(edit.line)));
});
test('Directive-interrupted noncontrol statements are skipped without swallowing subsequent code', () => {
    for (const directive of ['/copy missing,one', '/include missing,two']) {
        for (const incomplete of ['value = first +', 'DoWork(first']) {
            const source = '**FREE\nBefore();\n' + incomplete + '\n' + directive + '\nAfter();';
            const expected = '**FREE\n   Before();\n' + incomplete + '\n' + directive + '\n   After();';
            const baseline = formatSource(source.split('\n'));
            assert.equal(apply(source, baseline.edits), expected);
            assert.match(baseline.notices.join(' '), /interrupted/);
            const plan = planFormatting(source.split('\n'));
            assert.equal(apply(source, plan.edits), expected);
            assert.equal(plan.skipped.length, 1);
            assert.match(plan.skipped[0].reason, /interrupted/);
            assert.equal(plan.skipped[0].start.line, 2);
            assert.equal(plan.skipped[0].end.line, 2);
            assert.ok(plan.edits.every(edit => [1, 4].includes(edit.line)));
            assert.deepEqual(planFormatting(expected.split('\n')).edits, []);
        }
    }
});
test('Interrupted control syntax does not invent block context after an include', () => {
    for (const directive of ['/copy missing,one', '/include missing,two']) {
        const source = '**FREE\nBefore();\nif x and\n' + directive + '\nAfter();\nendif;';
        unchanged(source);
        const plan = planFormatting(source.split('\n'));
        assert.equal(apply(source, plan.edits), '**FREE\n   Before();\nif x and\n' + directive + '\nAfter();\nendif;');
        assert.ok(plan.skipped.some(item => /interrupted/.test(item.reason)));
        assert.ok(plan.skipped.some(item => /uncertain/.test(item.reason)));
    }
});
test('Directive-looking literal content remains literal in both formatting paths', () => {
    const source = "**FREE\nvalue = 'first +\n/copy missing,one\n/include missing,two\nlast';\nAfter();";
    const expected = "**FREE\n   value = 'first +\n/copy missing,one\n/include missing,two\nlast';\n   After();";
    formatted(source, expected);
    const plan = planFormatting(source.split('\n'));
    assert.equal(apply(source, plan.edits), expected);
    assert.equal(plan.skipped.length, 0);
});
test('Directive pass-through does not relax conditional or unknown-directive barriers', () => {
    for (const directive of ['/if defined(x)', '/else', '/endif', '/copycat x', '/include_extra x']) {
        const source = '**FREE\nBefore();\n/copy missing,one\n' + directive + '\nAfter();';
        unchanged(source);
        const plan = planFormatting(source.split('\n'));
        assert.equal(apply(source, plan.edits), '**FREE\n   Before();\n/copy missing,one\n' + directive + '\nAfter();');
        assert.equal(plan.skipped.length, 1);
        assert.match(plan.skipped[0].reason, /directive/);
    }
});
test('Tabs, block comments and multiple statements are refused', () => {
    for (const source of ['\tDoWork();', 'DoWork(); OtherWork();', "DoWork(); 'extra';", 'DoWork(/* no */);']) {
        unchanged('**FREE\n' + source);
    }
});
test('Malformed parentheses, literals and incomplete statements are refused', () => {
    for (const source of ['DoWork);', 'DoWork(;', 'DoWork(', "value = 'open;", 'value = 1', 'value =\n**DATA']) {
        unchanged('**FREE\n' + source);
    }
});
test('Unbalanced blocks and unsupported control syntax are refused', () => {
    for (const source of ['if x;', 'endif;', 'else;', 'select;\nendif;', 'do;', 'cabxx x;']) {
        unchanged('**FREE\n' + source);
    }
});
test('Retained commenter indentation and selected-line endpoints', () => {
    const source = '**FREE\nvalue = 1;';
    assert.equal(apply(source, planToggle(source.split('\n'), [1]).edits), '**FREE\n// value = 1;');
    assert.deepEqual(selectedLines([{ start: { line: 1, character: 2 }, end: { line: 2, character: 0 } }], 3), [1]);
});
test('Fully-free empty and whitespace-only lines toggle without deleting whitespace', () => {
    for (const blank of ['', ' ', '  ', '   ', '       ', '\t', '  \t  ']) {
        const source = '**FREE\n' + blank;
        const add = planToggle(source.split('\n'), [1]);
        assert.equal(add.delegate, false);
        assert.equal(add.notices.length, 0);
        assert.equal(add.edits.length, 1);
        const width = /^ */.exec(blank)[0].length;
        const first = Math.max(0, width - 3);
        const commented = '**FREE\n' + blank.slice(0, first) + '// ' + blank.slice(width);
        assert.equal(apply(source, add.edits), commented);
        const remove = planToggle(commented.split('\n'), [1]);
        const uncommented = '**FREE\n' + blank.slice(0, first) + '   ' + blank.slice(width);
        assert.equal(apply(commented, remove.edits), uncommented);
        assert.equal(apply(uncommented, planToggle(uncommented.split('\n'), [1]).edits), commented);
    }
});
test('Mixed selected blank and code lines share the comment/uncomment decision', () => {
    const source = '**FREE\n\n   value = 1;\n     \n   // already';
    const chosen = [1, 2, 3, 4];
    const commented = apply(source, planToggle(source.split('\n'), chosen).edits);
    assert.equal(commented, '**FREE\n// \n// value = 1;\n  // \n   // already');
    const uncommented = apply(commented, planToggle(commented.split('\n'), chosen).edits);
    assert.equal(uncommented, '**FREE\n   \n   value = 1;\n     \n      already');
});
test('Commenter includes blank lines regardless of source format or surrounding literal', () => {
    assert.equal(apply('      /FREE\n       \n', planToggle(['      /FREE', '       ', ''], [1, 2]).edits),
        '      /FREE\n    // \n// ');
    const source = "**FREE\nvalue = 'first +\n\n   \nlast';";
    assert.equal(apply(source, planToggle(source.split('\n'), [2, 3]).edits),
        "**FREE\nvalue = 'first +\n// \n// \nlast';");
});
test('Reported continued-literal selection toggles together or one line at a time', () => {
    const lines = ['**free', "      // errmsg = 'Errors occurred while running Program ' +",
        "          %trim(TmpCHANNEL) + '. See the previously listed messages in +",
        "          the job log.';", '   // endmon;'];
    for (const chosen of [[2, 3], [2], [3]]) {
        const plan = planToggle(lines, chosen);
        assert.equal(plan.edits.length, chosen.length);
        assert.deepEqual(plan.notices, []);
        const expected = lines.map((line, index) => chosen.includes(index) ? '       // ' + line.slice(10) : line);
        const commented = apply(lines.join('\n'), plan.edits);
        assert.equal(commented, expected.join('\n'));
        assert.equal(apply(commented, planToggle(commented.split('\n'), chosen).edits), lines.join('\n'));
    }
});
test('Commenter never classifies syntax, directives, data, fixed records or line width', () => {
    const lines = ['**FREE', '/COPY LIB/FILE,MEMBER', '/EOF', '**DATA',
        '     C     fixed-looking record', "value = 'unterminated", 'x'.repeat(90), '   // existing'];
    const chosen = lines.map((_, index) => index);
    const plan = planToggle(lines, chosen);
    assert.equal(plan.delegate, false);
    assert.deepEqual(plan.notices, []);
    assert.equal(plan.edits.length, lines.length - 1);
    const expected = lines.map(line => {
        const first = /^ */.exec(line)[0].length;
        return line.startsWith('//', first) ? line : line.slice(0, Math.max(0, first - 3)) + '// ' + line.slice(first);
    });
    assert.equal(apply(lines.join('\n'), plan.edits), expected.join('\n'));
});
test('Commenter edits only unique in-range selected lines and preserves trailing text', () => {
    const source = "untouched 'open +\n   value;  \n   // existing  \nnot selected";
    const plan = planToggle(source.split('\n'), [-1, 1, 1, 2, 99]);
    assert.equal(plan.edits.length, 1);
    assert.equal(apply(source, plan.edits), "untouched 'open +\n// value;  \n   // existing  \nnot selected");
    assert.deepEqual(planToggle(source.split('\n'), []).edits, []);
});

// Exercise the actual provider without starting an Extension Development Host.
function providerHarness() {
    let provider, rangeProvider, changeListener, closeListener;
    const notices = [], statuses = [], timers = new Set(), commands = new Map();
    class Range {
        constructor(line, start, endLine, end) {
            this.start = { line, character: start };
            this.end = { line: endLine, character: end };
        }
        isEqual(other) { return JSON.stringify(this) === JSON.stringify(other); }
        get isEmpty() { return this.start.line === this.end.line && this.start.character === this.end.character; }
    }
    class Selection extends Range {
        constructor(line, start, endLine, end) {
            super(line, start, endLine, end);
            this.anchor = this.start;
            this.active = this.end;
        }
    }
    const vscode = {
        EndOfLine: { LF: 1, CRLF: 2 },
        DecorationRangeBehavior: { ClosedClosed: 1 },
        Range,
        Selection,
        TextEdit: { replace: (range, text) => ({ range, newText: text, text }) },
        window: {
            visibleTextEditors: [],
            createOutputChannel: () => ({ appendLine: text => notices.push(text) }),
            createTextEditorDecorationType: options => ({ options, dispose() {} }),
            setStatusBarMessage: text => { statuses.push(text); return { dispose() {} }; },
            showWarningMessage: text => { throw new Error(text); },
            showErrorMessage: text => { throw new Error(text); }
        },
        languages: {
            registerDocumentFormattingEditProvider: (_selector, value) => { provider = value; return {}; },
            registerDocumentRangeFormattingEditProvider: (_selector, value) => { rangeProvider = value; return {}; }
        },
        workspace: {
            onDidChangeTextDocument: listener => { changeListener = listener; return {}; },
            onDidCloseTextDocument: listener => { closeListener = listener; return {}; }
        },
        commands: { registerCommand: (name, callback) => { commands.set(name, callback); return {}; } }
    };
    const filename = path.join(__dirname, '../out/extension.js');
    const exports = {};
    vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
        exports,
        setTimeout: callback => { timers.add(callback); return callback; },
        clearTimeout: callback => timers.delete(callback),
        require: name => name === 'vscode' ? vscode : require(path.join(__dirname, '../out', name))
    }, { filename });
    const subscriptions = [];
    exports.activate({ subscriptions });
    function editor(source, selections = [], eol = 1) {
        let lines = source.split('\n');
        const decorations = [];
        const document = { version: 1, eol, languageId: 'rpgle',
            get lineCount() { return lines.length; }, lineAt: line => ({ text: lines[line] }) };
        const value = { document, selections, decorations, applied: [], fail: false,
            setDecorations: (type, ranges) => decorations.push({ type, ranges }),
            get text() { return lines.join('\n'); },
            async edit(build, options) {
                const edits = [];
                build({ replace: (range, text) => edits.push({ range, text }) });
                if (value.fail) return false;
                value.applied.push({ edits, options });
                lines = apply(lines.join('\n'), edits.map(edit => ({ line: edit.range.start.line,
                    start: edit.range.start.character, endLine: edit.range.end.line, end: edit.range.end.character,
                    text: edit.text.replace(/\r\n/g, '\n') }))).split('\n');
                document.version++;
                changeListener({ document, contentChanges: edits });
                return true;
            }
        };
        vscode.window.activeTextEditor = value;
        vscode.window.visibleTextEditors.push(value);
        return value;
    }
    return { provider, rangeProvider, notices, statuses, commands, editor, Range, Selection, subscriptions,
        change: event => changeListener(event), close: document => closeListener(document),
        expire: () => { for (const callback of [...timers]) callback(); } };
}
test('Actual Ctrl+/ command toggles empty/whitespace cursors and a mixed selection in one undo unit', async () => {
    for (const blank of ['', '     ']) {
        const h = providerHarness();
        const editor = h.editor('**FREE\n' + blank, [new h.Selection(1, blank.length, 1, blank.length)]);
        const command = h.commands.get('rpgleFreeFormatter.toggle');
        await command();
        assert.equal(editor.text, '**FREE\n' + (blank ? '  // ' : '// '));
        await command();
        assert.equal(editor.text, '**FREE\n' + (blank || '   '));
        assert.equal(editor.applied.length, 2);
        assert.ok(editor.applied.every(item => item.options.undoStopBefore && item.options.undoStopAfter));
    }
    const h = providerHarness();
    const editor = h.editor('**FREE\n\n   Work();\n   \nOutside();', [new h.Selection(1, 0, 4, 0)]);
    const command = h.commands.get('rpgleFreeFormatter.toggle');
    await command();
    assert.equal(editor.text, '**FREE\n// \n// Work();\n// \nOutside();');
    await command();
    assert.equal(editor.text, '**FREE\n   \n   Work();\n   \nOutside();');
    assert.equal(editor.applied.length, 2);
    assert.ok(editor.applied.every(item => item.options.undoStopBefore && item.options.undoStopAfter));
});
test('Actual Ctrl+/ command toggles the reported literal lines without parsing or delegation', async () => {
    for (const eol of [1, 2]) {
        const h = providerHarness();
        const source = "**free\n      // errmsg = 'Errors occurred while running Program ' +\n" +
            "          %trim(TmpCHANNEL) + '. See the previously listed messages in +\n" +
            "          the job log.';\n   // endmon;";
        const editor = h.editor(source, [new h.Selection(2, 10, 4, 0)], eol);
        const command = h.commands.get('rpgleFreeFormatter.toggle');
        await command();
        assert.equal(editor.text, source.replace('          %trim', '       // %trim').replace('          the job', '       // the job'));
        assert.equal(editor.applied.length, 1);
        assert.ok(editor.applied[0].options.undoStopBefore && editor.applied[0].options.undoStopAfter);
        assert.equal(editor.selections[0].anchor.line, 2);
        assert.equal(editor.selections[0].anchor.character, 10);
        assert.equal(editor.selections[0].active.line, 4);
        assert.equal(editor.selections[0].active.character, 0);
        await command();
        assert.equal(editor.text, source);
        assert.equal(editor.applied.length, 2);
    }
});
test('Actual provider maps inserted newlines to LF and CRLF', () => {
    for (const eol of [1, 2]) {
        const { provider } = providerHarness();
        const lines = ['**FREE', 'DoWork(first', ': second);'];
        const edits = provider.provideDocumentFormattingEdits({
            lineCount: lines.length, lineAt: line => ({ text: lines[line] }), eol
        }, {}, { isCancellationRequested: false });
        const inserted = edits.find(edit => edit.text.includes('\n')).text;
        assert.equal(inserted.includes('\r\n'), eol === 2);
        assert.ok(inserted.includes((eol === 2 ? '\r\n' : '\n') + '   '));
    }
});
test('Provider cancellation discards edits and notices before and after planning', () => {
    for (const cancelAt of [1, 2, 3]) {
        const { provider, notices } = providerHarness();
        let reads = 0;
        const edits = provider.provideDocumentFormattingEdits({
            lineCount: 2, lineAt: line => ({ text: ['**FREE', '/if defined(x)'][line] }), eol: 1
        }, {}, { get isCancellationRequested() { return ++reads >= cancelAt; } });
        assert.equal(edits.length, 0);
        assert.equal(notices.length, 0);
    }
});
test('Provider reports formatter refusals through Output notices', () => {
    const { provider, notices } = providerHarness();
    const edits = provider.provideDocumentFormattingEdits({
        lineCount: 2, lineAt: line => ({ text: ['**FREE', '/if defined(x)'][line] }), eol: 1
    }, {}, { isCancellationRequested: false });
    assert.equal(edits.length, 0);
    assert.equal(notices.length, 1);
});
function selection(line, start, endLine, end) {
    return { start: { line, character: start }, end: { line: endLine, character: end } };
}
function selectedPlan(source, ranges) {
    const plan = planFormatting(source.split('\n'), ranges);
    // Independent line-set oracle: verify every original line touched by an edit
    // or skip marker is selected, including gaps and reversed/exclusive endpoints.
    const selected = new Set();
    for (const range of ranges) {
        let { start, end } = range;
        if (start.line > end.line || start.line === end.line && start.character > end.character) [start, end] = [end, start];
        if (start.line === end.line && start.character === end.character) continue;
        const last = end.line - (end.line > start.line && end.character === 0 ? 1 : 0);
        for (let line = start.line; line <= last; line++) selected.add(line);
    }
    for (const edit of plan.edits) {
        for (let line = edit.line; line <= (edit.endLine ?? edit.line); line++) {
            assert.ok(selected.has(line), 'Every replacement stays inside selected lines');
        }
    }
    for (const skip of plan.skipped) {
        for (let line = skip.start.line; line <= skip.end.line; line++) {
            assert.ok(selected.has(line), 'Every marker stays inside selected lines');
        }
    }
    const result = apply(source, plan.edits);
    assert.deepEqual(fingerprint(result), fingerprint(source));
    return { ...plan, result };
}
test('Selection uses nested outside context without editing outside', () => {
    const source = '**FREE\nif x;\nDoWork();\nendif;';
    const plan = selectedPlan(source, [selection(2, 0, 3, 0)]);
    assert.equal(plan.result, '**FREE\nif x;\n      DoWork();\nendif;');
    assert.equal(plan.skipped.length, 0);
});
test('Selection context crosses COPY/INCLUDE without editing directives or outside source', () => {
    const source = '**FREE\nif x;\n /copy missing,one  \nBefore();\n/include missing,two\nDoWork();\nAfter();\nendif;';
    for (const ranges of [[selection(5, 0, 6, 0)], [selection(2, 2, 6, 0)]]) {
        const plan = selectedPlan(source, ranges);
        const expected = ranges[0].start.line === 5
            ? source.replace('\nDoWork();', '\n      DoWork();')
            : source.replace('\nBefore();', '\n      Before();').replace('\nDoWork();', '\n      DoWork();');
        assert.equal(plan.result, expected);
        assert.equal(plan.skipped.length, 0);
        assert.ok(plan.edits.every(edit => [3, 5].includes(edit.line)));
    }
    const onlyDirective = selectedPlan(source, [selection(2, 0, 3, 0)]);
    assert.equal(onlyDirective.result, source);
    assert.equal(onlyDirective.skipped.length, 0);
});
test('Selecting safe code after an interrupted statement leaves the interrupted context untouched', () => {
    const source = '**FREE\nif x;\nvalue = first +\n/include missing,one\nAfter();\nendif;';
    const plan = selectedPlan(source, [selection(4, 0, 5, 0)]);
    assert.equal(plan.result, '**FREE\nif x;\nvalue = first +\n/include missing,one\n      After();\nendif;');
    assert.equal(plan.skipped.length, 0);
});
test('Mid-line endpoints include all complete statements on selected lines', () => {
    const source = '**FREE\nFirst();\nSecond();\nThird();';
    const plan = selectedPlan(source, [selection(1, 2, 3, 3)]);
    assert.equal(plan.result, '**FREE\n   First();\n   Second();\n   Third();');
    assert.equal(plan.skipped.length, 0);
});
test('Mid-line RPG selection formats full line indentation and preserves trailing comment', () => {
    const source = '**FREE\n     DoWork(); // tail';
    const plan = selectedPlan(source, [selection(1, 5, 1, 14)]);
    assert.equal(plan.result, '**FREE\n   DoWork(); // tail');
    assert.equal(plan.skipped.length, 0);
});
test('Exact full statement permits insertion at selection start', () => {
    const source = '**FREE\nDoWork();';
    const plan = selectedPlan(source, [selection(1, 0, 1, 9)]);
    assert.equal(plan.result, '**FREE\n   DoWork();');
});
test('A statement spanning selected and unselected lines skips every required edit atomically', () => {
    const source = '**FREE\n     DoWork(first\n: second);\nLast();';
    const plan = selectedPlan(source, [selection(1, 5, 2, 0), selection(3, 2, 3, 4)]);
    assert.equal(plan.result, '**FREE\n     DoWork(first\n: second);\n   Last();');
    assert.equal(plan.skipped.length, 1);
    assert.ok(plan.edits.every(edit => edit.line === 3));
    assert.match(plan.skipped[0].reason, /part of this statement/);
});
test('Reversed range endpoints produce the same plan as forward endpoints', () => {
    const lines = ['**FREE', 'First();', 'Second();', 'Third();'];
    const forward = planFormatting(lines, [selection(1, 2, 3, 3)]);
    const backward = planFormatting(lines, [selection(3, 3, 1, 2)]);
    assert.deepEqual(backward, forward);
});
test('Selected wrapped statement can insert semicolon line without expansion', () => {
    const source = '**FREE\nBefore();\nDoWork(first\n: second); // tail\nAfter();';
    const plan = selectedPlan(source, [selection(2, 0, 3, 18)]);
    assert.equal(plan.result, '**FREE\nBefore();\n   DoWork(first\n      : second) // tail\n   ;\nAfter();');
});
test('Selection inside continued literal is protected', () => {
    const source = "**FREE\nDoWork('first +\n   second');\nNext();";
    const plan = selectedPlan(source, [selection(2, 0, 3, 0)]);
    assert.equal(plan.result, source);
    assert.ok(plan.skipped.length);
});
test('Disjoint, duplicate and overlapping ranges produce no duplicate edits', () => {
    const source = '**FREE\nFirst();\nSecond();\nThird();';
    const ranges = [selection(1, 0, 2, 0), selection(3, 0, 3, 8), selection(1, 0, 2, 0)];
    const plan = selectedPlan(source, ranges);
    assert.equal(plan.result, '**FREE\n   First();\nSecond();\n   Third();');
    assert.equal(plan.edits.length, 2);
    const overlapping = planFormatting(source.split('\n'), [selection(1, 0, 2, 4), selection(2, 1, 3, 8)]);
    assert.equal(overlapping.edits.length, 3);
});
test('Later column-zero endpoint excludes that line in both directions', () => {
    const source = '**FREE\nBefore();\nFirst();\nSecond();\nAfter();';
    for (const range of [selection(2, 3, 3, 0), selection(3, 0, 2, 3)]) {
        const plan = selectedPlan(source, [range]);
        assert.equal(plan.result, '**FREE\nBefore();\n   First();\nSecond();\nAfter();');
        assert.equal(plan.skipped.length, 0);
    }
});
test('Adjacent selected lines combine into a complete wrapped statement', () => {
    const source = '**FREE\nBefore();\nDoWork(first\n: second);\nAfter();';
    const plan = selectedPlan(source, [selection(2, 3, 2, 5), selection(3, 2, 3, 4)]);
    assert.equal(plan.result, '**FREE\nBefore();\n   DoWork(first\n      : second)\n   ;\nAfter();');
    assert.equal(plan.skipped.length, 0);
});
test('Disjoint selected lines never bridge an unselected statement continuation', () => {
    const source = '**FREE\nDoWork(first\n: middle\n: last);\nAfter();';
    const plan = selectedPlan(source, [selection(1, 2, 1, 4), selection(3, 1, 3, 3)]);
    assert.equal(plan.result, source);
    assert.equal(plan.edits.length, 0);
    assert.deepEqual(plan.skipped.map(skip => [skip.start.line, skip.end.line]), [[1, 1], [3, 3]]);
});
test('Explicit empty selections do not become selected lines or whole-document scope', () => {
    const source = '**FREE\nFirst();\nSecond();';
    const plan = selectedPlan(source, [selection(1, 3, 1, 3)]);
    assert.equal(plan.result, source);
    assert.equal(plan.skipped.length, 0);
    assert.equal(planFormatting(source.split('\n'), []).edits.length, 0);
});
test('Selecting code mid-line does not format its unselected preceding comment', () => {
    const source = '**FREE\n// keep\n     DoWork();\nAfter();';
    const plan = selectedPlan(source, [selection(2, 7, 2, 10)]);
    assert.equal(plan.result, '**FREE\n// keep\n   DoWork();\nAfter();');
    assert.equal(plan.skipped.length, 0);
});
test('Safe statements around SQL format together with lexical SQL comments', () => {
    const source = "**FREE\nBefore();\nexec sql\nselect ';' /* ; */ -- ;\ninto :x from t;\nAfter();";
    const plan = planFormatting(source.split('\n'));
    assert.equal(apply(source, plan.edits), "**FREE\n   Before();\n   exec sql\n      select ';' /* ; */ -- ;\n      into :x\n      from T\n   ;\n   After();");
    assert.equal(plan.skipped.length, 0);
});
test('Safe prefix survives incomplete tail, directives, tabs and malformed call', () => {
    for (const tail of ['DoWork(', "value = 'open;", '/if defined(x)\nAfter();', '**DATA\nAfter();', 'if x;\nAfter();']) {
        const source = '**FREE\nBefore();\n' + tail;
        const plan = planFormatting(source.split('\n'));
        assert.equal(apply(source, plan.edits), '**FREE\n   Before();\n' + tail);
        assert.ok(plan.skipped.length);
    }
    const source = '**FREE\nBefore();\n\tBad();\nBroken(;\nAfter();';
    const plan = planFormatting(source.split('\n'));
    assert.equal(apply(source, plan.edits), '**FREE\n   Before();\n\tBad();\nBroken(;\n   After();');
    assert.equal(plan.skipped.length, 2);
});
test('Missing semicolon does not swallow following safe statements into a rewrite', () => {
    const source = '**FREE\nBefore();\nvalue = 1\nAfter();\nLast();';
    const plan = planFormatting(source.split('\n'));
    assert.equal(apply(source, plan.edits), '**FREE\n   Before();\nvalue = 1\nAfter();\n   Last();');
    assert.ok(plan.skipped.length);
});
test('Unmatched control leaves uncertain suffix unchanged', () => {
    for (const tail of ['endif;\nAfter();', 'do;\nAfter();']) {
        const source = '**FREE\nBefore();\n' + tail;
        const plan = planFormatting(source.split('\n'));
        assert.equal(apply(source, plan.edits), '**FREE\n   Before();\n' + tail);
        assert.ok(plan.skipped.length);
    }
});
test('Selection planner matches baseline on safe whole document and is repeat-stable', () => {
    const source = '**FREE\n// comment\nif x;\nDoWork(\n%trim(\nvalue\n)\n);\nelse;\nOther();\nendif;';
    const plan = planFormatting(source.split('\n'));
    const result = apply(source, plan.edits);
    assert.equal(result, apply(source, formatSource(source.split('\n')).edits));
    assert.deepEqual(planFormatting(result.split('\n')).edits, []);
});
test('Actual range provider and multi-range provider format all selected lines', () => {
    const h = providerHarness();
    const editor = h.editor('**FREE\nFirst();\nSecond();\nThird();');
    const token = { isCancellationRequested: false };
    const ranges = [new h.Range(1, 2, 2, 9), new h.Range(3, 0, 3, 8)];
    const edits = h.rangeProvider.provideDocumentRangesFormattingEdits(editor.document, ranges, {}, token);
    assert.equal(edits.length, 3);
    assert.ok(editor.decorations.every(item => item.ranges.length === 0));
    const single = h.rangeProvider.provideDocumentRangeFormattingEdits(editor.document, new h.Range(2, 0, 3, 0), {}, token);
    assert.equal(single.length, 1);
    assert.equal(single[0].range.start.line, 2);
    assert.ok(editor.decorations.every(item => item.ranges.length === 0));
});
test('Custom command handles multiple selections in one edit and no selection as document', async () => {
    const h = providerHarness();
    const editor = h.editor('**FREE\nFirst();\nSecond();\nThird();', [new h.Range(1, 0, 2, 0), new h.Range(3, 0, 3, 8)]);
    const command = h.commands.get('rpgleFreeFormatter.formatSelectionOrDocument');
    await command();
    assert.equal(editor.text, '**FREE\n   First();\nSecond();\n   Third();');
    assert.equal(editor.applied.length, 1);
    assert.equal(editor.applied[0].options.undoStopBefore, true);
    assert.equal(editor.applied[0].options.undoStopAfter, true);
    editor.selections = [new h.Range(2, 0, 2, 0)];
    await command();
    assert.equal(editor.text, '**FREE\n   First();\n   Second();\n   Third();');
});
test('Own formatting preserves yellow feedback; next user edit clears it', async () => {
    const h = providerHarness();
    const editor = h.editor('**FREE\nBefore();\nexec sql call P();\nAfter();');
    await h.commands.get('rpgleFreeFormatter.formatSelectionOrDocument')();
    const shown = editor.decorations.at(-1);
    assert.equal(shown.ranges.length, 1);
    assert.match(shown.ranges[0].hoverMessage, /SQL/);
    assert.match(shown.type.options.textDecoration, /underline wavy rgba\(220, 170, 0/);
    assert.equal(shown.type.options.backgroundColor, undefined);
    editor.document.version++;
    h.change({ document: editor.document, contentChanges: [{ range: new h.Range(1, 0, 1, 0), text: 'x' }] });
    assert.equal(editor.decorations.at(-1).ranges.length, 0);
});
test('Provider own transaction preserves feedback, unrelated edit cannot consume guard', async () => {
    const h = providerHarness();
    const editor = h.editor('**FREE\nBefore();\nexec sql call P();');
    const edits = h.provider.provideDocumentFormattingEdits(editor.document, {}, { isCancellationRequested: false });
    await editor.edit(builder => edits.forEach(edit => builder.replace(edit.range, edit.newText)));
    assert.equal(editor.decorations.at(-1).ranges.length, 1);
    h.expire();
    assert.equal(editor.decorations.at(-1).ranges.length, 0);
    h.provider.provideDocumentFormattingEdits(editor.document, {}, { isCancellationRequested: false });
    editor.document.version++;
    h.change({ document: editor.document, contentChanges: [{ range: new h.Range(1, 0, 1, 0), text: 'x' }] });
    assert.equal(editor.decorations.at(-1).ranges.length, 0);
});
test('Skip underlines remap after multiple inserted lines for LF and CRLF', async () => {
    for (const eol of [1, 2]) {
        const h = providerHarness();
        // Avoid OTHER, which this conservative classifier treats as a SELECT
        // branch. This fixture tests position mapping, not keyword ambiguity.
        const source = '**FREE\nDoWork(first\n: second);\nAnotherWork(first\n: second);\nexec sql call P();';
        const planned = planFormatting(source.split('\n'));
        assert.equal(planned.skipped.length, 1, 'Fixture must skip only SQL before testing marker mapping');
        assert.match(planned.skipped[0].reason, /SQL/);
        assert.equal(planned.edits.filter(edit => edit.text.includes('\n')).length, 2);
        const editor = h.editor(source, [], eol);
        await h.commands.get('rpgleFreeFormatter.formatSelectionOrDocument')();
        const marked = editor.decorations.at(-1).ranges;
        assert.equal(marked.length, 1);
        assert.equal(marked[0].range.start.line, 7);
        assert.equal(marked[0].range.start.character, 0);
        assert.equal(marked[0].range.end.line, 7);
        assert.equal(marked[0].range.end.character, 'exec sql call P();'.length);
        assert.equal(editor.text.split('\n')[7], 'exec sql call P();');
        assert.match(marked[0].hoverMessage, /SQL/);
    }
});
test('A partial-statement marker follows insertions and stays within selected lines, not columns', async () => {
    const h = providerHarness();
    const editor = h.editor('**FREE\nDoWork(first\n: second);\nThird(first\n: second);\nOutside();', [new h.Range(1, 2, 3, 3)]);
    await h.commands.get('rpgleFreeFormatter.formatSelectionOrDocument')();
    const marked = editor.decorations.at(-1).ranges;
    assert.equal(marked.length, 1);
    assert.equal(marked[0].range.start.line, 4);
    assert.equal(marked[0].range.start.character, 0);
    assert.equal(marked[0].range.end.line, 4);
    assert.equal(marked[0].range.end.character, 'Third(first'.length);
    assert.equal(editor.text.split('\n')[4], 'Third(first');
    assert.equal(editor.text.split('\n')[5], ': second);');
    assert.equal(editor.text.split('\n')[6], 'Outside();');
});
test('Cancellation, document close and a subsequent attempt clear old feedback', () => {
    const h = providerHarness();
    const editor = h.editor('**FREE\nexec sql call P();');
    const attempt = () => h.provider.provideDocumentFormattingEdits(editor.document, {}, { isCancellationRequested: false });
    attempt();
    assert.equal(editor.decorations.at(-1).ranges.length, 1);
    h.provider.provideDocumentFormattingEdits(editor.document, {}, { isCancellationRequested: true });
    assert.equal(editor.decorations.at(-1).ranges.length, 0);
    attempt();
    h.close(editor.document);
    assert.equal(editor.decorations.at(-1).ranges.length, 0);
    assert.ok(h.statuses.length);
});
test('Failed custom edit clears stale feedback and reports failure', async () => {
    const h = providerHarness();
    const editor = h.editor('**FREE\nBefore();\nexec sql call P();');
    editor.fail = true;
    await h.commands.get('rpgleFreeFormatter.formatSelectionOrDocument')();
    assert.equal(editor.text, '**FREE\nBefore();\nexec sql call P();');
    assert.equal(editor.decorations.at(-1).ranges.length, 0);
    assert.match(h.statuses.at(-1), /could not/);
});
// SQL assertions exercise both the planner and the real exported VS Code provider.
// The baseline formatSource remains the conservative RPG-only layout engine.
const { lex: sqlLex } = require('../out/sqlFormatter');
function providerApply(source, eol = 1, ranges) {
    const h = providerHarness();
    const editor = h.editor(source, [], eol);
    const token = { isCancellationRequested: false };
    const edits = ranges
        ? h.rangeProvider.provideDocumentRangesFormattingEdits(editor.document, ranges, {}, token)
        : h.provider.provideDocumentFormattingEdits(editor.document, {}, token);
    return { result: apply(source, edits.map(edit => ({ line: edit.range.start.line,
        start: edit.range.start.character, endLine: edit.range.end.line, end: edit.range.end.character,
        text: edit.newText.replace(/\r\n/g, '\n') }))), edits, h };
}
function sqlTokens(source) {
    const tokens = [...sqlLex(source)];
    const comments = t => ['comment', 'linecomment'].includes(t.type);
    // Trailing commas must precede line comments. Compare code-token order and
    // comment-byte order independently, allowing only this harmless relocation.
    return { code: tokens.filter(t => !comments(t)).map(t => [t.type, ['word', 'special'].includes(t.type) ? t.raw.toLowerCase() : t.raw]),
        comments: tokens.filter(comments).map(t => t.raw) };
}
function sqlCheck(sql, body) {
    const source = '**FREE\nexec sql ' + sql + ';\nAfter();';
    const expected = '**FREE\n   exec sql\n' + body.map(row => '      ' + row).join('\n') + '\n   ;\n   After();';
    const plan = planFormatting(source.split('\n'));
    assert.deepEqual(plan.skipped, []);
    assert.equal(apply(source, plan.edits), expected);
    assert.equal(providerApply(source).result, expected);
    assert.deepEqual(sqlTokens(source), sqlTokens(expected), 'SQL tokens and protected spelling must survive layout');
    assert.deepEqual(planFormatting(expected.split('\n')).edits, [], 'Second SQL format must be stable');
    assert.equal(providerApply(expected).edits.length, 0);
    return expected;
}
test('SQL strictly expands even a one-line SELECT and VALUES', () => {
    sqlCheck('SELECT 1', ['select 1']);
    sqlCheck('values CURRENT_DATE', ['values current_date']);
});
test('SQL one-item clauses stay inline including INTO and ORDER BY', () => {
    sqlCheck('select col into :Host from tab alias order by col desc',
        ['select COL', 'into :Host', 'from TAB ALIAS', 'order by COL desc']);
});
test('SQL two-item SELECT INTO and ORDER BY lists use indented trailing commas', () => {
    sqlCheck('select a,b into :One,:Two from tab order by a,b',
        ['select', '   A,', '   B', 'into', '   :One,', '   :Two', 'from TAB', 'order by', '   A,', '   B']);
});
test('SQL three-item lists, DISTINCT and aggregate commas are lexical', () => {
    sqlCheck('select distinct coalesce(a,b) aa,c,d from tab group by a,c,d',
        ['select distinct', '   coalesce(A, B) AA,', '   C,', '   D', 'from TAB', 'group by', '   A,', '   C,', '   D']);
});
test('SQL SET one assignment inline and many assignments expanded', () => {
    sqlCheck('set :Host=1', ['set :Host = 1']);
    sqlCheck('update tab set a=:One,b=coalesce(:Two,0),c=3 where id=:Key',
        ['update TAB', 'set', '   A = :One,', '   B = coalesce(:Two, 0),', '   C = 3', 'where ID = :Key']);
});
test('SQL option SET uses the same assignment-list policy', () => {
    sqlCheck('set option naming=*sys,commit=*none', ['set option', '   naming = *sys,', '   commit = *none']);
});
test('SQL DELETE WHERE AND OR share the clause indentation', () => {
    sqlCheck('delete from tab where a=1 and b=2 or c=3',
        ['delete from TAB', 'where A = 1', 'and B = 2', 'or C = 3']);
});
test('SQL BETWEEN consumes its AND instead of inventing a boolean branch', () => {
    sqlCheck('select x from tab where x between 1 and 2 and y not between 3 and 4 or z=5',
        ['select X', 'from TAB', 'where X between 1 and 2', 'and Y not between 3 and 4', 'or Z = 5']);
});
test('SQL parenthesized groups introduce a level and close at the opening phrase', () => {
    sqlCheck('select a from t where (a=1 or (b=2 and c=3)) and d=4',
        ['select A', 'from T', 'where (', '   A = 1', '   or (', '      B = 2', '      and C = 3', '   )', ')', 'and D = 4']);
});
test('SQL JOIN and ON and additional conditions align one level under FROM', () => {
    sqlCheck('select a.id,b.name from one a left outer join two b on a.id=b.id and b.x=1 inner join three c on c.id=a.id',
        ['select', '   A.ID,', '   B.NAME', 'from ONE A', '   left outer join TWO B', '   on A.ID = B.ID', '   and B.X = 1', '   inner join THREE C', '   on C.ID = A.ID']);
});
test('SQL quoted identifiers aliases literal escapes and host fields preserve spelling', () => {
    sqlCheck('SELECT "MiX"."col" AS "Alias",\'It\'\'s AND ;\' textval INTO :myDS.Field,:Other INDICATOR :NullInd FROM "My Table" t',
        ['select', '   "MiX"."col" as "Alias",', "   'It''s AND ;' TEXTVAL", 'into', '   :myDS.Field,', '   :Other indicator :NullInd', 'from "My Table" T']);
});
test('SQL literal prefixes differ from identifier X and N', () => {
    sqlCheck("select x,n,x'ABcd',N'MiX' from t", ['select', '   X,', '   N,', "   x'ABcd',", "   n'MiX'", 'from T']);
});
test('SQL simple CASE aligns END with CASE and indents branches', () => {
    sqlCheck('select case status when 1 then \'one\' when 2 then \'two\' else \'other\' end label from t',
        ['select case STATUS', "   when 1 then 'one'", "   when 2 then 'two'", "   else 'other'", 'end LABEL', 'from T']);
});
test('SQL searched CASE keeps short WHEN THEN branches together', () => {
    sqlCheck('set :Result=case when a=1 and b=2 then 3 else 4 end',
        ['set :Result = case', '   when A = 1 and B = 2 then 3', '   else 4', 'end']);
});
test('SQL nested CASE result gets an extra level, not a flattened WHEN', () => {
    sqlCheck('set :Result=case x when 1 then case when y=2 then 3 else 4 end else 5 end',
        ['set :Result = case X', '   when 1 then', '      case', '         when Y = 2 then 3', '         else 4', '      end', '   else 5', 'end']);
});
test('SQL nested BEGIN CASE body and internal semicolons do not terminate scanning', () => {
    sqlCheck('begin atomic set :a=1; begin set :b=case x when 1 then case when y=2 then 3 else 4 end else 5 end; end; end',
        ['begin atomic', '   set :a = 1;', '   begin', '      set :b = case X', '         when 1 then', '            case', '               when Y = 2 then 3', '               else 4', '            end', '         else 5', '      end;', '   end;', 'end']);
});
test('SQL internal terminator returning from list indentation gets its own line', () => {
    sqlCheck('begin update t set a=1,b=2; end',
        ['begin', '   update T', '   set', '      A = 1,', '      B = 2', '   ;', 'end']);
});
test('SQL parenthesized subqueries format recursively without flattening scopes', () => {
    sqlCheck('select a from t where a in (select b from u where b in (select c from v))',
        ['select A', 'from T', 'where A in (', '   select B', '   from U', '   where B in (', '      select C', '      from V', '   )', ')']);
});
test('SQL INSERT columns and VALUES tuples expand multi-item lists', () => {
    sqlCheck('insert into tab(a,b) values(:a,:b)',
        ['insert into TAB(', '   A,', '   B', ')', 'values (', '   :a,', '   :b', ')']);
    sqlCheck('insert into tab(a) values(:a)', ['insert into TAB(A)', 'values (:a)']);
});
test('SQL INSERT SELECT retains both statements and nested list boundaries', () => {
    sqlCheck('insert into tab(a,b) select x,y from other_tab',
        ['insert into TAB(', '   A,', '   B', ')', 'select', '   X,', '   Y', 'from OTHER_TAB']);
});
test('SQL PREPARE never formats its dynamic SQL literal', () => {
    sqlCheck("prepare stmt from 'SELECT MiXeD,\"Quoted\" FROM t WHERE x='';'''",
        ["prepare STMT from 'SELECT MiXeD,\"Quoted\" FROM t WHERE x='';'''"]);
});
test('SQL DECLARE SELECT OPEN FETCH CLOSE preserve host-variable casing', () => {
    sqlCheck('declare cur cursor for select a,b from tab',
        ['declare CUR cursor for', '   select', '      A,', '      B', '   from TAB']);
    sqlCheck('declare cur cursor for stmt', ['declare CUR cursor for STMT']);
    sqlCheck('open cur using :myValue', ['open CUR using :myValue']);
    sqlCheck('fetch next from cur into :One,:Two', ['fetch next', 'from CUR', 'into', '   :One,', '   :Two']);
    sqlCheck('close cur', ['close CUR']);
});
test('SQL line comments block comments and comment delimiters inside strings survive', () => {
    sqlCheck("select '/* ; end */' /* MiX ; */ -- Keep AND ;\ninto :Host from tab",
        ["select '/* ; end */' /* MiX ; */ -- Keep AND ;", 'into :Host', 'from TAB']);
});
test('SQL commas before line comments remain code, not commented-out syntax', () => {
    sqlCheck('select a -- Keep A\n,b from tab', ['select', '   A, -- Keep A', '   B', 'from TAB']);
    sqlCheck('select a, -- Keep A\nb from tab', ['select', '   A, -- Keep A', '   B', 'from TAB']);
});
test('SQL comments inside function arguments and IN tuples cannot swallow code', () => {
    sqlCheck('select coalesce(a, -- Keep\nb) from t',
        ['select coalesce(', '   A, -- Keep', '   B', ')', 'from T']);
    sqlCheck('select a from t where a in (1, -- Keep\n2)',
        ['select A', 'from T', 'where A in (', '   1, -- Keep', '   2', ')']);
});
test('SQL compound header comments and NOT ATOMIC preserve their lexical boundaries', () => {
    sqlCheck('begin -- Keep\n atomic set :x=1; end', ['begin -- Keep', 'atomic', '   set :x = 1;', 'end']);
    sqlCheck('begin not atomic set :x=1; end', ['begin not atomic', '   set :x = 1;', 'end']);
});
test('SQL multirow VALUES and CASE list items retain delimiters and repeat stability', () => {
    sqlCheck('values (1,2),(3,4)', ['values', '   (1, 2),', '   (3, 4)']);
    sqlCheck('select case when a=1 then 2 else 3 end,b from t',
        ['select', '   case', '      when A = 1 then 2', '      else 3', '   end,', '   B', 'from T']);
});
test('SQL trailing comments remain on the outer terminator and repeat stable', () => {
    for (const tail of [' -- Keep ; END', ' // Keep ; END', ' /* Keep ; END */']) {
        const source = '**FREE\nexec sql select a from t;' + tail + '\nAfter();';
        const result = providerApply(source).result;
        assert.equal(result, '**FREE\n   exec sql\n      select A\n      from T\n   ;' + tail + '\n   After();');
        assert.equal(providerApply(result).edits.length, 0);
    }
});
test('SQL compound scanner ignores END BEGIN CASE semicolons in comments and strings', () => {
    sqlCheck("begin atomic set :a='end; begin; case'; /* END; */ set :b=2; end",
        ['begin atomic', "   set :a = 'end; begin; case';", '   /* END; */', '   set :b = 2;', 'end']);
});
test('SQL preserves multiline literal and block-comment bytes', () => {
    const source = "**FREE\nexec sql select 'One\n  Two' /* Keep\n Mixed ; END */ from tab;\nAfter();";
    const result = providerApply(source).result;
    assert.ok(result.includes("'One\n  Two'"));
    assert.ok(result.includes('/* Keep\n Mixed ; END */'));
    assert.deepEqual(sqlTokens(result), sqlTokens(source));
    assert.equal(providerApply(result).edits.length, 0);
});
test('SQL after COPY and between visible RPG blocks keeps surrounding context', () => {
    const source = '**FREE\nif ok;\n /COPY missing,one  \nexec sql select a from t;\nAfter();\nendif;';
    assert.equal(providerApply(source).result,
        '**FREE\n   if ok;\n /COPY missing,one  \n      exec sql\n         select A\n         from T\n      ;\n      After();\n   endif;');
});
test('SQL complete selected lines edit no outside bytes and partial line coverage skips atomically', () => {
    const source = '**FREE\nBefore();\nexec sql\nselect a,b\nfrom t;\nAfter();';
    const full = selection(2, 0, 5, 0);
    const result = providerApply(source, 1, [full]).result;
    assert.equal(result, '**FREE\nBefore();\n   exec sql\n      select\n         A,\n         B\n      from T\n   ;\nAfter();');
    for (const range of [selection(3, 0, 5, 0), selection(2, 2, 4, 0), selection(3, 2, 4, 5)]) {
        const plan = planFormatting(source.split('\n'), [range]);
        assert.equal(plan.edits.length, 0);
        assert.equal(plan.skipped.length, 1);
        assert.equal(providerApply(source, 1, [range]).result, source);
    }
});
test('Mid-line complete SQL selection includes omitted indentation and trailing comment', () => {
    const source = '**FREE\nBefore();\n     exec sql select a from t; // tail\nAfter();';
    const range = selection(2, 5, 2, 12);
    const expected = '**FREE\nBefore();\n   exec sql\n      select A\n      from T\n   ; // tail\nAfter();';
    const plan = planFormatting(source.split('\n'), [range]);
    assert.equal(plan.skipped.length, 0);
    assert.equal(apply(source, plan.edits), expected);
    assert.equal(providerApply(source, 1, [range]).result, expected);
});
test('Mid-line multiline SQL selection formats complete selected lines in either direction', () => {
    const source = '**FREE\nBefore();\n     exec sql\nselect a,b\nfrom t; // keep\nAfter();';
    const expected = '**FREE\nBefore();\n   exec sql\n      select\n         A,\n         B\n      from T\n   ; // keep\nAfter();';
    for (const range of [selection(2, 5, 4, 3), selection(4, 3, 2, 5)]) {
        const plan = planFormatting(source.split('\n'), [range]);
        assert.equal(plan.skipped.length, 0);
        assert.equal(plan.edits.length, 1);
        assert.equal(plan.edits[0].line, 2);
        assert.equal(plan.edits[0].endLine, 4);
        assert.equal(apply(source, plan.edits), expected);
        assert.equal(providerApply(source, 1, [range]).result, expected);
    }
});
test('Custom command shares selected-line SQL and RPG scope for LF and CRLF', async () => {
    for (const eol of [1, 2]) {
        const h = providerHarness();
        const editor = h.editor('**FREE\nBefore();\n     exec sql select a from t;\n     DoWork();\nAfter();',
            [new h.Range(2, 5, 3, 9)], eol);
        await h.commands.get('rpgleFreeFormatter.formatSelectionOrDocument')();
        assert.equal(editor.text, '**FREE\nBefore();\n   exec sql\n      select A\n      from T\n   ;\n   DoWork();\nAfter();');
        assert.equal(editor.applied.length, 1);
        assert.ok(editor.decorations.every(item => item.ranges.length === 0));
    }
});
test('Yellow SQL partial markers ignore character bounds but stay within selected lines', () => {
    const source = '**FREE\nBefore();\n     exec sql\nselect a,b\nfrom t;\nAfter();';
    const h = providerHarness();
    const editor = h.editor(source);
    const edits = h.rangeProvider.provideDocumentRangeFormattingEdits(editor.document,
        new h.Range(2, 9, 4, 0), {}, { isCancellationRequested: false });
    assert.equal(edits.length, 0);
    assert.equal(editor.text, source);
    const markers = editor.decorations.at(-1).ranges;
    assert.equal(markers.length, 1);
    assert.equal(markers[0].range.start.line, 2);
    assert.equal(markers[0].range.start.character, 5);
    assert.equal(markers[0].range.end.line, 3);
    assert.equal(markers[0].range.end.character, 'select a,b'.length);
    assert.match(markers[0].hoverMessage, /part of this statement/);
    assert.match(editor.decorations.at(-1).type.options.textDecoration, /wavy.*220, 170, 0/);
});
test('SQL unsupported operations and malformed lists skip locally before following RPG', () => {
    for (const sql of ['call Proc()', 'merge into t using u on t.id=u.id', 'select a,,b from t', 'select a from', 'set', 'select case when a=1 2 end from t']) {
        const source = '**FREE\nBefore();\nexec sql ' + sql + ';\nAfter();';
        const plan = planFormatting(source.split('\n'));
        assert.equal(apply(source, plan.edits), '**FREE\n   Before();\nexec sql ' + sql + ';\n   After();');
        assert.equal(plan.skipped.length, 1);
        assert.match(plan.skipped[0].reason, /SQL/);
    }
});
test('SQL unsupported procedural bodies scan to their outer END before local skip', () => {
    const sql = 'exec sql begin if :x=1 then set :x=2; end if; end;';
    const source = '**FREE\nBefore();\n' + sql + '\nAfter();';
    const plan = planFormatting(source.split('\n'));
    assert.equal(apply(source, plan.edits), '**FREE\n   Before();\n' + sql + '\n   After();');
    assert.equal(plan.skipped.length, 1);
    assert.match(plan.skipped[0].reason, /unsupported/);
});
test('SQL incomplete quotes parentheses comments and compound bodies protect the suffix', () => {
    for (const sql of ["select 'open;", 'begin atomic set :a=1;', 'select a /* open ;']) {
        const source = '**FREE\nBefore();\nexec sql ' + sql + '\nAfter();';
        const plan = planFormatting(source.split('\n'));
        assert.equal(apply(source, plan.edits), '**FREE\n   Before();\nexec sql ' + sql + '\nAfter();');
        assert.ok(plan.skipped.length);
    }
    const local = '**FREE\nexec sql select (a;\nAfter();';
    const plan = planFormatting(local.split('\n'));
    assert.equal(apply(local, plan.edits), '**FREE\nexec sql select (a;\n   After();');
    assert.match(plan.skipped[0].reason, /parentheses/);
});
test('SQL leading-dot decimals exponents signed values and operators retain numeric tokens', () => {
    sqlCheck('select .5,1.2e-3,-4 from t where a<>.1 and b>=2',
        ['select', '   .5,', '   1.2e-3,', '   - 4', 'from T', 'where A <> .1', 'and B >= 2']);
});
test('SQL SELECT UNION ALL and multi-table FROM retain their structure', () => {
    sqlCheck('select a from t,u union all select b from v',
        ['select A', 'from', '   T,', '   U', 'union all', 'select B', 'from V']);
});
test('SQL cannot silently rewrite another RPG statement sharing its line', () => {
    const source = '**FREE\nexec sql select a from t; After();\nNext();';
    const plan = planFormatting(source.split('\n'));
    assert.equal(apply(source, plan.edits), '**FREE\nexec sql select a from t; After();\n   Next();');
    assert.equal(plan.skipped.length, 1);
});
test('SQL real command applies multiple multiline SQL edits in one undo transaction', async () => {
    const h = providerHarness();
    const editor = h.editor('**FREE\nexec sql select a from t;\nexec sql set :Host=1;\nAfter();');
    await h.commands.get('rpgleFreeFormatter.formatSelectionOrDocument')();
    assert.equal(editor.applied.length, 1);
    assert.ok(editor.applied[0].options.undoStopBefore && editor.applied[0].options.undoStopAfter);
    assert.equal(editor.text, '**FREE\n   exec sql\n      select A\n      from T\n   ;\n   exec sql\n      set :Host = 1\n   ;\n   After();');
    await h.commands.get('rpgleFreeFormatter.formatSelectionOrDocument')();
    assert.equal(editor.applied.length, 1);
});
test('SQL real command remaps later skip markers across a multiline replacement', async () => {
    for (const eol of [1, 2]) {
        const h = providerHarness();
        const editor = h.editor('**FREE\nexec sql\nselect a\nfrom t;\nexec sql call P();\nAfter();', [], eol);
        await h.commands.get('rpgleFreeFormatter.formatSelectionOrDocument')();
        const marker = editor.decorations.at(-1).ranges[0];
        assert.equal(marker.range.start.line, 5);
        assert.equal(editor.text.split('\n')[5], 'exec sql call P();');
        assert.equal(editor.text.split('\n')[6], '   After();');
    }
});
test('SQL provider multiline replacement uses LF or CRLF without doubled CR', () => {
    for (const eol of [1, 2]) {
        const source = '**FREE\nexec sql\nselect a,b\nfrom t;\nAfter();';
        const { result, edits } = providerApply(source, eol);
        const edit = edits.find(e => e.range.start.line === 1);
        assert.equal(edit.range.end.line, 3);
        assert.equal(edit.newText.includes('\r\n'), eol === 2);
        assert.ok(!edit.newText.includes('\r\r\n'));
        const actualEol = eol === 2 ? '\r\n' : '\n';
        const originalBytes = source.replace(/\n/g, actualEol);
        const lineOffsets = [0];
        for (let i = 0; i < originalBytes.length; i++) if (originalBytes[i] === '\n') lineOffsets.push(i + 1);
        let bytes = originalBytes;
        for (const e of [...edits].reverse()) bytes = bytes.slice(0, lineOffsets[e.range.start.line] + e.range.start.character) +
            e.newText + bytes.slice(lineOffsets[e.range.end.line] + e.range.end.character);
        assert.equal(bytes, result.replace(/\n/g, actualEol));
        assert.equal(providerApply(result, eol).edits.length, 0);
    }
});
const column = body => body.split('\n').map(line => '       ' + line).join('\n');
function columnCheck(body) {
    const source = column(body);
    const free = planFormatting(('**FREE\n' + body).split('\n'));
    const expected = column(apply('**FREE\n' + body, free.edits).split('\n').slice(1).join('\n'));
    for (const planner of [formatSource, planFormatting]) {
        const plan = planner(source.split('\n'));
        assert.equal(apply(source, plan.edits), expected);
        assert.deepEqual(planner(expected.split('\n')).edits, []);
        assert.ok(plan.edits.every(edit => edit.start >= 7));
    }
    assert.equal(providerApply(source).result, expected);
    return expected;
}
test('Column-limited layout is the fully-free ruleset shifted seven columns', () => {
    for (const body of [
        'if first and\nsecond;\nDoWork();\nelse;\nNext();\nendif;',
        'value = first +\nsecond;',
        "snd-msg ('Hello ' +\nname);",
        'dcl-ds item;\ndcl-s value char(20)\nin dim(2);\nend-ds;',
        'DoWork(\n%trim(\nvalue\n)\n);',
        '// ordinary\n/// banner\n // old();\nDoWork(\n // inside\nvalue);',
        'if = first +\nsecond;\nselect = 1;',
        'dcl-ds item likeds(other);\ndcl-pr Empty end-pr;'
    ]) columnCheck(body);
});
test('Column-limited literals retain significant whitespace and literal directives', () => {
    for (const body of [
        "value = 'first +   \n /copy literal\n /free\n // still literal\n last';\nAfter();",
        "DoWork(\n'first +  \n second'); // keep  ",
        "snd-msg '  first  ' +\n'  second  ';"
    ]) columnCheck(body);
});
test('Mixed records preserve fixed bytes, prefixes and visible free block context', () => {
    const source = '00001H option(*srcstmt)  \n00002  if ok;\n00003C                   eval      old = 1\n00004  DoWork(first\n00005  : second);\n00006  endif;\n00007O fixed output  ';
    const expected = '00001H option(*srcstmt)  \n00002     if ok;\n00003C                   eval      old = 1\n00004        DoWork(first\n00005           : second)\n             ;\n00006     endif;\n00007O fixed output  ';
    for (const planner of [formatSource, planFormatting]) {
        assert.equal(apply(source, planner(source.split('\n')).edits), expected);
        assert.deepEqual(planner(expected.split('\n')).edits, []);
    }
});
test('Legacy FREE boundaries retain free structural context across fixed records', () => {
    for (const slash of ['      /', '       /']) {
        const source = slash + 'FREE  \n' + column('if ok;') + '\n' + slash + 'END-FREE\n     C     *inlr         seton\n' + slash + 'free\n' + column('Work();\nendif;') + '\n' + slash + 'end-free';
        const expected = slash + 'FREE  \n' + column('   if ok;') + '\n' + slash + 'END-FREE\n     C     *inlr         seton\n' + slash + 'free\n' + column('      Work();\n   endif;') + '\n' + slash + 'end-free';
        for (const planner of [formatSource, planFormatting]) {
            assert.equal(apply(source, planner(source.split('\n')).edits), expected);
            assert.deepEqual(planner(expected.split('\n')).edits, []);
        }
    }
});
test('Fixed boundaries interrupt incomplete ordinary statements without swallowing later free code', () => {
    const source = column('Before();\nWork(first') + '\n     C fixed ; ( tokens\n' + column('After();');
    const expected = column('   Before();\nWork(first') + '\n     C fixed ; ( tokens\n' + column('   After();');
    for (const planner of [formatSource, planFormatting]) {
        const plan = planner(source.split('\n'));
        assert.equal(apply(source, plan.edits), expected);
        assert.match(plan.notices.join(' '), /interrupted/);
    }
});
test('Interrupted mixed control statements quarantine uncertain context', () => {
    const source = column('Before();\nif x and') + '\n     C fixed\n' + column('After();\nendif;');
    const plan = planFormatting(source.split('\n'));
    assert.equal(apply(source, plan.edits), column('   Before();\nif x and') + '\n     C fixed\n' + column('After();\nendif;'));
    assert.ok(plan.skipped.some(item => /uncertain/.test(item.reason)));
});
test('Mixed selection reads outer context without touching fixed or unselected lines', () => {
    const source = column('if ok;') + '\n     C fixed  \n' + column('Work(first\n: second);\nendif;\nOutside();');
    const expected = column('if ok;') + '\n     C fixed  \n' + column('      Work(first\n         : second)\n      ;\nendif;\nOutside();');
    for (const range of [selection(2, 1, 3, 10), selection(3, 10, 2, 1), selection(2, 0, 4, 0)]) {
        const plan = planFormatting(source.split('\n'), [range]);
        assert.equal(apply(source, plan.edits), expected);
        assert.equal(plan.skipped.length, 0);
    }
});
test('Mixed partial and disjoint selections never complete statements across gaps', () => {
    const source = column('Before();\nWork(first\n: second);\nAfter();');
    const plan = planFormatting(source.split('\n'), [selection(0, 1, 1, 8), selection(3, 1, 3, 2)]);
    assert.equal(apply(source, plan.edits), column('   Before();\nWork(first\n: second);\n   After();'));
    assert.equal(plan.skipped.length, 1);
    assert.equal(plan.skipped[0].start.line, 1);
    assert.ok(plan.skipped[0].start.character >= 7);
    assert.deepEqual(planFormatting(source.split('\n'), []).edits, []);
});
test('A prefix-only mixed selection still selects its complete line', () => {
    const source = '12345  Work();\n' + column('After();');
    const plan = planFormatting(source.split('\n'), [selection(0, 1, 0, 3)]);
    assert.equal(apply(source, plan.edits), '12345     Work();\n' + column('After();'));
});
test('Column 80 is allowed but overflow rejects every edit in the statement', () => {
    const exact = 'x = ' + 'a'.repeat(65) + ';'; // 70 + 3 indent = 73 field columns.
    columnCheck(exact);
    const source = column('// note\nWork(first\n: ' + 'a'.repeat(65) + ');\nAfter();');
    const plan = planFormatting(source.split('\n'));
    assert.equal(apply(source, plan.edits), column('// note\nWork(first\n: ' + 'a'.repeat(65) + ');\n   After();'));
    assert.ok(plan.skipped.some(item => /column 80/.test(item.reason)));
});
test('Bytes beyond column 80 are excluded from tokens and preserved at exact offsets', () => {
    const raw = '12345  Work();'.padEnd(80) + "TAIL ' ; //";
    const source = raw + '\n' + column('After();');
    const expected = '12345     Work();'.padEnd(80) + "TAIL ' ; //\n" + column('   After();');
    for (const planner of [formatSource, planFormatting]) {
        assert.equal(apply(source, planner(source.split('\n')).edits), expected);
        assert.deepEqual(planner(expected.split('\n')).edits, []);
    }
});
test('Overflow suffix stays on its original record when a semicolon record is inserted', () => {
    const source = column('Work(first') + '\n' + ('54321  : second);'.padEnd(80) + 'OVERFLOW');
    const expected = column('   Work(first') + '\n' + '54321        : second)'.padEnd(80) + 'OVERFLOW\n' + column('   ;');
    const plan = planFormatting(source.split('\n'));
    assert.equal(apply(source, plan.edits), expected);
    assert.deepEqual(planFormatting(expected.split('\n')).edits, []);
});
test('Mixed directives and data retain existing suffix and include policies', () => {
    const source = column('if ok;\n /COPY missing,one  \nWork();\nendif;\n/EOF\nUntouched();');
    const expected = column('   if ok;\n /COPY missing,one  \n      Work();\n   endif;\n/EOF\nUntouched();');
    for (const planner of [formatSource, planFormatting]) assert.equal(apply(source, planner(source.split('\n')).edits), expected);
    for (const barrier of [column('/if defined(x)'), '**DATA']) {
        const input = column('Before();') + '\n' + barrier + '\n' + column('After();');
        assert.equal(apply(input, planFormatting(input.split('\n')).edits), column('   Before();') + '\n' + barrier + '\n' + column('After();'));
    }
});
test('Fixed-only and ambiguous layouts stay byte-identical; safe later free lines format', () => {
    for (const raw of ['     C fixed  ', '     D fixed ;', '      * fixed comment', '12345X unknown', '12345  \tWork();']) {
        const source = raw + '\n' + column('Work();');
        assert.equal(apply(source, planFormatting(source.split('\n')).edits), raw + '\n' + column('   Work();'));
        const plan = planFormatting(source.split('\n'), [selection(0, 0, 1, 0)]);
        assert.deepEqual(plan.edits, []);
    }
});
test('Column-limited SQL uses identical layouts, spelling protection and nesting', () => {
    for (const body of [
        'exec sql select a,b into :One,:Two from tab;\nAfter();',
        'if ok;\nexec sql set :Host=case when a=1 then 2 else 3 end;\nendif;',
        "exec sql select 'One\n Two' /* Keep\n Mixed */ from tab;",
        'exec sql begin atomic set :x=1; set :y=2; end;'
    ]) columnCheck(body);
});
test('Mixed SQL selections are atomic, including mid-line and reversed scopes', () => {
    const source = column('Before();\nexec sql\nselect a,b\nfrom t;\nAfter();');
    const expected = column('Before();\n   exec sql\n      select\n         A,\n         B\n      from T\n   ;\nAfter();');
    for (const range of [selection(1, 10, 3, 9), selection(3, 9, 1, 10)]) {
        assert.equal(apply(source, planFormatting(source.split('\n'), [range]).edits), expected);
    }
    const partial = planFormatting(source.split('\n'), [selection(2, 10, 4, 0)]);
    assert.deepEqual(partial.edits, []);
    assert.equal(partial.skipped.length, 1);
});
test('Mixed SQL width and record metadata failures skip the full SQL replacement', () => {
    for (const sql of ["exec sql values '" + 'x'.repeat(50) + "';", 'exec sql select a from t;']) {
        const first = sql.includes('values') ? column(sql) : '12345  ' + sql;
        const source = first + '\n' + column('After();');
        const plan = planFormatting(source.split('\n'));
        if (sql.includes('values')) {
            // The input fits in 73 columns, but nested SQL indentation does not.
            const body = "if ok;\nif ready;\nexec sql values '" + 'x'.repeat(54) + "';\nAfter();\nendif;\nendif;";
            const wide = column(body);
            const protectedPlan = planFormatting(wide.split('\n'));
            assert.equal(apply(wide, protectedPlan.edits), column("   if ok;\n      if ready;\nexec sql values '" + 'x'.repeat(54) + "';\n         After();\n      endif;\n   endif;"));
            assert.match(protectedPlan.notices.join(' '), /column 80/);
        } else {
            assert.equal(apply(source, plan.edits), first + '\n' + column('   After();'));
            assert.match(plan.notices.join(' '), /prefixes/);
        }
    }
});
test('SQL cannot scan through fixed records or legacy delimiters', () => {
    for (const barrier of ['     C fixed;', '      /END-FREE']) {
        const source = column('Before();\nexec sql select a') + '\n' + barrier + '\n' + column('After();');
        const plan = planFormatting(source.split('\n'));
        assert.equal(apply(source, plan.edits), column('   Before();\nexec sql select a') + '\n' + barrier + '\n' + column('After();'));
        assert.ok(plan.skipped.length);
    }
});
test('Legacy delimiter text inside SQL literals and block comments is protected content', () => {
    columnCheck("exec sql select 'One\n/free\n/end-free\nTwo' /* Keep\n/free\n/end-free\n*/ from tab;");
});
test('SQL reflow with a stable record count preserves each prefix and overflow suffix', () => {
    const fields = ['exec sql', 'select a', 'from t', ';'];
    const source = fields.map((field, index) => (`0000${index}  ` + field).padEnd(80) + `TAIL${index}`).join('\n');
    const output = ['   exec sql', '      select A', '      from T', '   ;'];
    const expected = output.map((field, index) => (`0000${index}  ` + field).padEnd(80) + `TAIL${index}`).join('\n');
    for (const planner of [formatSource, planFormatting]) {
        assert.equal(apply(source, planner(source.split('\n')).edits), expected);
        assert.deepEqual(planner(expected.split('\n')).edits, []);
    }
});
test('Column-limited unterminated quotes and out-of-field terminators protect their suffix', () => {
    for (const field of ["value = '" + 'x'.repeat(64), 'x = ' + 'a'.repeat(69)]) {
        const source = column('Before();') + '\n' + '       ' + field + ';\n' + column('After();');
        const plan = planFormatting(source.split('\n'));
        assert.equal(apply(source, plan.edits), column('   Before();') + '\n' + '       ' + field + ';\n' + column('After();'));
        assert.ok(plan.skipped.length);
    }
});
test('Mixed multiline provider edits apply at actual LF and CRLF byte offsets', () => {
    const source = '     H fixed  \n' + column('Work(first\n: second);\nexec sql select a from t;');
    for (const eol of [1, 2]) {
        const { result, edits } = providerApply(source, eol);
        const separator = eol === 2 ? '\r\n' : '\n';
        let bytes = source.replace(/\n/g, separator), offset = 0;
        const offsets = source.split('\n').map(line => { const start = offset; offset += line.length + separator.length; return start; });
        for (const edit of [...edits].reverse()) bytes = bytes.slice(0, offsets[edit.range.start.line] + edit.range.start.character) +
            edit.newText + bytes.slice(offsets[edit.range.end.line] + edit.range.end.character);
        assert.equal(bytes, result.replace(/\n/g, separator));
    }
});
test('Mixed provider and command preserve LF/CRLF and one atomic undo transaction', async () => {
    for (const eol of [1, 2]) {
        const source = '     H fixed  \n' + column('Work(first\n: second);\nexec sql select a from t;\nexec sql call P();');
        const { result, edits } = providerApply(source, eol);
        assert.equal(result.split('\n')[0], '     H fixed  ');
        for (const edit of edits) {
            assert.ok(edit.range.start.character >= 7);
            assert.equal(edit.newText.includes('\r\n'), eol === 2 && edit.newText.includes('\n'));
            assert.ok(!edit.newText.includes('\r\r\n'));
        }
        assert.equal(providerApply(result, eol).edits.length, 0);
        const h = providerHarness();
        const editor = h.editor(source, [new h.Range(1, 9, 4, 20)], eol);
        await h.commands.get('rpgleFreeFormatter.formatSelectionOrDocument')();
        assert.equal(editor.text, result);
        assert.equal(editor.applied.length, 1);
        assert.ok(editor.applied[0].options.undoStopBefore && editor.applied[0].options.undoStopAfter);
        const marker = editor.decorations.at(-1).ranges[0];
        assert.equal(editor.text.split('\n')[marker.range.start.line], column('exec sql call P();'));
        assert.ok(marker.range.start.character >= 7);
    }
});
test('Manifest version and command do not override formatting shortcuts', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));
    assert.equal(manifest.version, '0.4.3');
    assert.ok(manifest.contributes.commands.some(command => command.command === 'rpgleFreeFormatter.formatSelectionOrDocument'));
    assert.equal(manifest.contributes.keybindings.length, 1);
    assert.equal(manifest.contributes.keybindings[0].command, 'rpgleFreeFormatter.toggle');
});
(async () => {
    for (const { name, run } of tests) {
        try { await run(); passed++; console.log('PASS ' + name); }
        catch (error) { console.error('FAIL ' + name); throw error; }
    }
    console.log(`\n${passed} tests passed.`);
})().catch(error => { console.error(error); process.exitCode = 1; });