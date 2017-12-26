'use strict';

var async = require('async');
var dbm;
var type;
var seed;

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
      db.createTable.bind(db, 'transaction-error-log', {
          columns: {
              id: {
                  type: 'int',
                  notNull: true,
                  unsigned: true,
                  primaryKey: true,
                  autoIncrement: true
              },
              link_token_type: {
                  type: 'int',
                  unsigned: true,
                  notNull: true
              },
              addr: {
                  type: 'string',
                  length: 100
              },
              amount: {
                  type: 'string',
                  length: 30
              },
              error_text: {
                  type: 'string',
                  length: 2048
              },
              date: 'datetime'
          },
          ifNotExists: true
      })
  ], callback);
};

exports.down = function(db, callback) {
  async.series([
      db.dropTable.bind(db, 'transaction-error-log')
  ], callback);
};

exports._meta = {
  "version": 1
};
