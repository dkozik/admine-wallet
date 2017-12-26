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
  console.log('Create table token-transfer-log');
  async.series([
      db.createTable.bind(db, 'token-transfer-log', {
          columns: {
              id: {
                  type: 'int',
                  primaryKey: true,
                  unsigned: true,
                  autoIncrement: true
              },
              link_user_sender: {
                  type:'bigint',
                  unsigned: true,
                  notNull: true,
                  comment: 'Tokens sender'
              },
              token_type: {
                  type: 'int',
                  unsigned: true,
                  notNull: true,
                  comment: 'Token type id'
              },
              eth_addr: {
                  type: 'string',
                  length: 50,
                  comment: 'Wallet address'
              },
              amount: {
                  type: 'string',
                  length: 30,
                  comment: 'Amount value'
              },
              descr: {
                  type: 'string',
                  length: 1024,
                  comment: 'Tokens transfer comment'
              },
              date: {
                  type: 'datetime',
                  notNull: true,
                  comment: 'Transaction date'
              }
          },
          ifNotExists: true
      })
  ], callback);
};

exports.down = function(db, callback) {
  async.series([
      db.dropTable.bind(db, 'token-transfer-log')
  ], callback);
};

exports._meta = {
  "version": 1
};
