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
    console.log('Create table email-queue');
    async.series([
        db.createTable.bind(db, 'email-queue', {
            columns: {
                id: {
                    type: 'int',
                    primaryKey: true,
                    unsigned: true,
                    autoIncrement: true
                },
                status: {
                    type: 'smallint',
                    notNull: true
                },
                to: {
                    type: 'string',
                    length: 50
                },
                subject: {
                    type: 'string',
                    length: 100
                },
                template: {
                    type: 'string',
                    length: '60'
                },
                params: {
                    type: 'string',
                    length: 1024
                },
                date: 'datetime'
            },
            ifNotExists: true
        })
    ], callback);
};

exports.down = function(db, callback) {
    console.log('Drop table email-queue');
    async.series([
        db.dropTable.bind(db, 'email-queue')
    ], callback);
};

exports._meta = {
  "version": 1
};
