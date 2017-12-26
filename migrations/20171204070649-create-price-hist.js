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
    var mDate = new Date(Date.now());
  async.series([
      db.createTable.bind(db, 'price-hist', {
          columns: {
              id: {
                  type: 'int',
                  notNull: true,
                  unsigned: true,
                  primaryKey: true,
                  autoIncrement: true
              },
              date: {
                  type: 'datetime',
                  notNull: true
              },
              currency_type: {
                  type: 'string',
                  notNull: true
              },
              price: {
                  type: 'string',
                  length: 25,
                  notNull: true
              }
          },
          ifNotExists: true
      }),
      db.insert.bind(db, 'price-hist', ['date', 'currency_type', 'price'], [mDate.toMysqlFormat(), 'ETH', '100']),
      db.insert.bind(db, 'price-hist', ['date', 'currency_type', 'price'], [mDate.toMysqlFormat(), 'BTC', '2454.409346390791'])
  ], callback);
};

exports.down = function(db, callback) {
  async.series([
      db.dropTable.bind(db, 'proce-hist')
  ], callback);
};

exports._meta = {
  "version": 1
};
