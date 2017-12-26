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
    // 1. Справочник типов кошелей: БТС, ЭФИР
    console.log('Create table user-wallet-type');
    return db.createTable('user-wallet-type', {
        columns: {
            id: {
                type: 'int',
                notNull: true,
                unsigned: true,
                primaryKey: true,
                autoIncrement: true
            },
            mnemo: 'string'
        },
        ifNotExists: true
    }, function() {
        console.log('Insert values to user-wallet-type');
        // Add default mnemo types
        return db.insert('user-wallet-type', ['id', 'mnemo'], [1, 'BTC'], function() {
            return db.insert('user-wallet-type', ['id', 'mnemo'], [2, 'ETH'], function() {
                // Create table user-wallets
                console.log('Create table user-wallets');
                return db.createTable('user-wallets', {
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
                            foreignKey: {
                                name: 'fk_user_wallets',
                                table: 'users',
                                rules: {
                                    onDelete: 'CASCADE'
                                },
                                mapping: 'id'
                            }
                        },
                        addr: {
                            type: 'string',
                            length: 100
                        },
                        link_wallet_type: {
                            type: 'int',
                            foreignKey: {
                                name: 'fk_wallet_type',
                                table: 'user-wallet-type',
                                rules: {
                                    onDelete: 'CASCADE'
                                },
                                mapping: 'id'
                            }
                        },
                        amount: {
                            type: 'string',
                            length: 30
                        },
                        mcn_amount: {
                            type: 'string',
                            length: 30
                        },
                        hash: {
                            type: 'string',
                            length: 25
                        },
                        create_date: {
                            type: 'datetime',
                            notNull: true
                        },
                        last_update_date: {
                            type: 'datetime',
                            notNull: true
                        }
                    },
                    ifNotExists: true
                }, callback);
            });
        });
    });

};

exports.down = function(db, callback) {
    console.log('Drop table user-wallets');
    return db.dropTable('user-wallets', callback);
};

exports._meta = {
  "version": 1
};
