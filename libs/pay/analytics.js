var mysql = require('../mysql');
var log = require('../log')(module);
var SqlQuery = require('../query/mysql');

var transactionLogQuery = new SqlQuery(
        "SELECT " +
            "tl.id, tp.descr as token_type, " +
            "tl.link_user_sender, su.login, " +
            "tl.eth_addr, tl.amount, tl.descr, DATE_FORMAT(tl.date, '%Y-%m-%d %H:%i'), tl.link_user_dest " +
        "FROM " +
            "`token-transfer-log` tl, `token-types` tp, users su " +
        "WHERE " +
            "tp.id = tl.token_type " +
        "AND su.id = tl.link_user_sender")
    .addQueryParam('login', 'and su.login=?')
    .addQueryParam('addr', 'and tl.eth_addr=?')
    .addQueryParam('date_from', 'and tl.date>=?')
    .addQueryParam('date_to', 'and tl.date<=?');

var investorsQuery = new SqlQuery(
    "SELECT " +
        "u.id, u.login, u.email, h.currency_type, h.amount as hist_amount, w.amount, w.addr, w.mcn_amount, w.create_date, w.last_update_date " +
    "FROM " +
        "`user-wallet-history` h, `user-wallets` w, `users` u " +
    "WHERE " +
            "w.id = h.link_user_wallet " +
        "AND u.id = w.link_user " +
        "AND h.amount>0 " +
        "AND h.currency_type!='MCN'")
    .addQueryParam('login', 'and u.login=?')
    .addQueryParam('email', 'and u.email=?')
    .addQueryParam('currency_type', 'and h.currency_type=?')
    .addQueryParam('addr', 'and w.addr=?');

var tokenBuyers = new SqlQuery(
    "SELECT " +
        "u.id, u.login, u.email, w.addr, w.amount, w.mcn_amount, w.create_date, w.last_update_date" +
    "FROM " +
        "`user-wallets` w, `users` u " +
    "WHERE " +
        "u.id = w.link_user " +
    "AND" +
        "w.link_wallet_type=2 " +
    "AND " +
        "w.mcn_amount>0");

function getTransactionLog( req, callback ) {

    var params = req.query;

    transactionLogQuery.queryWithCount(req, params, function(success, result, rowsCount, pos) {
        if (!success) {
            log.error("Query transaction log error: ", result);
            return callback(false, result);
        }

        callback(true, result, rowsCount, pos);
    });

}

module.exports.getTransactionLog = getTransactionLog;