var express = require('express');
var router = express.Router();
var mysql = require('../mysql');
var auth = require('../auth');
var log = require('../log')(module);
var balanceWatcher = require('../balance_watcher');
var wallets = require('../wallet');
var libUsers = require('../users');
var audit = require('../audit');

router.use(function(req, res, next) {
    next();
});

router.get('/wallets', function(req, res, next) {
    auth.getSession(req, function( err, data ) {
        if (err) return next({ message: data });
        var userId = data;
        wallets.getUserWallets(userId, function( success, result) {
            if (!success) return next(result);

            var userWallets = result;
            wallets.getUserPersonalETHWallet(userId, function( success, result) {
                if (!success) return next(result);

                res.send({ ok: true, wallets: userWallets, personal: result });
            });
        });
    });
});

router.get('/wallets_history', function( req, res, next) {
    auth.getSession(req, function( err, data ) {
        if (err) return next({message: data});

        var userId = data;
        wallets.getUserWalletsHistory( userId, function( success, result ) {
            if (!success) return next(result);

            res.send({ ok: true, history: result });
        });
    });
});

router.post('/update', function(req, res, next) {
    auth.getSession(req, function( err, data ) {
        if (err) return next({message: data});

        var userId = data;
        libUsers.updateUserData(userId, req.body, function(success, result) {
            if (!success) {
                log.error("Error update user profile: ", result);
                return next({ message: result });
            }

            audit.customEvent(userId, 'profile', 'Update profile', function(success, result) {
                if (!success) {
                    log.error("Error update audit log when update profile: ", result);
                    return next({ message: result });
                }
                log.info("User ["+userId+"] update profile successful");
                res.send({ ok: true });
            });
        });
    });
});

router.get('/profile', function(req, res, next) {
    var profile = {};
    auth.getSession(req, function( err, data ) {
        if (!err) {
            var userId = data;
            mysql.query(
                "SELECT " +
                    "id, n_first, n_middle, n_last, email " +
                "FROM " +
                    "users " +
                "WHERE id=?", [userId],
                function(error, results, fields) {
                    if (error) {
                        log.error(error);
                        return next(error);
                    }
                    var row = results[0];
                    profile.id = row.id;
                    profile.n_first = row.n_first;
                    profile.n_middle = row.n_middle;
                    profile.n_last = row.n_last;
                    profile.email = row.email;
                    profile.mcn_amount = balanceWatcher.getCurrentMcnBalance(row.id);
                    profile.groups = auth.getUserGroup(userId);
                    profile.wallets = [];
                    wallets.getUserWallets(userId, function( success, result ) {
                        if (!success) return next(result);

                        profile.wallets = profile.wallets.concat(result);
                        res.send({ ok: true, profile: profile });
                    });
                });
        } else {
            return next({ message: data, code: 500 });
        }
    });

});

module.exports = router;