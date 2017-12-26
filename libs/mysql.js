var mysql = require('mysql');
var config = require('./config');
var pool = mysql.createPool({
    connectionLimit: 2,
    host: config.get('mysql:host'),
    port: config.get('mysql:port'),
    user: config.get('mysql:user'),
    password: config.get('mysql:password'),
    database: config.get('mysql:database')
});

module.exports = pool;

