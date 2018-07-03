'use strict';

const elasticsearch = require('elasticsearch');

// Declare internals
const internals = {};


exports.register = (server, options, next) => {

    const client = elasticsearch.Client(options);
    server.app.es = client;
    server.decorate('request', 'es', client);

    return next();
};


exports.register.attributes = {
    pkg: require('../package.json'),
    multiple: true
};