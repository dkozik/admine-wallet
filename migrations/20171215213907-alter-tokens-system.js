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
      db.addColumn.bind(db, 'token-transfer-log', 'link_user_dest', {
          type: 'bigint',
          unsigned: true
      }),
      db.addColumn.bind(db, 'token-transfer-log', 'is_internal_addr', {
          type: 'smallint',
          defaultValue: 0
      }),
      db.addColumn.bind(db, 'token-types', 'is_contract', {
          type: 'smallint',
          defaultValue: 1
      }),
      db.insert.bind(db, 'token-types', ['id', 'mnemo', 'descr', 'percent', 'is_contract'], [7, 'externalTransfer', 'External tokens transfer', '0', 0]),
      db.insert.bind(db, 'token-types', ['id', 'mnemo', 'descr', 'percent', 'is_contract'], [8, 'internalTransfer', 'Internal tokens transfer', '0', 0]),
  ], callback);
};

exports.down = function(db, callback) {
  asunc.series([
      db.removeColumn.bind(db, 'token-transfer-log', 'link_user_dest'),
      db.removeColumn.bind(db, 'token-transfer-log', 'is_internal_addr'),
      db.removeColumn.bind(db, 'token-types', 'is_contract')
  ], callback);
};

exports._meta = {
  "version": 1
};
