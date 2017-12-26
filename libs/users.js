var mysql = require('./mysql');
var util = require('./util');
var log = require('./log')(module);

function listUsers( callback ) {
    mysql.query(
        "SELECT " +
            "u.id, u.is_active, u.login, u.email, DATE_FORMAT(u.last_login_date, '%Y-%m-%d %H:%i') as last_login_date, " +
            "u.n_first, u.n_middle, u.n_last, wallet.amount, wallet.mcn_amount, g.mnemo as role, " +
            "DATE_FORMAT(u.date_create, '%Y-%m-%d %H:%i') as date_create " +
        "FROM " +
            "users u, `user-wallets` wallet, `user-group` grp, groups g " +
        "WHERE " +
            "wallet.link_user=u.id AND " +
            "g.id = grp.link_group AND " +
            "grp.link_user = u.id AND " +
            "wallet.link_wallet_type = 2", [], function(error, results, fields) {
        if (error) {
            log.error(error);
            return callback(false, error);
        }

        callback(true, results);
    });
}

module.exports = {
    listUsers: listUsers,
    getUserPersonaWallet: function( userId, callback ) {
        mysql.query(
            "SELECT " +
                "id, addr " +
            "FROM " +
                "`user-personal-wallets` " +
            "WHERE " +
                "link_user=? AND link_wallet_type=2 AND status = 1", [ userId ],
            function(error, results, fields) {
                if (error) {
                    log.error(error);
                    return callback(false, error.sqlMessage);
                }

                return callback(true, results);
            });
    },
    getUserSystemETHWallet: function( userId, callback, param ) {
        mysql.query(
            "SELECT " +
                "addr " +
            "FROM " +
                "`user-wallets` " +
            "WHERE " +
                "link_user=? AND link_wallet_type=2", [userId],
            function(error, results, fields) {
                if (error) {
                    log.error(error);
                    return callback(false, error.sqlMessage);
                }

                if (results.length<=0) {
                    log.error("User "+userId+" does not have system ETH wallet, all financial operations denied.");
                    return callback(false, "User does not have system ETH wallet");
                }

                callback(true, results[0].addr, param);
            });
    },
    getUserMCNAmountWallet: function( userId, callback ) {
        this.getUserPersonaWallet(userId, function( success, result ) {
            if (!success) return callback(false, result);

            if (false && result.length>0) {
                var addr = result[0].addr;
                if (util.isEthAddressCorrect(addr)) {
                    return callback(true, addr, 'personal');
                } else {
                    log.error("User ["+userId+"] personal wallet addr ["+addr+"] is incorrect! Using default ETH wallet address!");
                }
            }

            this.getUserSystemETHWallet(userId, callback, 'system');
        }.bind(this))
    },
    checkUserWallet: function( userId, addr, callback ) {
        mysql.query(
            "SELECT " +
                "addr " +
            "FROM " +
                "`user-wallets` " +
            "WHERE " +
                "link_user=? AND addr=?", [userId, addr],
            function(error, results, fields) {
                if (error) {
                    log.error(error);
                    return callback(false, error.sqlMessage);
                }

                if (results.length<=0) {
                    log.error("User "+userId+" does not have ETH wallet ["+addr+"]");
                    return callback(false, "ETH wallet addres invalid");
                }

                callback(true, results[0].addr);
            });
    },
    updateUserPassword: function( userId, newPassword, callback ) {
        mysql.query(
            "UPDATE " +
                "`user-password` p " +
            "SET " +
                "p.type = 0 " +
            "WHERE link_user=?", [userId], function( error, results, fields ) {
                if (error) {
                    log.error("Error update user old password state: ", error);
                    return callback(false, error.sqlMessage);
                }

                var passwordHash = util.passwordHash(newPassword);

                mysql.query(
                    "INSERT INTO " +
                        "`user-password` (link_user, hash, type, date) " +
                    "VALUES (?,?,1,now())", [userId, passwordHash], function(error, results, fields) {
                        if (error) {
                            log.error("Error insert new password: ", error);
                            return callback(false, error.sqlMessage);
                        }

                        callback(true);
                    });
            });
    },
    updateUserData: function( userId, params, callback ) {
        if (params.n_first || params.n_middle || params.n_last) {
            mysql.query("UPDATE users SET n_first=?, n_middle=?, n_last=? WHERE id=?", [
                params.n_first, params.n_middle, params.n_last, userId],
                function(error, results, fields) {
                    if (error) {
                        log.error("Error update user profile: ", error);
                        return callback(false, error.sqlMessage);
                    }

                    if (!params.password) {
                        return callback(true);
                    }

                    this.updateUserPassword(userId, params.password, function( success, result ) {
                        if (!success) {
                            log.error("Error update user profile: ", error);
                            return callback(false, error.sqlMessage);
                        }

                        callback(true);
                    });

                }.bind(this));
        } else {
            callback(true);
        }
    }
};