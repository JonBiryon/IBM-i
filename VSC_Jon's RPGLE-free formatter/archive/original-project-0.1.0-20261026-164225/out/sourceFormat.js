"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.classifySource = classifySource;
/** Find an unterminated quoted literal, ignoring doubled quotes and // comments. */
function endingQuote(text, initial) {
    let quote = initial;
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (quote) {
            if (char === quote) {
                if (text[i + 1] === quote) {
                    i++;
                }
                else {
                    quote = '';
                }
            }
        }
        else if (char === '/' && text[i + 1] === '/') {
            break;
        }
        else if (char === "'" || char === '"') {
            quote = char;
        }
    }
    return quote;
}
/**
 * Local lexical classification, not an RPG compiler/preprocessor. Columns 6-7
 * distinguish modern column-limited free lines, including legacy /FREE blocks.
 * Directives are protected, not evaluated; copy members are never fetched.
 */
function classifySource(lines) {
    const fullyFree = /^\uFEFF?\*\*FREE *$/i.test(lines[0] ?? '');
    const left = fullyFree ? 0 : 7;
    const right = fullyFree ? undefined : 80;
    let data = false;
    let quote = '';
    return lines.map((raw, index) => {
        const text = index === 0 ? raw.replace(/^\uFEFF/, '') : raw;
        const protect = (reason) => ({ kind: 'protected', left, right, reason });
        if (index === 0 && fullyFree) {
            return protect('source-format directive');
        }
        if (/^\*\*/.test(text)) {
            data = true;
        }
        if (data) {
            return protect('program data or text after /EOF');
        }
        const field = fullyFree ? text : text.slice(5);
        // A directive has a single initial slash; // is a normal comment.
        if (/^\s*\/(?!\/)/.test(field)) {
            if (/^\s*\/EOF\b/i.test(field)) {
                data = true;
            }
            return protect('compiler directive');
        }
        if (/^\s*$/.test(field)) {
            return quote ? protect('continued literal') : { kind: 'blank', left, right };
        }
        if (/^\s*\*\*FREE\b/i.test(text)) {
            return protect('misplaced source-format directive');
        }
        if (!fullyFree && (text[6] === '*' || /^[HFDICOP]$/i.test(text[5] ?? ''))) {
            return { kind: 'fixed', left, right };
        }
        if (!fullyFree && text.slice(5, 7) !== '  ') {
            return protect('unrecognised column-limited layout');
        }
        const content = text.slice(left);
        if (/^[ \t]*\t/.test(content) || (!fullyFree && text.slice(0, 7).includes('\t'))) {
            return protect('tab indentation has ambiguous source columns');
        }
        const wasQuoted = quote !== '';
        quote = endingQuote(content, quote);
        if (wasQuoted || quote) {
            return protect('continued or unterminated literal');
        }
        return { kind: 'free', left, right };
    });
}
//# sourceMappingURL=sourceFormat.js.map