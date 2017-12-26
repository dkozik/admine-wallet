'use strict';

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
    console.log('Create table user-wallet-history');
    return db.createTable('user-wallet-history', {
        columns: {
            id: {
                type: 'int',
                notNull: true,
                unsigned: true,
                primaryKey: true,
                autoIncrement: true
            },
            link_user_wallet: {
                type: 'int'/*,
                foreignKey: {
                    name: 'fk_user_wallet_history',
                    table: 'user-wallets',
                    rules: {
                        onDelete: 'CASCADE'
                    },
                    mapping: 'id'
                }*/
            },
            currency_type: {
                type: 'string',
                length: 5,
                notNull: true
            },
            amount: {
                type: 'string',
                length: 30
            },
            prev_balance: {
                type: 'string',
                length: 30
            },
            new_balance: {
                type: 'string',
                length: 30
            },
            date: {
                type: 'datetime',
                notNull: true
            }
        },
        ifNotExists: true
    }, callback);
};

exports.down = function(db, callback) {
    console.log('Drop table user-wallet-history');
    return db.dropTable('user-wallet-history', function() {
        console.log('Drop table user-wallet-type');
        return db.dropTable('user-wallet-type', callback);
    });
};

exports._meta = {
  "version": 1
};
