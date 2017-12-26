var mysql = require('./mysql');
var log = require('./log')(module);
var crypto = require('crypto');
var wallet = require('./wallet');
var util = require('./util');
var mail = require('./mail');
var config = require('./config');
var audit = require('./audit');
var libUsers = require('./users');

var groupCodes = {};
var groups = {};
var users = {};
var totalUsersCount = 0;
var registerConfirmUrl = config.get('urls:account-confirm');
var restoreAccountUrl = config.get('urls:account-restore');
var supportEmail = config.get('email:support-email');
var emailConfirmation = config.get('email-confirm')==true;

function User( userId ) {

    var myGroups = {};
    var accessLevel = 0;

    return {
        userLoggedIn: function( sessionId, callback ) {
            mysql.query(
                "SELECT " +
                    "ug.link_group, g.mnemo " +
                "FROM " +
                    "`user-group` ug, groups g " +
                "WHERE g.id = ug.link_group AND ug.link_user=?", [userId], function(error, results, fields) {
                    if (error) {
                        log.error(error);
                        return callback(false, error);
                    }

                    myGroups = {};

                    for (var i=0; i<results.length; i++) {
                        var row = results[i];
                        myGroups[groups[row.link_group]]=true;
                        var g = row.mnemo;
                        if (g=='support' && accessLevel<1) {
                            accessLevel = 1;
                        } else if (g=='master' && accessLevel<2) {
                            accessLevel = 2;
                        }
                    }

                    mysql.query("UPDATE users SET last_login_date = now() WHERE id=?", [userId], function(error, results, fields) {
                        if (error) {
                            log.error(error);
                            return callback(false, error);
                        }

                        log.info("User "+userId+" logged in, accessLevel: "+accessLevel);

                        callback(true);

                    });

                });
        },
        userInGroup: function(name) {
            for (var i=0; i<arguments.length; i++) {
                if (arguments[i] in myGroups) return true;
            }
            return false;
        },
        getGroups: function() {
            return Object.getOwnPropertyNames(myGroups);
        },
        getAccessLevel: function() {
            return accessLevel;
        }
    }
}

function updateTotalUsersCount( callback ) {
    callbakc = callback || function() {};
    mysql.query("SELECT count(id) as cnt FROM users",[], function( error, results, fields ) {
        if (error) {
            log.error(error);
            return callback(false, error.sqlMessage);
        }

        totalUsersCount = results[0].cnt;
        callback(true, totalUsersCount);
    });
}

function loadUserGroups( callback ) {
    callback = callback || function() {};
    mysql.query("SELECT id, mnemo, descr FROM groups",[], function(error, results, fields) {
        if (error) {
            log.error(error);
            return callback(false, error.sqlMessage);
        }

        for (var i=0; i<results.length; i++) {
            var row = results[i];
            groupCodes[row.mnemo] = { id: row.id, descr: row.descr };
            groups[row.id] = row.mnemo;
        }

        callback(true);
    });
}

function addUserDefaultWallets( userId ) {
    wallet.registerWallet('ETH', userId, function( success, result ) {
        if (!success) log.error("Can't register ETH wallet for user "+userId+" reason: ", result);

    });
    wallet.registerWallet('BTC', userId, function( success, result ) {
        if (!success) log.error("Can't register BTC wallet for user "+userId+" reason: "+result);
    });
}

function accountConfirm( registerHash, callback ) {
    mysql.query("SELECT id, login, email FROM users WHERE register_hash = ?", [registerHash], function(error, results, fields) {
        if (error) {
            log.error(error);
            return callback(false, error);
        }

        if (results.length<=0) {
            log.error("User with confirmation hash ["+registerHash+"] not found");
            return callback(false, "Internal server error");
        }

        var newRegisterHash = util.generateHashString(25);
        var row = results[0];
        var userId = row.id;
        var login = row.login;
        var email = row.email;
        mysql.query("UPDATE users SET is_active = 1, register_hash = ?, date_update = now() WHERE id=?", [newRegisterHash, userId], function(error, results, fields) {
            if (error) {
                log.error(error);
                return callback(false, error);
            }

            totalUsersCount++;
            addUserDefaultWallets(userId);
            log.info("User ["+userId+"] "+login+" ("+email+") successfuly confirmed");
            callback(true, userId, login, email);
        });
    });
}

function changeUserPassword( userId, newPassword, callback ) {
    libUsers.updateUserPassword(userId, newPassword, function(success, result) {
        if (!sucess) {
            log.error("Error update user password: ", result);
            return callback(false, result);
        }

        mysql.query("UPDATE users SET confirm_hash = null, date_update=now() WHERE id=?", [userId],
        function( error, resutls, fields) {
            if (error) {
                return callback(false, error.sqlMessage);
            }

            return callback(true);
        });

    });
}

function register( email, login, password, callback ) {
    mysql.query(
        "SELECT " +
            "id, email, login " +
        "FROM " +
            "users " +
        "WHERE " +
            "email=? OR login=?", [email, login], function(error, results, fields) {
        if (error) {
            log.error(error);
            return callback(false, error);
        }
        if (results.length>0) {
            if (results[0].email==email) {
                return callback(false, "Email already used by another user" );
            } else if (results[0].login==login) {
                return callback(false, "Login already used by another user");
            }
        }

        var confirmHash = util.generateHashString(25);
        var removeHash = util.generateHashString(25);
        mysql.query(
            "INSERT INTO " +
                "users (login, is_active, email, register_hash, remove_hash, date_create) " +
            "VALUES " +
                "(?,?,?,?,?, now())",
            [login, 0, email, confirmHash, removeHash], function(error, results, fields) {
                if (error) {
                    log.error(error);
                    return callback(false, error);
                }
                var passwordHash = util.passwordHash(password);
                var userId = results.insertId;
                mysql.query("INSERT INTO `user-password` (link_user, hash, type) VALUES (?,?,?)", [results.insertId, passwordHash, 1], function(error, results, fields) {
                    if (error) {
                        log.error(error);
                        return callback(false, error);
                    }

                    mysql.query("INSERT INTO `user-group` (link_user, link_group) VALUES (?,?)", [userId, 3], function(error, results, fields) {
                        if (error) {
                            log.error(error);
                            return callback(false, error);
                        }

                        if (emailConfirmation==true) {
                            audit.customEvent(userId, 'register', 'User registered as '+login+'; sent confirmation email to '+email);
                            mail.addMail(email, 'AdMine account activation notify', 'email/confirmation', {
                                user: email,
                                confirmUrl: registerConfirmUrl+'?hash='+confirmHash
                            }, function(success, result) {
                                if (!success) return callback(false, result);

                                callback(true, userId, true);
                            });
                        } else {
                            accountConfirm(confirmHash, function( success, result, login, email ) {
                                if (!success) {
                                    log.error("Can't confirm account, error: ", result);
                                    return callback(false, result);
                                }
                                var userId = result;
                                callback(true, userId, emailConfirmation, login, email);
                            });
                        }

                    });

                });
            });
    });
}

function restoreAccount( userId, email, callback ) {
    var confirmHash = util.generateHashString(25)
    mysql.query("UPDATE users SET date_update=now(), confirm_hash=? WHERE id=?", [confirmHash, userId],
    function(error, results, fields) {
        if (error) {
            log.error(error);
            return callback(false, error.sqlMessage);
        }

        mail.addMail(email, 'AdMine account restore message', 'email/restore_account', {
            restoreUrl: restoreAccountUrl + '?hash='+confirmHash,
            supportEmail: supportEmail
        }, function (success, result) {
            if (!success) return callback(false, result);

            return callback(true, confirmHash);
        });
    });
}

function userLoggedIn( userId, sessionId, callback ) {
    if (!users[userId]) {
        users[userId] = new User(userId);
    }

    users[userId].userLoggedIn(sessionId, function( success, result ) {
        if (success) audit.userLogin(userId);
        callback(success, result);
    });
}

module.exports.logout = function( sessionId, userId, callback ) {
    mysql.query("DELETE FROM session WHERE id = ?", [sessionId], function(error, results, fields) {
        if (error) {
            log.error(error);
            return callback(false, error);
        }

        audit.userLogout(userId);

        callback(true);
    });
};

module.exports.getSession = function( req, callback ) {
    var sessionId = (req.cookies?req.cookies.sid:null);
    if (!sessionId) {
        return callback(true, 'Session identificator not found');
    }
    mysql.query("SELECT id, link_user FROM session WHERE hash=?", [sessionId], function(error, results, fields) {
        if (error) {
            log.error(error);
            return callback(true, error);
        }

        if (results.length>0) {
            var row = results[0];
            var userId = row.link_user;
            var sessionId = row.id;
            if (!users[userId]) {
                userLoggedIn(userId, sessionId, function( success, result ) {
                    if (!success) return callback(true, result);

                    return callback(false, userId, sessionId);
                });
            } else {
                return callback(false, userId, sessionId);
            }

        } else {
            return callback(true, 'Session not found');
        }
    });
};

module.exports.register = register;

module.exports.userInGroup = function( userId, mnemo ) {
    var user = users[userId];
    return user.userInGroup.apply(user, [].slice.apply(arguments, [1]));
};

module.exports.getUserGroup = function( userId ) {
    var user = users[userId];
    return user?user.getGroups():[];
};

module.exports.getUserAccessLevel = function( userId ) {
    var user = users[userId];
    return user?user.getAccessLevel():0;
};

module.exports.userLoggedIn = userLoggedIn;
module.exports.accountConfirm = accountConfirm;
module.exports.restoreAccount = restoreAccount;
module.exports.changeUserPassword = changeUserPassword;
module.exports.getUsersCount = function() {
    return totalUsersCount;
}


// ---------------- MODULE LOGIC ---------------------

loadUserGroups(function( success, result ) {
    updateTotalUsersCount(function( success, result ) {
        if (success) {
            log.info(result+" users registered in system");
        }
    });
});
