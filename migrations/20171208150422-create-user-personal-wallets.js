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
      db.createTable.bind(db, 'user-personal-wallets', {
          columns: {
              id: {
                  type: 'int',
                  primaryKey: true,
                  unsigned: true,
                  autoIncrement: true
              },
              status: {
                  type:'smallint',
                  length: 1
              },
              link_wallet_type: {
                  type: 'int',
                  unsigned: true
              },
              link_user: {
                  type: 'bigint',
                  unsigned: true,
                  notNull: true
              },
              addr: {
                  type: 'string',
                  length: 100,
                  notNull: true
              },
              amount: {
                  type: 'string',
                  length: 20
              },
              mcn_amount: {
                  type: 'string',
                  length: 10
              },
              date_create: 'datetime',
              date_update: 'datetime'
          },
          ifNotExists: true
      })
  ], callback);
};

exports.down = function(db, callback) {
  async.series([
      db.dropTable.bind(db, 'user-personal-wallets')
  ], callback);
};

exports._meta = {
  "version": 1
};
