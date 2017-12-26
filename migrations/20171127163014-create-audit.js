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
  console.log('Create table audit');
  async.series([
      db.createTable.bind(db, 'audit-type', {
          columns: {
              id: {
                  type: 'int',
                  primaryKey: true,
                  unsigned: true,
                  autoIncrement: true
              },
              mnemo: 'string',
              description: 'string'
          },
          ifNotExists: true
      }),
      db.insert.bind(db, 'audit-type', ['id', 'mnemo', 'description'],
          [1, 'login', 'User login action']),
      db.insert.bind(db, 'audit-type', ['id', 'mnemo', 'description'],
          [2, 'logout', 'User logout action']),
      db.insert.bind(db, 'audit-type', ['id', 'mnemo', 'description'],
          [3, 'update', 'User profile update']),
      db.insert.bind(db, 'audit-type', ['id', 'mnemo', 'description'],
          [4, 'other', 'Unclassified event']),
      db.createTable.bind(db, 'audit', {
          columns: {
              id: {
                  type: 'int',
                  primaryKey: true,
                  unsigned: true,
                  autoIncrement: true
              },
              link_user: 'bigint',
              link_audit_type: 'int',
              mnemo: 'string',
              description: 'string',
              date: 'datetime'
          },
          ifNotExists: true
      })
  ], callback);

};

exports.down = function(db, callback) {
  async.series([
      db.dropTable.bind(db, 'audit'),
      db.dropTable.bind(db, 'audit-type')
  ], callback);
};

exports._meta = {
  "version": 1
};
