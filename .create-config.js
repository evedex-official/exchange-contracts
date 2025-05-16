'use strict';

const fs = require('node:fs');
fs.existsSync('config.js') || fs.createReadStream('config.example.js').pipe(fs.createWriteStream('config.js'));
