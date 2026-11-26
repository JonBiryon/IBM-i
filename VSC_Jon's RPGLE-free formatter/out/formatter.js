"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatSource = formatSource;
exports.planFormatting = planFormatting;
const { scanEmbedded, formatEmbedded } = require('./sqlFormatter');
const { classifySource, endingQuote } = require('./sourceFormat');
const fullyFree = lines => /^\uFEFF?\*\*free *$/i.test(lines[0] ?? '');

/** Conservative lexical formatting, not an RPG parser or preprocessor. */
function formatSource(lines) {
    if (!fullyFree(lines)) {
        const plan = planColumnLimited(lines);
        return { edits: plan.edits, notices: plan.notices };
    }
    const reject = reason => ({ edits: [], notices: [reason] });
    if (!/^\uFEFF?\*\*free *$/i.test(lines[0] ?? '')) {
        return reject('Formatting requires **FREE in column 1 of the first line; column-limited source is unchanged.');
    }
    const fresh = () => ({ lines: [], code: '', literal: false, comments: [] });
    const statements = [];
    let pending = fresh();
    let comments = [];
    let quote = '';
    const parentheses = [];
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
            if (/^\s*\/(?:copy|include)(?=\s|$)/i.test(raw)) {
                // Includes are opaque, local pass-through lines, not statements.
                // Never join a partial statement across a directive boundary.
                if (pending.lines.length) {
                    pending.interrupted = true;
                    statements.push(pending);
                    pending = fresh();
                    parentheses.length = 0;
                }
                comments = [];
                continue;
            }
            if (/^\s*\/eof\s*(?:\/\/.*)?$/i.test(raw) && !pending.lines.length) {
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
            // Banners, separators, wrapped comments and neutralised code stay put.
            if (!pending.lines.length && !/^\s*\/\/\//.test(raw) && !/;\s*(?:\/\/.*)?$/.test(raw)) {
                comments.push(line);
            }
            continue;
        }
        if (!pending.lines.length) {
            pending.comments = comments;
            comments = [];
        }
        const info = {
            line, startsQuoted: !!quote, endsQuoted: false, hasLiteral: !!quote,
            mask: '', opens: [], closes: [], semicolon: -1,
            parent: parentheses[parentheses.length - 1]
        };
        pending.lines.push(info);
        let code = '';
        for (let i = 0; i < raw.length; i++) {
            const char = raw[i];
            if (quote) {
                info.mask += ' ';
                if (char === quote) {
                    if (raw[i + 1] === quote) {
                        i++;
                        info.mask += ' ';
                    } else {
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
            if (info.semicolon >= 0 && char.trim()) {
                return reject(`Line ${line + 1}: multiple statements per line are unsupported.`);
            }
            if (char === "'" || char === '"') {
                quote = char;
                info.hasLiteral = true;
                info.mask += ' ';
                code += ' literal ';
                continue;
            }
            info.mask += char;
            code += char;
            if (char === '(') {
                // Align a closer with the function/expression, not the '(' column.
                const before = info.mask.slice(0, -1);
                const name = /[%\w#$@.-]+\s*$/.exec(before);
                const opening = { info, anchor: name ? name.index : i };
                info.opens.push(opening);
                parentheses.push(opening);
            }
            if (char === ')') {
                const opening = parentheses.pop();
                if (!opening) {
                    return reject(`Line ${line + 1}: unmatched parentheses; source unchanged.`);
                }
                info.closes.push(opening);
            }
            if (char === ';') {
                if (parentheses.length) {
                    return reject(`Line ${line + 1}: unmatched parentheses; source unchanged.`);
                }
                info.semicolon = i;
            }
        }
        pending.code += ' ' + code;
        info.endsQuoted = !!quote;
        if (quote) {
            pending.literal = true;
        }
        if (info.semicolon >= 0) {
            statements.push(pending);
            pending = fresh();
        }
    }
    if (pending.lines.length || quote || parentheses.length) {
        return reject('Unterminated statement or literal; source unchanged.');
    }
    const replacements = new Map();
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
        if (line < dataStart) {
            replacements.set(line, ' '.repeat(spaces) + lines[line].replace(/^ */, ''));
        }
    }
    for (const statement of statements) {
        const code = statement.code.trim().toLowerCase();
        const word = /^([a-z][a-z0-9-]*)\b/.exec(code)?.[1] ?? '';
        // Assignment targets spelling operation names are not block openers.
        const assignment = /^[a-z][\w#$@.-]*(?:\([^;]*?\))?\s*(?:=|\+=|-=|\*=|\/=)/i.test(code);
        if (/^exec\s+sql\b/.test(code) || (!assignment && /^(?:cab\w*|cas\w*|do|dountil|dowhile)\b/.test(code))) {
            return reject('Embedded SQL or unsupported control syntax encountered; source unchanged.');
        }
        const closer = !assignment && closers.has(word);
        const branch = !assignment && Object.hasOwn(branchParent, word) ? branchParent[word] : undefined;
        if (statement.interrupted) {
            if (!assignment && (closer || branch || Object.hasOwn(openers, word))) {
                return reject('A compiler directive interrupted control syntax; indentation context is uncertain.');
            }
            continue;
        }
        if (closer && stack.pop() !== word) {
            return reject(`Unmatched ${word}; source unchanged.`);
        }
        if (branch && stack[stack.length - 1] !== branch) {
            return reject(`Unmatched ${word}; source unchanged.`);
        }
        const base = 3 + (stack.length - (branch ? 1 : 0)) * 3;
        for (const line of statement.comments) {
            prefix(line, Math.max(0, base - 1));
        }
        const continuation = /^(?:if|elseif|for|dow|dou|when|snd-msg)\b/.test(code) && !assignment ? 1 : 3;
        let structural = false;
        for (let index = 0; index < statement.lines.length; index++) {
            const info = statement.lines[index];
            const previous = statement.lines[index - 1];
            const standalone = /^\s*;\s*$/.test(info.mask) && !info.hasLiteral;
            // A literal's + / - wrap alone is not a structural statement wrap.
            const literalTail = /^[\s+\-);]*$/.test(info.mask);
            const literalWrap = info.startsQuoted || (literalTail && previous && previous.hasLiteral &&
                /[+-]\s*$/.test(previous.mask) && info.hasLiteral);
            if (index && !literalWrap) {
                structural = true;
            }
            let indent = base + (index ? continuation : 0);
            if (index && info.parent) {
                const opening = info.parent;
                const originalIndent = /^ */.exec(lines[opening.info.line])[0].length;
                indent = Math.max(indent, opening.info.indent + opening.anchor - originalIndent + continuation);
            }
            if (standalone) {
                indent = base;
            } else if (!info.hasLiteral && /^\s*\)+\s*;?\s*$/.test(info.mask) && info.closes.length) {
                const opening = info.closes[0];
                const originalIndent = /^ */.exec(lines[opening.info.line])[0].length;
                indent = opening.info.indent + opening.anchor - originalIndent;
            }
            // Never rewrite leading bytes when the line begins inside a literal.
            info.indent = info.startsQuoted ? /^ */.exec(lines[info.line])[0].length : indent;
            if (!info.startsQuoted) {
                prefix(info.line, indent);
            }
        }
        const last = statement.lines[statement.lines.length - 1];
        if (structural && (last.hasLiteral || !/^\s*;\s*$/.test(last.mask))) {
            const raw = lines[last.line];
            const formatted = replacements.get(last.line) ?? raw;
            const shift = formatted.length - raw.length;
            const position = last.semicolon + shift;
            // Keep trailing whitespace and inline comments on their original line.
            // Only the final semicolon moves; literal bytes are never trimmed.
            replacements.set(last.line, formatted.slice(0, position) + formatted.slice(position + 1) +
                '\n' + ' '.repeat(base) + ';');
        }
        if (!assignment && Object.hasOwn(openers, word)) {
            const end = openers[word];
            const singleDeclaration = /^(?:dcl-ds|dcl-pr|dcl-pi)$/.test(word) &&
                (new RegExp('\\s' + end + '\\s*;$').test(code) ||
                    (word === 'dcl-ds' && /^dcl-ds\s+\S+\s+(?:likeds|likerec)\s*\(/.test(code)));
            if (!singleDeclaration) {
                stack.push(end);
            }
        }
    }
    if (stack.length) {
        return reject('Unclosed block or declaration; source unchanged.');
    }
    // One replacement per original line avoids overlap between indentation and
    // semicolon insertion. Offsets remain in the unmodified document.
    const edits = [...replacements].filter(([line, text]) => text !== lines[line])
        .sort(([a], [b]) => a - b)
        .map(([line, text]) => ({ line, start: 0, end: lines[line].length, text }));
    return {
        edits,
        notices: [
            ...(statements.some(statement => statement.interrupted) ?
                ['Unfinished statement interrupted by /COPY or /INCLUDE was left unchanged.'] : []),
            ...(statements.some(statement => statement.literal) ?
                ['Leading whitespace inside continued literals was protected.'] : [])
        ]
    };
}

/**
 * Project columns 8-80 onto the fully-free engine, then map whole statement
 * units back. There is deliberately no second set of indentation/SQL rules.
 * Original prefixes and overflow are never lexical input or discarded bytes.
 */
function planColumnLimited(lines, selections) {
    const records = classifySource(lines, { formatting: true });
    const normalized = ['**FREE'];
    const boundaries = new Set(), delimiters = new Set();
    const selected = new Set();
    if (selections === undefined) lines.forEach((_, line) => selected.add(line));
    else for (const range of selections) {
        let { start, end } = range;
        if (start.line > end.line || start.line === end.line && start.character > end.character) [start, end] = [end, start];
        if (start.line === end.line && start.character === end.character) continue;
        const last = end.line - (end.character === 0 && end.line > start.line ? 1 : 0);
        for (let line = start.line; line <= last; line++) selected.add(line);
    }
    for (let line = 0; line < lines.length; line++) {
        const raw = lines[line], record = records[line];
        // Legacy directives can place their slash in column 7, outside the
        // executable field. They are never emitted as edits.
        const field = record.reason === 'compiler directive' && raw.slice(5, 7).includes('/')
            ? raw.slice(5, 80) : raw.slice(7, 80);
        if (record.kind === 'fixed' || record.reason === 'unrecognised column-limited layout' ||
            record.reason === 'tab indentation has ambiguous source columns' ||
            record.reason === 'misplaced source-format directive') {
            normalized.push('');
            boundaries.add(line + 1);
        } else if (record.reason === 'program data or text after /EOF') {
            normalized.push('**DATA');
        } else {
            normalized.push(field);
            if (/^\s*\/(?:end-free|free)\s*(?:\/\/.*)?$/i.test(field)) delimiters.add(line + 1);
        }
    }
    // Explicit line scopes retain selections that highlight only source prefixes.
    const scopes = [...selected].filter(line => line >= 0 && line < lines.length)
        .map(line => ({ start: { line: line + 1, character: 0 },
            end: { line: line + 1, character: normalized[line + 1].length } }));
    const plan = planFullyFree(normalized, scopes, boundaries, delimiters);
    const mapPoint = p => ({ line: Math.max(0, p.line - 1),
        character: Math.min(lines[Math.max(0, p.line - 1)]?.length ?? 0, p.character + 7) });
    const skipped = plan.skipped.map(item => ({ ...item, start: mapPoint(item.start), end: mapPoint(item.end) }));
    const edits = [];
    for (let line = 0; line < records.length; line++) {
        if (selected.has(line) && records[line].kind === 'protected' && boundaries.has(line + 1)) {
            skipped.push({ start: { line, character: 0 }, end: { line, character: lines[line].length },
                reason: records[line].reason + '; record preserved.' });
        }
    }
    // Include attached comment edits in the statement's transaction so a width
    // failure never leaves only part of its layout applied.
    for (const statement of plan.statements) {
        const unit = plan.edits.filter(edit => edit.line >= statement.first && edit.line <= statement.last ||
            statement.comments.includes(edit.line));
        if (!unit.length) continue;
        const mapped = [];
        const quotedEnds = new Map();
        let quote = '';
        if (!statement.sql) for (let line = statement.first; line <= statement.last; line++) {
            quote = endingQuote(normalized[line], quote);
            quotedEnds.set(line, quote);
        }
        let reason;
        for (const edit of unit) {
            const first = edit.line - 1, last = (edit.endLine ?? edit.line) - 1;
            const originals = lines.slice(first, last + 1);
            if (originals.some((_, index) => boundaries.has(first + index + 1) ||
                !statement.sql && delimiters.has(first + index + 1))) {
                reason = 'Required edit crosses a fixed record or /FREE boundary.';
                break;
            }
            const field = normalized[edit.line];
            const text = edit.endLine === undefined
                ? field.slice(0, edit.start) + edit.text + field.slice(edit.end)
                : edit.text;
            const parts = text.split('\n');
            // Fixed-width field padding is not executable overflow. Consume only
            // excess trailing spaces outside RPG literals/comments; keep the
            // overflow suffix anchored at column 81 below. SQL owns its own
            // protected multiline content and never uses this padding shortcut.
            if (!statement.sql) for (let index = 0; index < parts.length; index++) {
                if (parts[index].length > 73 && !quotedEnds.get(edit.line + index) &&
                    !parts[index].includes('//') && /^ *$/.test(parts[index].slice(73))) {
                    parts[index] = parts[index].slice(0, 73);
                }
            }
            if (parts.some(part => part.length > 73)) {
                reason = 'Required layout would shift text beyond column 80.';
                break;
            }
            if (statement.sql && parts.length !== originals.length &&
                originals.some(raw => raw.slice(0, 7).trim() || raw.length > 80)) {
                reason = 'SQL reflow would relocate source prefixes or text beyond column 80.';
                break;
            }
            const output = parts.map((part, index) => {
                const raw = originals[index];
                const prefix = raw === undefined ? '       ' : raw.slice(0, 7).padEnd(7, ' ');
                const suffix = raw?.slice(80) ?? '';
                return prefix + (suffix ? part.padEnd(73, ' ') : part) + suffix;
            });
            // Single-line RPG edits may insert a semicolon record; the first
            // output retains its prefix/overflow, new records use blank prefixes.
            const replacement = output.join('\n').slice(7);
            if (replacement !== originals.join('\n').slice(7)) {
                mapped.push({ line: first, start: 7, endLine: last, end: lines[last].length,
                    text: replacement });
            }
        }
        if (reason) {
            skipped.push({ start: mapPoint(statement.start), end: mapPoint(statement.end), reason });
        } else edits.push(...mapped);
    }
    edits.sort((a, b) => a.line - b.line || a.start - b.start);
    const notices = [...new Set(skipped.map(item => item.reason))];
    if (!edits.length && !notices.length && !records.some(record => record.kind === 'free')) {
        notices.push('No recognized free-format code; fixed records and protected source are unchanged.');
    }
    return { edits, skipped, notices, statements: plan.statements.map(statement => ({ ...statement,
        first: statement.first - 1, last: statement.last - 1,
        start: mapPoint(statement.start), end: mapPoint(statement.end),
        comments: statement.comments.map(line => line - 1) })) };
}

/** Selected-line formatting. Outside lines supply lexical/indentation context only. */
function planFormatting(lines, selections) {
    return fullyFree(lines) ? planFullyFree(lines, selections) : planColumnLimited(lines, selections);
}

function planFullyFree(lines, selections, boundaries = new Set(), delimiters = new Set()) {
    const point = (line, character) => ({ line, character });
    const compare = (a, b) => a.line - b.line || a.character - b.character;
    const end = point(lines.length - 1, lines.at(-1)?.length ?? 0);
    const ranges = (selections === undefined ? [{ start: point(0, 0), end }] : selections)
        .map(range => compare(range.start, range.end) <= 0 ? range : { start: range.end, end: range.start })
        .filter(range => compare(range.start, range.end) < 0)
        .map(range => {
            // A later column-zero endpoint is exclusive, including reversed ranges.
            const last = range.end.line - (range.end.character === 0 && range.end.line > range.start.line ? 1 : 0);
            return { start: point(range.start.line, 0), end: point(last, lines[last].length) };
        })
        .sort((a, b) => compare(a.start, b.start));
    const merged = [];
    for (const range of ranges) {
        const previous = merged.at(-1);
        // Adjacent selected lines form one scope, but never bridge an unselected line.
        if (previous && range.start.line <= previous.end.line + 1) {
            if (compare(range.end, previous.end) > 0) previous.end = range.end;
        } else merged.push({ ...range });
    }
    const edits = [], skipped = [], statements = [];
    function skip(start, finish, reason) {
        for (const range of merged) {
            const left = compare(start, range.start) > 0 ? start : range.start;
            const right = compare(finish, range.end) < 0 ? finish : range.end;
            if (compare(left, right) < 0) skipped.push({ start: left, end: right, reason });
        }
    }
    const result = () => ({ edits, skipped, statements,
        notices: [...new Set(skipped.map(item => item.reason))] });
    if (!/^\uFEFF?\*\*free *$/i.test(lines[0] ?? '')) {
        skip(point(0, 0), end, 'Formatting requires **FREE in column 1 of the first line.');
        return result();
    }
    const openers = {
        'dcl-ds': 'end-ds', 'dcl-pr': 'end-pr', 'dcl-pi': 'end-pi',
        'dcl-proc': 'end-proc', begsr: 'endsr', if: 'endif', for: 'endfor',
        dow: 'enddo', dou: 'enddo', select: 'endsl', monitor: 'endmon'
    };
    const branches = { else: 'endif', elseif: 'endif', when: 'endsl', other: 'endsl',
        'on-error': 'endmon', 'on-excp': 'endmon' };
    const closers = new Set(Object.values(openers));
    const stack = [];
    let pending, quote = '', depth = 0, sqlComment = false, blocked;
    let comments = [];
    for (let line = 1; line < lines.length; line++) {
        const raw = lines[line];
        // Fixed records are opaque statement boundaries, not free-form tokens.
        // Delimiters preserve visible block context and remain literal content
        // when encountered inside a continued quote.
        if (boundaries.has(line) || delimiters.has(line) && !quote && !sqlComment) {
            if (pending) {
                pending.end = point(line - 1, lines[line - 1].length);
                pending.last = line - 1;
                pending.reason = 'Unfinished statement interrupted by a fixed record or /FREE boundary; left unchanged.';
                statements.push(pending);
                pending = undefined;
            }
            quote = ''; depth = 0; sqlComment = false; comments = [];
            continue;
        }
        if (!pending && /^\s*exec\s+sql\b/i.test(raw)) {
            let limit = lines.length;
            if (boundaries.size) {
                limit = line + 1;
                while (limit < lines.length && !boundaries.has(limit)) limit++;
            }
            const sql = scanEmbedded(limit < lines.length ? lines.slice(0, limit) : lines, line, delimiters);
            const statement = { start: point(line, /^\s*/.exec(raw)[0].length), first: line,
                code: 'exec sql', comments, sql: true, ...sql };
            comments = [];
            statements.push(statement);
            line = sql.last;
            continue;
        }
        if (!quote && !sqlComment && !pending?.sql && /^\s*\/(?:copy|include)(?=\s|$)/i.test(raw)) {
            if (pending) {
                pending.end = point(line - 1, lines[line - 1].length);
                pending.last = line - 1;
                pending.reason = 'Unfinished statement interrupted by /COPY or /INCLUDE; left unchanged.';
                statements.push(pending);
                pending = undefined;
                depth = 0;
            }
            comments = [];
            continue;
        }
        if (!quote && !sqlComment && (/^\*\*/.test(raw) || /^\s*\/(?![/*])/.test(raw))) {
            const reason = 'Compiler directive or program data: subsequent indentation is not inferred.';
            blocked = { start: pending?.start ?? point(line, 0), reason };
            break;
        }
        if (!pending && /^\s*(?:\/\/.*)?$/.test(raw)) {
            if (/^\s*\/\//.test(raw) && !/^\s*\/\/\//.test(raw) && !/;\s*(?:\/\/.*)?$/.test(raw)) comments.push(line);
            continue;
        }
        if (!pending) {
            pending = { start: point(line, /^\s*/.exec(raw)[0].length), first: line,
                code: '', comments, reason: '', sql: /^\s*exec\s+sql\b/i.test(raw) };
            comments = [];
        } else if (!quote && !sqlComment && depth === 0 && !pending.sql &&
            /^\s*(?:[\w#$@.-]+\s*\(|[\w#$@.-]+\s*=|dcl-|if\b|else\b|endif\b|end-)/i.test(raw) &&
            !/[+\-*/=:(,]\s*$/.test(pending.code)) {
            pending.reason = 'Ambiguous continuation or missing semicolon; statement left unchanged.';
        }
        if (/^[ \t]*\t/.test(raw)) pending.reason = 'Tab indentation is unsupported.';
        let semicolon = -1;
        for (let column = 0; column < raw.length; column++) {
            const char = raw[column], next = raw[column + 1];
            if (sqlComment) {
                if (char === '*' && next === '/') { sqlComment = false; column++; }
                continue;
            }
            if (quote) {
                if (char === quote) {
                    if (next === quote) column++;
                    else quote = '';
                }
                continue;
            }
            if (char === '/' && next === '/' || pending.sql && char === '-' && next === '-') break;
            if (char === '/' && next === '*') {
                if (!pending.sql) {
                    blocked = { start: pending.start, reason: 'Unsupported block comment; remaining source is protected.' };
                    break;
                }
                sqlComment = true; column++; continue;
            }
            if (semicolon >= 0 && char.trim()) pending.reason = 'Multiple statements on one line are unsupported.';
            if (char === "'" || char === '"') { quote = char; pending.code += ' literal '; continue; }
            pending.code += char;
            if (!pending.sql) {
                if (char === '(') depth++;
                if (char === ')' && --depth < 0) pending.reason = 'Unmatched parentheses.';
            }
            if (char === ';') {
                semicolon = column;
                if (depth !== 0) pending.reason = 'Unmatched parentheses.';
            }
        }
        if (blocked) break;
        pending.code += ' ';
        if (semicolon >= 0 && !quote && !sqlComment) {
            pending.end = point(line, semicolon + 1);
            pending.last = line;
            statements.push(pending);
            pending = undefined; depth = 0;
        }
    }
    if (pending && !blocked) skip(pending.start, end, 'Unfinished statement or literal.');
    if (blocked) skip(blocked.start, end, blocked.reason);
    // First establish block context and quarantine uncertain structure before planning edits.
    let uncertain = false;
    for (const statement of statements) {
        const code = statement.code.trim().toLowerCase();
        const word = /^([a-z][a-z0-9-]*)\b/.exec(code)?.[1] ?? '';
        const assignment = /^[a-z][\w#$@.-]*(?:\([^;]*?\))?\s*(?:=|\+=|-=|\*=|\/=)/i.test(code);
        const closer = !assignment && closers.has(word);
        const branch = !assignment && branches[word];
        const opener = !assignment && openers[word];
        statement.sql ||= /^exec\s+sql\b/.test(code);
        if (uncertain) statement.reason = 'Indentation context is uncertain after malformed control syntax.';
        if (statement.sql) {
            // SQL has its own lexical scanner, including compound terminators.
            // Incomplete SQL consumes only the uncertain suffix, never RPG edits.
            if (statement.incomplete) uncertain = true;
        } else if (!assignment && /^(?:cab\w*|cas\w*|do|dountil|dowhile)\b/.test(code)) {
            statement.reason = 'Unsupported control syntax; subsequent indentation is uncertain.';
            uncertain = true;
        } else if (closer || branch) {
            if (stack.at(-1)?.closer !== (closer ? word : branch)) {
                statement.reason = 'Unmatched block boundary; subsequent indentation is uncertain.';
                uncertain = true;
            }
        }
        statement.context = stack.map(item => item.statement);
        if (statement.reason && (opener || closer || branch)) uncertain = true;
        if (!statement.reason && closer) stack.pop();
        if (!statement.reason && opener) {
            const single = /^(?:dcl-ds|dcl-pr|dcl-pi)$/.test(word) &&
                (new RegExp('\\s' + opener + '\\s*;$').test(code) ||
                    word === 'dcl-ds' && /^dcl-ds\s+\S+\s+(?:likeds|likerec)\s*\(/.test(code));
            if (!single) {
                stack.push({ closer: opener, statement });
                statement.opensBlock = true;
            }
        }
        statement.word = word;
        statement.closer = closer;
        statement.branch = branch;
    }
    const unclosed = stack[0]?.statement.start;
    for (const statement of statements) {
        if (unclosed && compare(statement.start, unclosed) >= 0) statement.reason ||= 'Unclosed block or declaration.';
        const range = merged.find(range => compare(range.start, statement.start) <= 0 && compare(statement.end, range.end) <= 0);
        if (statement.reason || !range) {
            skip(statement.start, statement.end, statement.reason || 'Selection contains only part of this statement.');
            continue;
        }
        if (statement.sql) {
            const base = 3 + statement.context.length * 3;
            const plan = formatEmbedded(statement.tokens, base);
            if (plan.reason) {
                skip(statement.start, statement.end, 'SQL: ' + plan.reason);
                continue;
            }
            const first = statement.first, last = statement.last;
            const original = lines.slice(first, last + 1).join('\n');
            if (original !== plan.text) {
                // Include full original lines, including indentation and comments.
                // A SQL statement is one indivisible multiline replacement.
                if (compare(range.start, point(first, 0)) > 0 ||
                    compare(point(last, lines[last].length), range.end) > 0) {
                    skip(statement.start, statement.end, 'Required SQL edit extends outside the selection.');
                } else edits.push({ line: first, start: 0, endLine: last, end: lines[last].length, text: plan.text });
            }
            continue;
        }
        // Reuse the established layout engine with balanced synthetic context, never
        // formatting the outside source. Each original line is planned at most once.
        const context = statement.context.map(item => item.code.trim());
        const synthetic = ['**FREE', ...context, ...lines.slice(statement.first, statement.last + 1)];
        const remaining = statement.context.map(item => openers[item.word]);
        if (statement.closer) remaining.pop();
        if (statement.opensBlock) remaining.push(openers[statement.word]);
        synthetic.push(...remaining.reverse().map(word => word + ';'));
        const plan = formatSource(synthetic);
        if (plan.notices.length && !plan.edits.length && !plan.notices[0].startsWith('Leading whitespace')) {
            skip(statement.start, statement.end, plan.notices.join(' '));
            continue;
        }
        const statementEdits = [];
        let outsideSelection = false;
        for (const edit of plan.edits) {
            const line = edit.line - 1 - context.length + statement.first;
            if (line < statement.first || line > statement.last) continue;
            const raw = lines[line];
            let start = 0, oldEnd = raw.length, newEnd = edit.text.length;
            while (start < oldEnd && start < newEnd && raw[start] === edit.text[start]) start++;
            while (oldEnd > start && newEnd > start && raw[oldEnd - 1] === edit.text[newEnd - 1]) { oldEnd--; newEnd--; }
            if (compare(range.start, point(line, start)) <= 0 && compare(point(line, oldEnd), range.end) <= 0) {
                statementEdits.push({ line, start, end: oldEnd, text: edit.text.slice(start, newEnd) });
            } else outsideSelection = true;
        }
        // A statement is a single formatting unit. Never commit only the edits
        // that happen to fit when another required edit crosses the boundary.
        if (outsideSelection) {
            skip(statement.start, statement.end, 'Required whitespace edit extends outside the selection.');
            continue;
        }
        edits.push(...statementEdits);
        for (const line of statement.comments) {
            const base = 3 + (statement.context.length - (statement.closer || statement.branch ? 1 : 0)) * 3;
            const width = /^ */.exec(lines[line])[0].length;
            if (width !== base - 1 && merged.some(item => compare(item.start, point(line, 0)) <= 0 && compare(point(line, lines[line].length), item.end) <= 0)) {
                edits.push({ line, start: 0, end: width, text: ' '.repeat(Math.max(0, base - 1)) });
            }
        }
    }
    edits.sort((a, b) => a.line - b.line || a.start - b.start);
    return result();
}