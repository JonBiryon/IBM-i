"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.selectedLines = selectedLines;
exports.planToggle = planToggle;
exports.mapPoint = mapPoint;
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
/** Toggle selected physical lines as text, independently of source syntax. */
function planToggle(lines, chosen) {
    const selected = [...new Set(chosen)].filter(line => line >= 0 && line < lines.length);
    const candidates = selected.map(line => {
        const source = lines[line];
        const first = /^ */.exec(source)[0].length;
        return { line, source, first, commented: source.startsWith('//', first) };
    });
    const remove = candidates.length > 0 && candidates.every(item => item.commented);
    const edits = [];
    for (const item of candidates) {
        const { line, source, first, commented } = item;
        if (remove) {
            const width = source[first + 2] === ' ' ? 3 : 2;
            edits.push({ line, start: first, end: first + width, text: ' '.repeat(width) });
        }
        else if (!commented) {
            const consumed = Math.min(3, first);
            edits.push({ line, start: first - consumed, end: first, text: '// ' });
        }
    }
    return { edits, delegate: false, notices: [] };
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