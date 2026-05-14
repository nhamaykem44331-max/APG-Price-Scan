'use strict';

const { handleRequest } = require('../src/server');

module.exports = (req, res) => handleRequest(req, res);
