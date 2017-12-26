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
      db.createTable.bind(db, 'groups', {
        columns: {
            id: {
                type: 'int',
                notNull: true,
                unsigned: true,
                primaryKey: true,
                autoIncrement: true
            },
            mnemo: {
                type: 'string',
                length: 100,
                unique: true
            },
            descr: {
                type: 'string',
                length: 255
            }
        },
        ifNotExists: true
      }),
      db.insert.bind(db, 'groups',
          ['id', 'mnemo', 'descr'], [1, 'master', 'System master']),
      db.insert.bind(db, 'groups',
          ['id', 'mnemo', 'descr'], [2, 'support', 'Support']),
      db.insert.bind(db, 'groups',
          ['id', 'mnemo', 'descr'], [3, 'user', 'User'])
  ], callback);
};

exports.down = function(db, callback) {
  async.series([
      db.dropTable.bind(db, 'groups')
  ], callback);
};

exports._meta = {
  "version": 1
};
