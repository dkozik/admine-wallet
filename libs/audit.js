var mysql = require('./mysql');
var log = require('./log')(module);

function addLog( userId, linkAuditType, mnemo, description, callback) {
    callback = callback || function() {};
    mysql.query(
        "INSERT INTO " +
            "audit (link_user, link_audit_type, mnemo, description, date) " +
        "VALUES (?, ?, ?, ?, now())", [userId, linkAuditType, mnemo, description], function(error, results, fields) {
            if (error) {
                log.error(error);
                return callback(false, error.sqlMessage);
            }

            callback(true);
        });
}

module.exports.userLogin = function( userId, callback ) {
    addLog(userId, 1, 'login', '', callback);
};

module.exports.userLogout = function( userId, callback ) {
    addLog(userId, 2, 'logout', '', callback);
};

module.exports.updateProfile = function( userId, description, callback ) {
    addLog(userId, 3, 'change', description, callback);
};

module.exports.customEvent = function( userId, mnemo, description, callback ) {
    addLog(userId, 4, mnemo, description, callback);
};

module.exports.logTransfereError = function( tokenTypeId, addr, amount, errorText, callback ) {
    callback = callback || function() {};
    errorText = (''+errorText).substr(0, 2040);
    mysql.query(
        "INSERT INTO " +
            "`transaction-error-log` (link_token_type, addr, amount, error_text, date) " +
        "VALUES (?,?,?,?,now())", [tokenTypeId, addr, amount, errorText], function( error, results, fields ) {
            if (error) {
                log.error(error);
                callback(false, error.sqlMessage);
            }

            callback(true);
        });
};