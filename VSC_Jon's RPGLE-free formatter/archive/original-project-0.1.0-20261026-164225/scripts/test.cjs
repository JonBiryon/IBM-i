'use strict';
const fs = require('node:fs');
const path = require('node:path');
const directory = path.resolve(__dirname, '..', 'test');
for (const file of fs.readdirSync(directory).filter(file => file.endsWith('.test.cjs')).sort()) {
  require(path.join(directory, file));
}