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
  console.log('Create table session');
  async.series([
      db.createTable.bind(db, 'session', {
          columns: {
              id: {
                  type: 'int',
                  primaryKey: true,
                  unsigned: true,
                  autoIncrement: true
              },
              link_user: 'bigint',
              hash: {
                  type: 'string',
                  length: 25
              },
              date: 'datetime'
          },
          ifNotExists: true
      }),
      db.addIndex.bind(db, 'session', 'session_hash', 'hash', true)
  ], callback);
};

exports.down = function(db, callback) {
    async.series([
        db.dropTable.bind(db, 'session')
    ]);
};

exports._meta = {
  "version": 1
};
