'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { planToggle, selectedLines, mapPoint } = require('../out/comments.js');

function apply(lines, edits) {
  const result = [...lines];
  for (const edit of edits) {
    const line = result[edit.line];
    result[edit.line] = line.slice(0, edit.start) + edit.text + line.slice(edit.end);
  }
  return result;
}

for (const indentation of [0, 1, 2, 3, 4, 12]) {
  test(`fully free consumes ${indentation} indentation spaces with minimal shifting`, () => {
    const lines = ['**free', ' '.repeat(indentation) + 'value = 1;'];
    const plan = planToggle(lines, [1]);
    assert.equal(plan.delegate, false);
    assert.deepEqual(plan.notices, []);
    const result = apply(lines, plan.edits);
    assert.equal(result[1], ' '.repeat(Math.max(0, indentation - 3)) + '// value = 1;');
    assert.equal(result[1].indexOf('value'), Math.max(indentation, 3));
  });
}

for (const indentation of [0, 1, 2, 3, 9]) {
  test(`column-limited consumes ${indentation} usable spaces and preserves columns 1-7`, () => {
    const prefix = '12345  ';
    const lines = [prefix + ' '.repeat(indentation) + 'value = 1;'];
    const result = apply(lines, planToggle(lines, [0]).edits);
    assert.equal(result[0], prefix + ' '.repeat(Math.max(0, indentation - 3)) + '// value = 1;');
    assert.equal(result[0].slice(0, 7), prefix);
  });
}

test('uncomment replaces marker with spaces; text and trailing blanks stay in their columns', () => {
  const lines = ['**free', '  // code();  ', '  //other();'];
  assert.deepEqual(apply(lines, planToggle(lines, [1, 2]).edits),
    ['**free', '     code();  ', '    other();']);
});

test('mixed comments and code only comment previously uncommented lines', () => {
  const lines = ['**free', '  // old', '  code();', '', '   '];
  const plan = planToggle(lines, [0, 1, 2, 3, 4]);
  assert.equal(plan.edits.length, 1);
  assert.equal(apply(lines, plan.edits)[1], lines[1]);
  assert.equal(apply(lines, plan.edits)[2], '// code();');
  assert.match(plan.notices[0], /source-format directive/);
});

test('toggle preserves current code column rather than guessing original short indentation', () => {
  const lines = ['**free', '  code();'];
  const commented = apply(lines, planToggle(lines, [1]).edits);
  const uncommented = apply(commented, planToggle(commented, [1]).edits);
  assert.equal(uncommented[1], '   code();');
});

test('reject rightward shift beyond column 80 without truncation', () => {
  const lines = ['       ' + 'x'.repeat(71)];
  const plan = planToggle(lines, [0]);
  assert.deepEqual(plan.edits, []);
  assert.match(plan.notices[0], /column 80/);
  assert.equal(lines[0].length, 78);
});

test('allow shift ending exactly at column 80', () => {
  const lines = ['       ' + 'x'.repeat(70)];
  const plan = planToggle(lines, [0]);
  assert.equal(apply(lines, plan.edits)[0].length, 80);
  assert.deepEqual(plan.notices, []);
});

test('zero-shift edit preserves existing text and comments beyond column 80', () => {
  const line = '          ' + 'x'.repeat(60) + '; // comment beyond column eighty';
  const plan = planToggle([line], [0]);
  const result = apply([line], plan.edits)[0];
  assert.equal(result.length, line.length);
  assert.equal(result.slice(10), line.slice(10));
});

test('fully free has no column 80 limit', () => {
  const lines = ['**free', 'x'.repeat(140)];
  assert.equal(apply(lines, planToggle(lines, [1]).edits)[1].length, 143);
});

test('fixed-only delegates; mixed fixed/free refuses atomically', () => {
  const lines = ['     C                   eval      x = 1', '       x = 1;'];
  assert.equal(planToggle(lines, [0]).delegate, true);
  const mixed = planToggle(lines, [0, 1]);
  assert.equal(mixed.delegate, false);
  assert.deepEqual(mixed.edits, []);
  assert.match(mixed.notices[0], /separately/);
});

test('fixed plus protected directives does not delegate through protected text', () => {
  const plan = planToggle(['     C                   return', '      /COPY other'], [0, 1]);
  assert.equal(plan.delegate, false);
  assert.deepEqual(plan.edits, []);
});

test('deduplicate overlapping selections and omit final line at column zero', () => {
  assert.deepEqual(selectedLines([
    { start: { line: 1, character: 3 }, end: { line: 4, character: 0 } },
    { start: { line: 2, character: 0 }, end: { line: 2, character: 0 } },
    { start: { line: 5, character: 0 }, end: { line: 5, character: 0 } }
  ], 6), [1, 2, 3, 5]);
  assert.equal(planToggle(['**free', '  x();'], [1, 1]).edits.length, 1);
});

test('map cursors for inserted, consumed and replaced indentation', () => {
  const edit = { line: 1, start: 0, end: 2, text: '// ' };
  assert.deepEqual(mapPoint({ line: 1, character: 8 }, [edit]), { line: 1, character: 9 });
  assert.deepEqual(mapPoint({ line: 1, character: 0 }, [edit]), { line: 1, character: 0 });
  assert.deepEqual(mapPoint({ line: 2, character: 8 }, [edit]), { line: 2, character: 8 });
});

test('comment formula holds across a range of indentation values', () => {
  for (let indent = 0; indent < 50; indent++) {
    for (const left of [0, 7]) {
      const prefix = ' '.repeat(left + indent);
      const lines = left ? [prefix + 'x();'] : ['**free', prefix + 'x();'];
      const index = left ? 0 : 1;
      const output = apply(lines, planToggle(lines, [index]).edits)[index];
      assert.equal(output.indexOf('x'), left + Math.max(indent, 3));
      assert.equal(output.slice(output.indexOf('x')), 'x();');
    }
  }
});