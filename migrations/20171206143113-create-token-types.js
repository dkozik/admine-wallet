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
        db.createTable.bind(db, 'token-types', {
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
                    length: 50,
                    notNull: true
                },
                descr: {
                    type: 'string',
                    length: 50,
                    notNull: true
                },
                percent: {
                    type: 'string',
                    length: 3
                }
            },
            ifNotExists: true
        }),
        db.insert.bind(db, 'token-types', ['id', 'mnemo', 'descr', 'percent'], [1, 'preSaleTokens', 'Pre Sale tokens', '5']),
        db.insert.bind(db, 'token-types', ['id', 'mnemo', 'descr', 'percent'], [2, 'ICOTokens', 'ICO Tokens', '60']),
        db.insert.bind(db, 'token-types', ['id', 'mnemo', 'descr', 'percent'], [3, 'advisorTokens', 'Advisor tokens', '6']),
        db.insert.bind(db, 'token-types', ['id', 'mnemo', 'descr', 'percent'], [4, 'auditTokens', 'Audit tokens', '2']),
        db.insert.bind(db, 'token-types', ['id', 'mnemo', 'descr', 'percent'], [5, 'bountyTokens', 'Bounty tokens', '2']),
        db.insert.bind(db, 'token-types', ['id', 'mnemo', 'descr', 'percent'], [6, 'usersPoolTokens', 'AdMine user growth pool', '10'])
    ], callback);
};

exports.down = function(db, callback) {
  async.series([
      db.dropTable.bind(db, 'token-types')
  ], callback);
};

exports._meta = {
  "version": 1
};
