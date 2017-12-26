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
        db.createTable.bind(db, 'users', {
            columns: {
                id: {
                    type: 'bigint',
                    length: 20,
                    notNull: true,
                    unsigned:true,
                    primaryKey: true,
                    autoIncrement: true
                },
                login: {
                    type:'string',
                    length: 40
                },
                is_active: {
                    type: 'smallint',
                    length: 1
                },
                n_first: 'string',
                n_middle: 'string',
                n_last: 'string',
                email: {
                    type: 'string',
                    length: 60
                },
                register_hash: { type: 'string', length: '50' },
                confirm_hash: { type: 'string', length: '50' },
                remove_hash: { type: 'string', length: '50' },
                last_login_date: 'datetime'
            },
            ifNotExists: true

        }),
        db.addIndex.bind(db, 'users', 'users_login', 'login', true),
        db.addIndex.bind(db, 'users', 'users_email', 'email', true),
        db.insert.bind(db, 'users',
            ['id', 'login', 'is_active', 'email', 'last_login_date'],
            [1, 'root', 1, 'admin@admine.io', null])
    ], callback);
  };

exports.down = function(db, callback) {
    async.series([
        db.removeIndex.bind(db, 'users_login'),
        db.removeIndex.bind(db, 'users_email'),
        db.dropTable.bind(db, 'users')
    ], callback);
};

exports._meta = {
  "version": 1
};
