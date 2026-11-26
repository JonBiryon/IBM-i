'use strict';

// A bounded lexical layout engine, not a Db2 grammar validator. Never inspect
// literal contents for keywords, delimiters or dynamic SQL to format.
const keywords = new Set(('select distinct all into from where and or not between in exists is null like escape ' +
    'join inner left right full outer cross on as union except intersect order by group having asc desc ' +
    'insert values update delete set prepare declare cursor for with hold return to caller client scroll ' +
    'open fetch next prior first last absolute relative close using indicator begin atomic end case when then else ' +
    'limit offset rows row only of read write isolation uncommitted committed change repeatable serializable ' +
    'commit rollback work savepoint release connect disconnect current date time timestamp user schema path ' +
    'option naming commit closqlcsr datfmt timfmt default nulls before after over partition rows range ' +
    'unbounded preceding following row_number count sum min max avg coalesce cast char varchar integer decimal ' +
    'smallint bigint numeric real double precision trim substring upper lower length concat replace ' +
    'diagnostics get row_count result sets sensitive insensitive dynamic static no yes without ur cs rs rr ' +
    'optimize conflict do nothing returning call execute immediate describe table truncate merge matched ' +
    'language sql procedure function trigger create alter drop if loop while repeat until leave iterate signal ' +
    'resignal handler continue exit condition sqlstate sqlcode sqlerror sqlexception sqlwarning found ' +
    'national true false current_date current_time current_timestamp current_user current_schema').split(/\s+/));

function* lex(source) {
    let i = 0;
    while (i < source.length) {
        if (/\s/.test(source[i])) { i++; continue; }
        const start = i;
        let type = 'symbol';
        if (source.startsWith('--', i) || source.startsWith('//', i)) {
            type = 'linecomment';
            while (i < source.length && source[i] !== '\n') i++;
        } else if (source.startsWith('/*', i)) {
            type = 'comment';
            const end = source.indexOf('*/', i + 2);
            if (end < 0) throw new Error('Unterminated SQL block comment.');
            i = end + 2;
        } else if (source[i] === "'" || source[i] === '"') {
            const quote = source[i++];
            type = quote === "'" ? 'literal' : 'quoted';
            let closed = false;
            while (i < source.length) {
                if (source[i++] === quote) {
                    if (source[i] === quote) i++;
                    else { closed = true; break; }
                }
            }
            if (!closed) throw new Error('Unterminated SQL literal or delimited identifier.');
        } else if (source[i] === ':' && /[A-Za-z_#$@]/.test(source[i + 1] || '')) {
            type = 'host'; i += 2;
            while (/[\w#$@.]/.test(source[i] || '\0')) i++;
        } else if (source[i] === '*' && /[A-Za-z]/.test(source[i + 1] || '')) {
            type = 'special'; i += 2;
            while (/[\w]/.test(source[i] || '\0')) i++;
        } else if (/[A-Za-z_#$@]/.test(source[i])) {
            type = 'word'; i++;
            while (/[\w#$@]/.test(source[i] || '\0')) i++;
        } else if (/\d/.test(source[i]) || source[i] === '.' && /\d/.test(source[i + 1] || '')) {
            type = 'number';
            const number = /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/.exec(source.slice(i))[0];
            i += number.length;
        } else {
            i += /^(?:<>|<=|>=|!=|\|\||=>)/.test(source.slice(i)) ? 2 : 1;
        }
        const raw = source.slice(start, i);
        yield { raw, type, key: type === 'word' ? raw.toLowerCase() : raw, start, end: i,
            lineStart: source.lastIndexOf('\n', start),
            text: type === 'word' ? (keywords.has(raw.toLowerCase()) ||
                ['n', 'x', 'gx', 'ux'].includes(raw.toLowerCase()) && source[i] === "'" ? raw.toLowerCase() : raw.toUpperCase()) :
                type === 'special' ? raw.toLowerCase() : raw };
    }
}

function scanEmbedded(lines, first, delimiters = new Set()) {
    const source = lines.slice(first).join('\n');
    const stops = new Map();
    let offset = 0;
    for (let line = first; line < lines.length; line++) {
        if (delimiters.has(line)) stops.set(offset + /^\s*/.exec(lines[line])[0].length, line);
        offset += lines[line].length + 1;
    }
    const header = /^\s*exec\s+sql\b/i.exec(source);
    const tokens = [];
    const stack = [];
    let parens = 0, reason = '', endTag = false;
    try {
        for (const token of lex(source.slice(header[0].length))) {
            token.start += header[0].length; token.end += header[0].length;
            // A delimiter inside a quoted token or block comment is content,
            // not a source boundary. Use the SQL lexer rather than line regexes.
            if (stops.has(token.start)) {
                const last = stops.get(token.start) - 1;
                return { tokens, last, end: { line: last, character: lines[last].length },
                    reason: 'Unfinished SQL interrupted by /FREE boundary.', incomplete: true };
            }
            tokens.push(token);
            if (token.type === 'word') {
                if (endTag && ['if', 'loop', 'while', 'repeat', 'case'].includes(token.key)) {
                    endTag = false; continue;
                }
                endTag = false;
                if (token.key === 'begin' || token.key === 'case') stack.push(token.key);
                if (['if', 'loop', 'while', 'repeat'].includes(token.key)) {
                    stack.push(token.key);
                    reason ||= 'SQL procedural IF/LOOP/WHILE/REPEAT layout is unsupported.';
                }
                if (token.key === 'end') {
                    if (!stack.length) reason ||= 'Unmatched SQL END.';
                    else stack.pop();
                    endTag = true;
                }
            }
            if (token.key === '(') parens++;
            if (token.key === ')' && --parens < 0) reason ||= 'Unmatched SQL parentheses.';
            if (token.key === ';' && !stack.length) {
                if (parens) reason ||= 'Unmatched SQL parentheses.';
                const prefix = source.slice(0, token.end).split('\n');
                const last = first + prefix.length - 1;
                const column = prefix.at(-1).length;
                const tail = lines[last].slice(column);
                // A trailing comment belongs to this statement, not the next RPG line.
                if (tail.trim()) {
                    if (/^\s*(?:\/\/|--|\/\*)/.test(tail)) {
                        const trailing = [...lex(tail)];
                        if (trailing.some(t => !['comment', 'linecomment'].includes(t.type))) reason ||= 'SQL shares a line with other code.';
                        tokens.push(...trailing);
                    } else reason ||= 'SQL shares a line with other code.';
                }
                return { tokens, last, end: { line: last, character: column }, reason };
            }
        }
    } catch (error) { reason ||= error.message; }
    return { tokens, last: lines.length - 1, end: { line: lines.length - 1, character: lines.at(-1).length },
        reason: reason || 'Unfinished SQL statement, compound block or literal.', incomplete: true };
}

const significant = tokens => tokens.filter(t => !['comment', 'linecomment'].includes(t.type));
const fail = reason => { throw new Error(reason); };
function flat(tokens) {
    let text = '', previous;
    for (const token of tokens) {
        const value = token.text;
        const tight = !text || [',', ')', '.', ';'].includes(value) || previous?.key === '.' ||
            previous?.key === '(' || value === '(' && previous &&
            (previous.type === 'host' || previous.type === 'word' && !['in', 'exists', 'values', 'from', 'table', 'over'].includes(previous.key)) ||
            token.type === 'literal' && previous?.type === 'word' && ['n', 'x', 'gx', 'ux'].includes(previous.key);
        text += (tight ? '' : ' ') + value;
        previous = token;
    }
    return text;
}
function matching(tokens, start, open = '(', close = ')') {
    let depth = 0;
    for (let i = start; i < tokens.length; i++) {
        if (tokens[i].key === open) depth++;
        if (tokens[i].key === close && --depth === 0) return i;
    }
    fail('Unbalanced SQL ' + open + '/' + close + '.');
}
function boundaries(tokens, predicate) {
    const found = [];
    let parens = 0, cases = 0;
    for (let i = 0; i < tokens.length; i++) {
        const key = tokens[i].key;
        if (!parens && !cases && predicate(tokens[i], i)) found.push(i);
        if (key === '(') parens++;
        if (key === ')') parens--;
        if (tokens[i].type === 'word' && key === 'case') cases++;
        if (tokens[i].type === 'word' && key === 'end') cases--;
        if (parens < 0 || cases < 0) fail('Unbalanced SQL expression.');
    }
    if (parens || cases) fail('Unbalanced SQL expression.');
    return found;
}
function split(tokens, separator) {
    const cuts = boundaries(tokens, t => t.key === separator);
    const result = [];
    let start = 0;
    for (const end of [...cuts, tokens.length]) {
        const part = tokens.slice(start, end);
        if (!significant(part).length) fail('Empty SQL list item or statement.');
        start = end + 1;
        // Canonically associate a comment following a comma on the same source
        // line with the preceding item. This keeps trailing-comma layout stable.
        while (separator === ',' && ['comment', 'linecomment'].includes(tokens[start]?.type) &&
            tokens[start].lineStart === tokens[end]?.lineStart) part.push(tokens[start++]);
        result.push(part);
    }
    return result;
}

function formatEmbedded(tokens, base) {
    const rows = [];
    const emit = (indent, text) => rows.push({ indent, text });
    const suffix = text => {
        // Never append syntax to a -- or // comment: insert before that token.
        const row = rows.at(-1);
        const comments = [...lex(row.text)].find(t => t.type === 'linecomment');
        if (comments) row.text = row.text.slice(0, comments.start).trimEnd() + text + ' ' + row.text.slice(comments.start);
        else row.text += text;
    };
    function expression(part, indent, prefix = '') {
        let buffer = [], lead = prefix;
        const flush = () => {
            if (buffer.length || lead.trim()) emit(indent, lead + flat(buffer));
            buffer = []; lead = '';
        };
        for (let i = 0; i < part.length; i++) {
            const token = part[i];
            if (token.type === 'linecomment' || token.type === 'comment' && token.raw.includes('\n')) {
                buffer.push(token); flush();
            } else if (token.type === 'word' && token.key === 'case') {
                const end = matching(part, i, 'case', 'end');
                if (buffer.some(t => t.type === 'word' && ['when', 'else'].includes(t.key))) {
                    flush();
                    expression(part.slice(i, end + 1), indent + 3);
                    i = end;
                    continue;
                }
                const inside = part.slice(i + 1, end);
                const branches = boundaries(inside, t => t.type === 'word' && ['when', 'else'].includes(t.key));
                if (!branches.length || inside[branches[0]].key !== 'when') fail('Malformed SQL CASE.');
                buffer.push(token, ...inside.slice(0, branches[0])); flush();
                for (let b = 0; b < branches.length; b++) {
                    const branch = inside.slice(branches[b], branches[b + 1] ?? inside.length);
                    if (branch[0].key === 'when' && !boundaries(branch, t => t.type === 'word' && t.key === 'then').length) fail('SQL WHEN is missing THEN.');
                    expression(branch, indent + 3);
                }
                lead = 'end';
                i = end;
                // END and an alias belong to the CASE opening level.
                if (part[i + 1]) lead += ' ';
            } else if (token.key === '(') {
                const end = matching(part, i);
                const inside = part.slice(i + 1, end);
                if (significant(inside)[0]?.key === 'select') {
                    buffer.push(token); flush();
                    statement(inside, indent + 3);
                    lead = ')';
                    if (part[end + 1] && ![',', ')', '.'].includes(part[end + 1].key)) lead += ' ';
                } else if (inside.some(t => t.type === 'word' && ['case', 'select'].includes(t.key) ||
                    t.type === 'linecomment' || t.type === 'comment' && t.raw.includes('\n'))) {
                    buffer.push(token); flush();
                    expression(inside, indent + 3);
                    lead = ')';
                    if (part[end + 1] && ![',', ')', '.'].includes(part[end + 1].key)) lead += ' ';
                } else buffer.push(...part.slice(i, end + 1));
                i = end;
            } else buffer.push(token);
        }
        flush();
    }
    function condition(part, indent, phrase) {
        let between = false;
        const cuts = boundaries(part, t => {
            if (t.type !== 'word') return false;
            if (t.key === 'between') { between = true; return false; }
            if (t.key === 'and' && between) { between = false; return false; }
            return t.key === 'and' || t.key === 'or';
        });
        let start = 0, prefix = phrase;
        for (const end of [...cuts, part.length]) {
            const segment = part.slice(start, end);
            if (!significant(segment).length) fail('Missing SQL condition.');
            // Groups, including NOT groups, get their own structural level.
            let group = -1;
            for (let i = 0; i < segment.length; i++) {
                if (segment[i].key !== '(') continue;
                const close = matching(segment, i);
                const inside = segment.slice(i + 1, close);
                if (close === segment.length - 1 && significant(inside)[0]?.key !== 'select' &&
                    boundaries(inside, t => t.type === 'word' && ['and', 'or'].includes(t.key)).length) group = i;
                break;
            }
            if (group >= 0) {
                emit(indent, (prefix ? prefix + ' ' : '') + flat(segment.slice(0, group + 1)));
                condition(segment.slice(group + 1, -1), indent + 3, '');
                emit(indent, ')');
            } else expression(segment, indent, prefix ? prefix + ' ' : '');
            prefix = part[end]?.text;
            start = end + 1;
        }
    }
    function list(part, indent, phrase) {
        const items = split(part, ',');
        if (items.length === 1) expression(items[0], indent, phrase ? phrase + ' ' : '');
        else {
            if (phrase) emit(indent, phrase);
            items.forEach((item, index) => {
                expression(item, indent + (phrase ? 3 : 0));
                if (index !== items.length - 1) suffix(',');
            });
        }
    }
    function statement(part, indent) {
        const sig = significant(part);
        if (!sig.length) fail('Empty SQL statement.');
        const leading = part.indexOf(sig[0]);
        if (leading) {
            expression(part.slice(0, leading), indent);
            part = part.slice(leading);
        }
        const first = sig[0].key;
        if (first === 'begin') {
            const beginIndex = part.indexOf(sig[0]);
            const last = sig.at(-1);
            if (last.key !== 'end') fail('Compound SQL must end with END.');
            let start = beginIndex + 1;
            if (sig[1]?.key === 'atomic' || sig[1]?.key === 'not') {
                start = part.indexOf(sig[1]) + 1;
                if (sig[1].key === 'not') {
                    if (sig[2]?.key !== 'atomic') fail('Malformed BEGIN NOT ATOMIC.');
                    start = part.indexOf(sig[2]) + 1;
                }
            }
            expression(part.slice(0, start), indent);
            const body = part.slice(start, part.indexOf(last));
            let depth = 0, begin = 0;
            for (let i = 0; i < body.length; i++) {
                if (body[i].type === 'word' && ['begin', 'case'].includes(body[i].key)) depth++;
                if (body[i].type === 'word' && body[i].key === 'end') depth--;
                if (body[i].key === ';' && !depth) {
                    statement(body.slice(begin, i), indent + 3);
                    if (rows.at(-1).indent === indent + 3) suffix(';');
                    else emit(indent + 3, ';');
                    begin = i + 1;
                }
            }
            const tail = body.slice(begin);
            if (significant(tail).length) fail('Compound SQL body is missing a terminator.');
            if (tail.length) expression(tail, indent + 3);
            emit(indent, 'end');
            return;
        }
        const allowed = ['select', 'insert', 'update', 'delete', 'set', 'prepare', 'declare', 'open', 'fetch', 'close', 'values'];
        if (!allowed.includes(first)) fail('Unsupported SQL operation: ' + first + '.');
        if (sig.some(t => t.type === 'word' && ['create', 'merge', 'if', 'loop', 'while', 'repeat'].includes(t.key))) fail('Unsupported SQL structure.');
        if (['prepare', 'open', 'close'].includes(first)) {
            if (sig.length < 2) fail('Incomplete SQL ' + first + '.');
            expression(part, indent); return;
        }
        if (first === 'declare') {
            const index = boundaries(part, t => t.type === 'word' && t.key === 'for')[0];
            if (index === undefined || !sig.some(t => t.key === 'cursor')) fail('Only DECLARE CURSOR is supported.');
            const rest = part.slice(index + 1);
            if (!significant(rest).length) fail('Incomplete SQL cursor declaration.');
            if (significant(rest)[0].key === 'select') {
                emit(indent, flat(part.slice(0, index + 1))); statement(rest, indent + 3);
            } else expression(part, indent);
            return;
        }
        const starters = new Set(['select', 'into', 'from', 'where', 'having', 'set', 'values', 'join', 'on', 'limit', 'offset', 'union', 'except', 'intersect']);
        const cuts = boundaries(part, (t, i) => t.type === 'word' && (starters.has(t.key) ||
            ['order', 'group'].includes(t.key) && part[i + 1]?.key === 'by' ||
            ['inner', 'left', 'right', 'full', 'cross'].includes(t.key) && ['join', 'outer'].includes(part[i + 1]?.key)));
        // JOIN modifiers and INSERT INTO are one phrase, not extra clauses.
        const filtered = cuts.filter((i, n) => {
            if (part[i].key === 'join' && ['inner', 'left', 'right', 'full', 'cross', 'outer'].includes(part[i - 1]?.key)) return false;
            if (part[i].key === 'into' && first === 'insert') return false;
            if (part[i].key === 'from' && first === 'delete' && i === 1) return false;
            return true;
        });
        if (filtered[0] !== 0) filtered.unshift(0);
        for (let c = 0; c < filtered.length; c++) {
            const start = filtered[c], end = filtered[c + 1] ?? part.length;
            let width = 1;
            const key = part[start].key;
            if (['order', 'group'].includes(key)) width = 2;
            if (key === 'select' && ['distinct', 'all'].includes(part[start + 1]?.key)) width = 2;
            if (key === 'set' && part[start + 1]?.key === 'option') width = 2;
            if (['inner', 'left', 'right', 'full', 'cross'].includes(key)) width = part[start + 1]?.key === 'outer' ? 3 : 2;
            if (key === 'insert' && part[start + 1]?.key === 'into') width = 2;
            if (key === 'delete' && part[start + 1]?.key === 'from') width = 2;
            const phrase = flat(part.slice(start, start + width));
            const content = part.slice(start + width, end);
            const level = ['join', 'inner', 'left', 'right', 'full', 'cross', 'on'].includes(key) ? indent + 3 : indent;
            if (['union', 'except', 'intersect'].includes(key) &&
                (!significant(content).length || significant(content).every(t => ['all', 'distinct'].includes(t.key)))) {
                emit(level, flat(part.slice(start, end)));
                continue;
            }
            if (!significant(content).length) fail('Incomplete SQL ' + phrase + ' clause.');
            if (key === 'where' || key === 'on' || key === 'having') condition(content, level, phrase);
            else if (['select', 'into', 'order', 'group', 'set', 'from'].includes(key)) list(content, level, phrase);
            else if (key === 'values' || key === 'insert') {
                // Expand parenthesized column/value lists without changing their tokens.
                let opening = content.findIndex(t => t.key === '(');
                if (opening >= 0 && matching(content, opening) === content.length - 1) {
                    const inside = content.slice(opening + 1, -1);
                    if (significant(inside)[0]?.key !== 'select' && split(inside, ',').length > 1) {
                        emit(level, phrase + ' ' + flat(content.slice(0, opening + 1)));
                        list(inside, level + 3, ''); emit(level, ')');
                    } else expression(content, level, phrase + ' ');
                } else list(content, level, phrase);
            } else expression(content, level, phrase + ' ');
        }
    }
    try {
        const outer = tokens.findLastIndex(t => t.key === ';');
        if (outer < 0) fail('Missing SQL terminator.');
        emit(base, 'exec sql');
        statement(tokens.slice(0, outer), base + 3);
        emit(base, ';');
        if (tokens.length > outer + 1) suffix(' ' + flat(tokens.slice(outer + 1)));
        const text = rows.map(row => ' '.repeat(row.indent) + row.text).join('\n');
        // Refuse a layout if lexical code tokens or protected bytes changed.
        // In particular this guards against a line comment swallowing syntax in
        // a position the renderer has not explicitly handled.
        const fingerprint = values => ({
            code: significant(values).map(t => [t.type, ['word', 'special'].includes(t.type) ? t.raw.toLowerCase() : t.raw]),
            comments: values.filter(t => ['comment', 'linecomment'].includes(t.type)).map(t => t.raw)
        });
        if (JSON.stringify(fingerprint(tokens)) !== JSON.stringify(fingerprint([...lex(text)].slice(2)))) {
            fail('SQL layout would change lexical tokens or comments; statement left unchanged.');
        }
        return { text };
    } catch (error) { return { reason: error.message }; }
}

module.exports = { scanEmbedded, formatEmbedded, lex };