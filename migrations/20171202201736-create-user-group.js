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
    console.log('Create table user-group');
    async.series([
        db.createTable.bind(db, 'user-group', {
            columns: {
                id: {
                    type: 'int',
                    notNull: true,
                    unsigned: true,
                    primaryKey: true,
                    autoIncrement: true
                },
                link_user: {
                    type: 'bigint',
                    notNull: true
                },
                link_group: {
                    type: 'int',
                    notNull: true
                }
            },
            ifNotExists: true
        }),
        db.insert.bind(db, 'user-group', ['link_user', 'link_group'], [1, 1])
    ], callback);
};

exports.down = function(db, callback) {
    console.log('Drop table user-group');
    async.series([
        db.dropTable.bind(db, 'user-group')
    ], callback);
};

exports._meta = {
  "version": 1
};
