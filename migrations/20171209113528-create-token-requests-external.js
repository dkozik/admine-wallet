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
    console.log('Create table token-requests-external');
  async.series([
      db.createTable.bind(db, 'token-requests-external', {
          columns: {
              id: {
                  type: 'int',
                  notNull: true,
                  unsigned: true,
                  primaryKey: true,
                  autoIncrement: true
              },
              status: {
                  type: 'smallint',
                  length: 1,
                  defaultValue: 0
              },
              link_token_type: {
                  type: 'int',
                  unsigned: true,
                  notNull: true
              },
              ext_eth_address: {
                  type: 'string',
                  length: 100,
                  notNull: true
              },
              link_user_src: {
                  type: 'bigint',
                  notNull: true
              },
              link_user_manager: 'bigint',
              amount: {
                  type: 'string',
                  length: 30
              },
              reason: {
                  type: 'string',
                  length: 1024
              },
              date_create: 'datetime',
              date_update: 'datetime'
          },
          ifNotExists: true
      })
  ], callback);
};

exports.down = function(db, callback) {
    console.log('Drop token-requests-external');
  async.series([
      db.dropTable.bind(db, 'token-requests-external')
  ], callback);
};

exports._meta = {
  "version": 1
};
