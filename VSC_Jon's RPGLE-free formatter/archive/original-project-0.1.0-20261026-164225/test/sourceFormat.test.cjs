'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { classifySource } = require('../out/sourceFormat.js');
const { planToggle } = require('../out/comments.js');

test('**FREE must be the first line, column 1, with blank remainder (BOM accepted)', () => {
  assert.equal(classifySource(['**FrEe', 'x();'])[1].left, 0);
  assert.equal(classifySource(['\uFEFF**free', 'x();'])[1].left, 0);
  assert.equal(classifySource([' **free', '       x();'])[1].left, 7);
  assert.equal(classifySource(['', '**free', '       x();'])[2].left, 7);
  assert.equal(classifySource(['**free // not valid', '       x();'])[1].left, 7);
});

test('modern mixed source and legacy /FREE blocks use columns, not indentation guesses', () => {
  const result = classifySource([
    '     H option(*srcstmt)', '      /FREE', '       x = 1;',
    '      /END-FREE', '     C                   return', '12345  dcl-s x int(10);'
  ]);
  assert.deepEqual(result.map(line => line.kind), ['fixed', 'protected', 'free', 'protected', 'fixed', 'free']);
  assert.equal(result[5].left, 7);
  assert.equal(result[5].right, 80);
});

test('protect directives and all compile-time data, including fixed-looking data', () => {
  const result = classifySource(['**free', '/copy lib,member', '/if defined(X)',
    'x();', '/endif', '**CTDATA values', '     C data', 'x = 1;']);
  assert.deepEqual(result.map(line => line.kind),
    ['protected', 'protected', 'protected', 'free', 'protected', 'protected', 'protected', 'protected']);
  assert.equal(planToggle(['**free', '**', 'x();'], [2]).edits.length, 0);
});

test('/EOF conservatively protects the remaining source', () => {
  assert.deepEqual(classifySource(['      /EOF', '       x();']).map(line => line.kind), ['protected', 'protected']);
});

test('comments and literals containing slash sequences are not directives', () => {
  const result = classifySource(['**free', "  s = 'http://example';", '  // /COPY lib,member', "  s = 'it''s fine';"]);
  assert.deepEqual(result.slice(1).map(line => line.kind), ['free', 'free', 'free']);
});

test('protect both ends of a continued literal, then resume ordinary statements', () => {
  const result = classifySource(['**free', "  s = 'abc +", "       def';", '  x();']);
  assert.deepEqual(result.map(line => line.kind), ['protected', 'protected', 'protected', 'free']);
});

test('tabs in indentation and unknown column layouts are protected', () => {
  assert.equal(classifySource(['**free', '\tx();'])[1].kind, 'protected');
  assert.equal(classifySource(['     ? strange'])[0].kind, 'protected');
  assert.equal(classifySource(['\t      x();'])[0].kind, 'protected');
});

test('fixed-format star comments delegate rather than inventing a transformation', () => {
  assert.equal(planToggle(['     C* old fixed code'], [0]).delegate, true);
});