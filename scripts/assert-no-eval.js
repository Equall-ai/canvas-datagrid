#!/usr/bin/env node
/**
 * Build guard: the published bundles must not compile strings into JavaScript.
 *
 * Apps that serve canvas-table under a Content-Security-Policy without
 * 'unsafe-eval' (e.g. `script-src 'self' <hash> <nonce>`) get an EvalError the
 * moment such a construct runs.  A grid is built by attaching methods onto one
 * object, module by module, so a throw part-way through leaves a half-built
 * grid: a blank canvas and "getGrid()?.draw is not a function".
 *
 * Scans the bundles consumers actually load (package.json "main" and
 * "module").  Both are minified with comments stripped, so a plain text scan
 * cannot be fooled by the word "eval" appearing in a comment.  The debug
 * bundle keeps comments and is intentionally not scanned.
 *
 * Run automatically by `postbuild`; also available as `npm run assert-no-eval`.
 */
'use strict';

var fs = require('fs');
var path = require('path');

var DIST = path.join(__dirname, '..', 'dist');

// package.json "main" and "module" entry points.
var TARGETS = ['canvas-datagrid.js', 'canvas-datagrid.module.js'];

var FORBIDDEN = [
  { name: 'eval()', re: /\beval\s*\(/g },
  { name: 'new Function()', re: /\bnew\s+Function\s*\(/g },
  // Bare `Function(` call; the lookbehind excludes member calls such as
  // `col.sortFunction(...)` and identifiers merely ending in "Function".
  { name: 'Function() constructor', re: /(?<![.\w$])Function\s*\(/g },
  { name: 'setTimeout("string")', re: /\bsetTimeout\s*\(\s*['"`]/g },
  { name: 'setInterval("string")', re: /\bsetInterval\s*\(\s*['"`]/g },
];

function lineOf(source, index) {
  return source.slice(0, index).split('\n').length;
}

function excerpt(source, index) {
  return source
    .slice(Math.max(0, index - 60), index + 60)
    .replace(/\s+/g, ' ');
}

var violations = [];

TARGETS.forEach(function (file) {
  var fullPath = path.join(DIST, file);
  if (!fs.existsSync(fullPath)) {
    console.error(
      'assert-no-eval: missing dist/' + file + '. Run the build first.',
    );
    process.exit(1);
  }
  var source = fs.readFileSync(fullPath, 'utf8');
  FORBIDDEN.forEach(function (rule) {
    var re = new RegExp(rule.re.source, 'g');
    var match;
    while ((match = re.exec(source)) !== null) {
      violations.push({
        file: file,
        rule: rule.name,
        line: lineOf(source, match.index),
        excerpt: excerpt(source, match.index),
      });
    }
  });
});

if (violations.length > 0) {
  console.error(
    '\nassert-no-eval: found ' +
      violations.length +
      ' string-compilation construct(s) in dist/.',
  );
  console.error("These break any consumer whose CSP lacks 'unsafe-eval'.\n");
  violations.forEach(function (v) {
    console.error('  ' + v.file + ':' + v.line + '  ' + v.rule);
    console.error('    ...' + v.excerpt + '...\n');
  });
  process.exit(1);
}

console.log(
  'assert-no-eval: OK - no eval/Function constructs in ' +
    TARGETS.join(', ') +
    '.',
);
