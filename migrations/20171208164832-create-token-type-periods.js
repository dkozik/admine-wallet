'use strict';
var async = require('async');
var dbm;
var type;
var seed;

/**
 * You first need to create a formatting function to pad numbers to two digits…
 **/
function twoDigits(d) {
    return ('0'+d.toString()).substr(-2);
}

/**
 * …and then create the method to output the date string as desired.
 * Some people hate using prototypes this way, but if you are going
 * to apply this to more than one Date object, having it as a prototype
 * makes sense.
 **/
Date.prototype.toMysqlFormat = function() {
    return this.getUTCFullYear() + "-" + twoDigits(1 + this.getUTCMonth()) + "-" + twoDigits(this.getUTCDate()) + " " + twoDigits(this.getUTCHours()) + ":" + twoDigits(this.getUTCMinutes()) + ":" + twoDigits(this.getUTCSeconds());
};

/**
  * We receive the dbmigrate dependency from dbmigrate initially.
  * This enables us to not have to rely on NODE_PATH.
  */
exports.setup = function(options, seedLink) {
  dbm = options.dbmigrate;
  type = dbm.dataType;
  seed = seedLink;
};

exports.up = function(db, callback) {
    async.series([
        db.createTable.bind(db, 'token-type-periods', {
            columns: {
                id: {
                    type: 'int',
                    primaryKey: true,
                    unsigned: true,
                    autoIncrement: true
                },
                link_token_type: {
                    type: 'int',
                    unsigned: true,
                    notNull: true
                },
                bonus_percent: 'int',
                date_start: 'date',
                date_end: 'date'
            },
            ifNotExists: true
        }),
        // Pre Sale
        // 1, 50, 18.12.2017, 18.12.2017
        // 1, 30, 19.12.2017, 20.12.2017
        // 1, 25, 21.12.2017, 19.01.2018
        // ICO
        // 2, 0,  01.03.2018, 01.04.2018
        db.insert.bind(db, 'token-type-periods', ['link_token_type', 'bonus_percent', 'date_start', 'date_end'],
            [1, 0, '2017-12-01', '2017-12-18']),
        db.insert.bind(db, 'token-type-periods', ['link_token_type', 'bonus_percent', 'date_start', 'date_end'],
            [1, 50, '2017-12-18', '2017-12-18']),
        db.insert.bind(db, 'token-type-periods', ['link_token_type', 'bonus_percent', 'date_start', 'date_end'],
            [1, 30, '2017-12-19', '2017-12-20']),
        db.insert.bind(db, 'token-type-periods', ['link_token_type', 'bonus_percent', 'date_start', 'date_end'],
            [1, 25, '2017-12-21', '2018-01-19']),
        db.insert.bind(db, 'token-type-periods', ['link_token_type', 'bonus_percent', 'date_start', 'date_end'],
            [2, 0,  '2018-01-20', '2018-04-20'])
    ], callback);
};

exports.down = function(db, callback) {
    async.series([
        db.dropTable.bind(db, 'token-type-periods')
    ], callback);
};

exports._meta = {
  "version": 1
};
