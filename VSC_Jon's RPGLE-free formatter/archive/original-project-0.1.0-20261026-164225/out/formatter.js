"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatSource = formatSource;
/**
 * Conservative lexical indentation, not an RPG parser. No token, line break,
 * literal content or trailing whitespace is changed. Reject unknown structure
 * atomically rather than return misleading indentation for the rest of a member.
 */
function formatSource(lines) {
    const reject = (reason) => ({ edits: [], notices: [reason] });
    if (!/^\uFEFF?\*\*free *$/i.test(lines[0] ?? '')) {
        return reject('Formatting requires **FREE in column 1 of the first line; column-limited source is unchanged.');
    }
    const statements = [];
    let pending = { lines: [], code: '', literal: false, comments: [] };
    let comments = [];
    let quote = '';
    let parentheses = 0;
    let dataStart = lines.length;
    for (let line = 1; line < lines.length; line++) {
        const raw = lines[line];
        if (!quote && /^\*\*/.test(raw)) {
            if (pending.lines.length) {
                return reject('Program data encountered inside an unfinished statement; source unchanged.');
            }
            dataStart = line;
            break;
        }
        if (!quote && /^\s*\/(?!\/)/.test(raw)) {
            if (/^\s*\/eof\s*(?:\/\/.*)?$/i.test(raw) && pending.lines.length === 0) {
                dataStart = line;
                break;
            }
            return reject(`Line ${line + 1}: compiler directives may affect structure; formatting was not applied.`);
        }
        if (/^[ \t]*\t/.test(raw)) {
            return reject(`Line ${line + 1}: tab indentation is unsupported.`);
        }
        if (!quote && /^\s*$/.test(raw)) {
            continue;
        }
        if (!quote && /^\s*\/\//.test(raw)) {
            // Banners, separators and neutralised code retain their own layout.
            if (!pending.lines.length && !/^\s*\/\/\//.test(raw) && !/;\s*(?:\/\/.*)?$/.test(raw)) {
                comments.push(line);
            }
            continue;
        }
        if (!pending.lines.length) {
            pending.comments = comments;
            comments = [];
        }
        pending.lines.push(line);
        let code = '';
        let terminators = 0;
        let afterTerminator = false;
        for (let i = 0; i < raw.length; i++) {
            const char = raw[i];
            if (quote) {
                if (char === quote) {
                    if (raw[i + 1] === quote) {
                        i++;
                    }
                    else {
                        quote = '';
                    }
                }
                continue;
            }
            if (char === '/' && raw[i + 1] === '/') {
                break;
            }
            if (char === '/' && raw[i + 1] === '*') {
                return reject(`Line ${line + 1}: block-comment syntax is not supported by this formatter.`);
            }
            if (afterTerminator && char.trim()) {
                return reject(`Line ${line + 1}: multiple statements per line are unsupported.`);
            }
            if (char === "'" || char === '"') {
                quote = char;
                code += ' literal ';
            }
            else {
                code += char;
                if (char === '(') {
                    parentheses++;
                }
                if (char === ')') {
                    parentheses--;
                }
                if (parentheses < 0 || (char === ';' && parentheses !== 0)) {
                    return reject(`Line ${line + 1}: unmatched parentheses; source unchanged.`);
                }
                if (char === ';') {
                    terminators++;
                    afterTerminator = true;
                }
            }
        }
        pending.code += ' ' + code;
        if (quote) {
            pending.literal = true;
        }
        if (terminators) {
            statements.push(pending);
            pending = { lines: [], code: '', literal: false, comments: [] };
        }
    }
    if (pending.lines.length || quote) {
        return reject('Unterminated statement or literal; source unchanged.');
    }
    const edits = [];
    const stack = [];
    const openers = {
        'dcl-ds': 'end-ds', 'dcl-pr': 'end-pr', 'dcl-pi': 'end-pi',
        'dcl-proc': 'end-proc', begsr: 'endsr', if: 'endif', for: 'endfor',
        dow: 'enddo', dou: 'enddo', select: 'endsl', monitor: 'endmon'
    };
    const closers = new Set(Object.values(openers));
    const branchParent = {
        else: 'endif', elseif: 'endif', when: 'endsl', other: 'endsl',
        'on-error': 'endmon', 'on-excp': 'endmon'
    };
    function prefix(line, spaces) {
        if (line >= dataStart) {
            return;
        }
        const raw = lines[line];
        const length = /^ */.exec(raw)[0].length;
        const text = ' '.repeat(spaces);
        if (raw.slice(0, length) !== text) {
            edits.push({ line, start: 0, end: length, text });
        }
    }
    for (const statement of statements) {
        const code = statement.code.trim().toLowerCase();
        const word = /^([a-z][a-z0-9-]*)\b/.exec(code)?.[1] ?? '';
        // Assignment targets that happen to spell operation names are not openers.
        const assignment = /^[a-z][\w#$@.-]*(?:\([^;]*?\))?\s*(?:=|\+=|-=|\*=|\/=)/i.test(code);
        if (/^exec\s+sql\b/.test(code) || (!assignment && /^(?:cab\w*|cas\w*|do|dountil|dowhile)\b/.test(code))) {
            return reject('Embedded SQL or unsupported control syntax encountered; source unchanged.');
        }
        const closer = !assignment && closers.has(word);
        const branch = !assignment && Object.hasOwn(branchParent, word) ? branchParent[word] : undefined;
        if (closer && stack.pop() !== word) {
            return reject(`Unmatched ${word}; source unchanged.`);
        }
        if (branch && stack[stack.length - 1] !== branch) {
            return reject(`Unmatched ${word}; source unchanged.`);
        }
        const depth = stack.length - (branch ? 1 : 0);
        const base = 3 + depth * 3;
        for (const line of statement.comments) {
            prefix(line, Math.max(0, base - 1));
        }
        if (!statement.literal) {
            // +1: long condition and message-expression wraps. +3: declarations,
            // calls, and short assignment readability wraps. Intent is not inferable
            // perfectly: this documented statement-class policy is deterministic.
            const lengthWrap = /^(?:if|elseif|for|dow|dou|when|snd-msg)\b/.test(code) && !assignment;
            const continuation = lengthWrap ? 1 : 3;
            for (let index = 0; index < statement.lines.length; index++) {
                const line = statement.lines[index];
                const closingOnly = /^\s*\)+\s*;?\s*(?:\/\/.*)?$/.test(lines[line]);
                prefix(line, base + (index === 0 || closingOnly ? 0 : continuation));
            }
        }
        if (!assignment && Object.hasOwn(openers, word)) {
            const end = openers[word];
            const singleDeclaration = /^(?:dcl-ds|dcl-pr|dcl-pi)$/.test(word) && (new RegExp('\\s' + end + '\\s*;$').test(code) ||
                (word === 'dcl-ds' && /^dcl-ds\s+\S+\s+(?:likeds|likerec)\s*\(/.test(code)));
            if (!singleDeclaration) {
                stack.push(end);
            }
        }
    }
    if (stack.length) {
        return reject('Unclosed block or declaration; source unchanged.');
    }
    const literals = statements.filter(statement => statement.literal);
    return {
        edits: edits.sort((a, b) => a.line - b.line),
        notices: literals.length ? ['Statements with continued literals retained their original indentation.'] : []
    };
}
//# sourceMappingURL=formatter.js.map