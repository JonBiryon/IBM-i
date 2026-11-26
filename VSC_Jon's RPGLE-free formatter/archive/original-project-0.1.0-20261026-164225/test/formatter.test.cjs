'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { formatSource } = require('../out/formatter.js');
function apply(lines, result = formatSource(lines)) {
  const output = [...lines];
  for (const edit of result.edits) {
    assert.equal(edit.start, 0);
    assert.match(lines[edit.line].slice(0, edit.end), /^ *$/);
    assert.match(edit.text, /^ *$/);
    output[edit.line] = edit.text + output[edit.line].slice(edit.end);
  }
  return output;
}
test('approved-style synthetic layout: nested declarations, loops, +1 and +3 wraps', () => {
  const input = ['**free', ' ctl-opt option(*nodebugio);', ' dcl-ds Request qualified;',
    'dcl-ds Items dim(2);', 'Value char(12);', 'end-ds;', ' end-ds;',
    '   // Fill the synthetic request:', 'for i = 1 to 2;',
    ' Request.Items(i).Value =', " 'synthetic';", 'endfor;',
    'if ok', ' and ready;', " snd-msg *info 'Value: ' +", '%trim(value);',
    'else;', "snd-msg *info 'Not ready';", 'endif;', '*inlr = *on;'];
  const expected = ['**free', '   ctl-opt option(*nodebugio);', '   dcl-ds Request qualified;',
    '      dcl-ds Items dim(2);', '         Value char(12);', '      end-ds;', '   end-ds;',
    '  // Fill the synthetic request:', '   for i = 1 to 2;',
    '      Request.Items(i).Value =', "         'synthetic';", '   endfor;',
    '   if ok', '    and ready;', "      snd-msg *info 'Value: ' +", '       %trim(value);',
    '   else;', "      snd-msg *info 'Not ready';", '   endif;', '   *inlr = *on;'];
  assert.deepEqual(apply(input), expected);
  assert.deepEqual(formatSource(expected), { edits: [], notices: [] });
  assert.deepEqual(input.map(line => line.trimStart()), expected.map(line => line.trimStart()));
});
test('procedures, PI, subroutines, monitors and select branch alignment', () => {
  const source = ['**FREE', 'begsr $Test;', 'monitor;', 'select;', 'when ok;',
    'work();', 'other;', 'stop();', 'endsl;', "on-excp 'CPF0000';", 'recover();',
    'on-error;', 'recover();', 'endmon;', 'endsr;', 'dcl-proc $Run;', 'dcl-pi *n;',
    'arg int(10);', 'end-pi;', 'return;', 'end-proc;'];
  const output = apply(source);
  assert.equal(output[4], '         when ok;');
  assert.equal(output[5], '            work();');
  assert.equal(output[9], "      on-excp 'CPF0000';");
  assert.equal(output[16], '      dcl-pi *n;');
  assert.equal(output[17], '         arg int(10);');
  assert.deepEqual(formatSource(output).edits, []);
});
test('preserve Hebrew, literal escapes, comment delimiters and trailing blanks', () => {
  const input = ['**free', "s = 'בדיקה // it''s safe;';  ", '// neutralised();',
    '/// ===== separator ===== \\\\', 'x = 1; // ; if enddo'];
  const output = apply(input);
  assert.equal(output[1], '   ' + input[1]);
  assert.equal(output[2], input[2]);
  assert.equal(output[3], input[3]);
  assert.equal(output[4], '   ' + input[4]);
});
test('continued literals preserve every participating line including leading literal spaces', () => {
  const input = ['**free', " s = 'abc +", "            def';", 'x = 1;'];
  const output = apply(input);
  assert.equal(output[1], input[1]); assert.equal(output[2], input[2]);
  assert.equal(output[3], '   x = 1;');
  assert.deepEqual(formatSource(output).edits, []);
});
test('protect program data and /EOF remainder including misleading block tokens', () => {
  for (const marker of ['**CTDATA values', '/EOF']) {
    const input = ['**free', 'x = 1;', marker, 'if;', '  literal data'];
    const output = apply(input);
    assert.deepEqual(output.slice(2), input.slice(2));
    assert.equal(output[1], '   x = 1;');
  }
});
test('calls use +3 arguments with own closing delimiter aligned to statement', () => {
  const input = ['**free', 'Run(', 'first:', 'second', ');'];
  assert.deepEqual(apply(input), ['**free', '   Run(', '      first:', '      second', '   );']);
});
test('assignments to operation-like identifiers do not open blocks', () => {
  assert.deepEqual(apply(['**free', 'if = 1;', 'select = 2;']), ['**free', '   if = 1;', '   select = 2;']);
});
test('parenthesised conditions are not assignment targets', () => {
  const source = ['**free', 'if (a) = b;', 'work();', 'elseif (c) = d;', 'fallbackWork();', 'endif;'];
  const output = apply(source);
  assert.equal(output[1], '   if (a) = b;');
  assert.equal(output[2], '      work();');
  assert.equal(output[3], '   elseif (c) = d;');
  assert.deepEqual(formatSource(output).notices, []);
  assert.deepEqual(formatSource(output).edits, []);
  assert.deepEqual(output.map(line => line.trimStart()), source.map(line => line.trimStart()));
});
test('normal identifiers do not inherit JavaScript keyword-table properties or opcode prefixes', () => {
  const source = ['**free', 'caseNumber = 1;', 'cashTotal = 0;', 'constructor();', 'toString();'];
  assert.deepEqual(apply(source).slice(1), source.slice(1).map(line => '   ' + line));
  assert.deepEqual(formatSource(source).notices, []);
  assert.deepEqual(formatSource(apply(source)).edits, []);
});
test('single-statement data structures and empty inline declarations do not open blocks', () => {
  const source = ['**free', 'dcl-ds Copy likeds(Base);', 'dcl-ds Row likerec(Format:*input);',
    'dcl-ds Buffer len(100) end-ds ;', 'dcl-pr Run end-pr;', 'dcl-pi *n end-pi;', 'work();'];
  assert.deepEqual(apply(source).slice(1), source.slice(1).map(line => '   ' + line));
  assert.deepEqual(formatSource(source).notices, []);
  assert.deepEqual(formatSource(apply(source)).edits, []);
});
test('comments inside a wrapped statement are preserved rather than moved to the next statement', () => {
  const input = ['**free', 'Run(', ' // Explanation within argument list', 'arg', ');', 'next();'];
  const output = apply(input);
  assert.equal(output[2], input[2]);
  assert.deepEqual(formatSource(output).edits, []);
});
test('commented-out code with its own trailing comment keeps its prefix', () => {
  const input = ['**free', ' // dcl-s old int(10); // reference only', 'x();'];
  assert.equal(apply(input)[1], input[1]);
});
test('unsupported and malformed source is rejected atomically with notices', () => {
  const cases = [ ['       x = 1;'], ['**free', 'x();', '/if defined(X)', 'y();', '/endif'],
    ['**free', '/copy other'], ['**free', 'if ok;', 'x();'], ['**free', 'endif;'],
    ['**free', 'x(); y();'], ['**free', 'exec sql select * from TEST;'],
    ['**free', '\tx();'], ['**free', "s = 'unterminated"], ['**free', 'x()'],
    ['**free', 'Run(arg;'], ['**free', 'Run arg);'], ['**free', 'Run(', '**CTDATA x'] ];
  for (const input of cases) {
    const result = formatSource(input);
    assert.deepEqual(result.edits, [], input.join('\n'));
    assert.ok(result.notices.length);
  }
});