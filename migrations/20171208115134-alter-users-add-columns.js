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
      db.addColumn.bind(db, 'users', 'date_create', {
          type: 'datetime'
      }),
      db.addColumn.bind(db, 'users', 'date_update', {
          type: 'datetime'
      })
  ], callback);
};

exports.down = function(db, callback) {
  async.series([
      db.removeColumn.bind(db, 'users', 'create_date'),
      db.removeColumn.bind(db, 'users', 'date_create'),
  ], callback);
};

exports._meta = {
  "version": 1
};
