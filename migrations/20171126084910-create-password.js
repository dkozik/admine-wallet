'use strict';
var crypto = require('crypto');
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
    console.log('Create table user-password');
    async.series([
        db.createTable.bind(db, 'user-password', {
            columns: {
                id: {
                    type: 'int',
                    primaryKey: true,
                    unsigned: true,
                    autoIncrement: true
                },
                link_user: {
                    type: 'bigint'
                },
                hash: 'string',
                type: {
                    type: 'smallint',
                    length: 1
                }
            },
            ifNotExists: true
        }),
//        db.addForeignKey.bind(db, 'user-password', 'users', 'fk_user_passwords',{
//                link_user: 'id'
//            },
//            {
//                onDelete: 'CASCADE',
//                onUpdate: 'RESTRICT'
//            }),
        db.insert.bind(db, 'user-password',
            ['link_user', 'hash', 'type'],
            [1, crypto.createHash('md5').update("8Kwm877").digest("hex"), 1])
    ], callback);
};

exports.down = function(db, callback) {
    console.log('Drop table password');
    return db.dropTable('user-password', callback);
};

exports._meta = {
  "version": 1
};
