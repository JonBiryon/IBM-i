"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.selectedLines = selectedLines;
exports.planToggle = planToggle;
exports.mapPoint = mapPoint;
const sourceFormat_1 = require("./sourceFormat");
function selectedLines(selections, lineCount) {
    const chosen = new Set();
    for (const selection of selections) {
        const { start, end } = selection;
        const last = end.line > start.line && end.character === 0 ? end.line - 1 : end.line;
        for (let line = start.line; line <= last && line < lineCount; line++) {
            if (line >= 0) {
                chosen.add(line);
            }
        }
    }
    return [...chosen].sort((a, b) => a - b);
}
/** Plan minimal prefix edits; never rewrite whole lines or trim trailing text. */
function planToggle(lines, chosen) {
    const formats = (0, sourceFormat_1.classifySource)(lines);
    const selected = [...new Set(chosen)].filter(line => line >= 0 && line < lines.length);
    const free = selected.filter(line => formats[line].kind === 'free');
    const fixed = selected.filter(line => formats[line].kind === 'fixed');
    const protectedLines = selected.filter(line => formats[line].kind === 'protected');
    const notices = [];
    if (fixed.length) {
        if (free.length || protectedLines.length) {
            return { edits: [], delegate: false, notices: [
                    'Select fixed-format lines separately from free-format lines and protected directives/data. No changes made.'
                ] };
        }
        return { edits: [], delegate: true, notices };
    }
    if (protectedLines.length) {
        notices.push('Skipped protected lines: ' + protectedLines.map(line => `${line + 1} (${formats[line].reason})`).join(', '));
    }
    const candidates = free.map(line => {
        const source = lines[line];
        const format = formats[line];
        const first = format.left + /^ */.exec(source.slice(format.left))[0].length;
        return { line, source, format, first, commented: source.startsWith('//', first) };
    });
    const remove = candidates.length > 0 && candidates.every(item => item.commented);
    const edits = [];
    for (const item of candidates) {
        const { line, source, format, first, commented } = item;
        if (remove) {
            const width = source[first + 2] === ' ' ? 3 : 2;
            edits.push({ line, start: first, end: first + width, text: ' '.repeat(width) });
        }
        else if (!commented) {
            const consumed = Math.min(3, first - format.left);
            const shift = 3 - consumed;
            if (format.right !== undefined && shift > 0 && source.trimEnd().length + shift > format.right) {
                notices.push(`Skipped line ${line + 1}: adding a comment would shift text beyond column 80.`);
                continue;
            }
            edits.push({ line, start: first - consumed, end: first, text: '// ' });
        }
    }
    return { edits, delegate: false, notices };
}
/** Preserve selection direction and logical cursor locations after prefix edits. */
function mapPoint(point, edits) {
    const edit = edits.find(item => item.line === point.line);
    if (!edit || point.character <= edit.start) {
        return point;
    }
    const character = point.character >= edit.end
        ? point.character + edit.text.length - (edit.end - edit.start)
        : edit.start + Math.min(point.character - edit.start, edit.text.length);
    return { line: point.line, character };
}
//# sourceMappingURL=comments.js.map