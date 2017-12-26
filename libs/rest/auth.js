var log = require('../log.js')(module);
var express = require('express');
var router = express.Router();
var crypto = require('crypto');
var mysql = require('../mysql');
var util = require('../util');
var auth = require('../auth');
var wallet = require('../wallet');
var mail = require('../mail');
var audit = require('../audit');

router.use(function(req, res, next) {
    next();
});

router.get('/confirm', function( req, res, next ) {
    var confirmCode = req.query.code;

    auth.accountConfirm(confirmCode, function( success, result, login, email ) {
        if (!success) {
            audit.customEvent(null, 'confirmerror', 'Confirm account failed: '+result+'; ip: '+req.remoteIpAddr);
            return next({ message: result });
        }

        audit.customEvent(result, 'userconfirm', 'Confirm user '+login+' successful; email: '+email);
        res.send({ ok: true, id: result, login: login, email: email });
    });
});

router.post('/register', function( req, res, next ) {
    var email = (req.body.email||'').toLowerCase();
    var login = (req.body.login||'').toLowerCase();
    var password = req.body.password;
    if (!password || password.length<3) {
        return next({ message: "User password incorrect length"});
    }
    if (!login || login.length<2) {
        return next({ message: "Incorrect login format, login length to small" });
    }
    if (!email || email.length<5) {
        return next({ message: "Incorrect email!"});
    }
    auth.register(email, login, password, function( success, result, emailSent ) {
        if (!success) {
            audit.customEvent(null, 'registererror', 'Register error: '+login+'; ip: '+req.remoteIpAddr);
            return next({ message: result });
        }

        var userId = result;
        audit.customEvent(result, 'register', 'Register success, login: '+login+'; ip: '+req.remoteIpAddr);
        if (!emailSent) {
            userLoggedIn(req, res, next, {id: userId}, true, function( success, userId, sessionHash ) {
                res.send({ ok: true, id: userId, sid: sessionHash, confirm_sent: false});
            });
        } else {
            res.send({ok: true, id: userId, confirm_sent: true});
        }
    });
});

router.get('/status', function(req, res, next) {
    var sessionId = (req.cookies?req.cookies.sid:null);
    if (sessionId>'') {
        mysql.query("SELECT id FROM session WHERE hash=?", [sessionId], function(error, results, fields) {
            if (results.length>0) {
                res.send({ ok: true });
            } else {
                next(true);
            }
        });
    } else {
        next(true);
    }
});

function userLoggedIn(req, res, next, userRow, remember, callback) {
    var sessionHash = util.generateHashString(25);
    var userId = userRow.id;
    log.info("User ["+userId+"] logged in");
    mysql.query("INSERT INTO session (link_user, hash, date, ip) VALUES (?,?,now(),?)", [userId, sessionHash, req.remoteIpAddr], function(error, results, fields) {
        if (error) {
            log.error(error);
            return next(error);
        }

        auth.userLoggedIn(userId, results.insertId, function( success, result ) {
            if (!success) {
                log.error(result);
            }
        });

        res.cookie('sid', sessionHash, {
            maxAge: 60*60*1000*24*30,
            expires: new Date(Date.now()+60*60*1000*24*30) // на 30 дней вперёд
        });
        callback(true, userId, sessionHash);
    });
}

router.get('/logout', function(req, res, next) {
    auth.getSession(req, function( err, data, sessionId ) {
        if (err) return next({message: data});

        auth.logout(sessionId, data, function( success, result ) {
            if (!success) return next({ messagge: result });

            res.send({ ok: true });
        });
    });
});

router.post('/login', function(req, res, next) {
    var login = (req.body.login || '').toLowerCase();
    var password = req.body.password;
    var remember = req.body.remember==true;
    if (!password || password.length<1) {
        audit.customEvent(null, 'wrongpassword', 'Incorrect password: '+password+'; ip: '+ req.remoteIpAddr);
        return next({ message: "Password not presented" });
    }
    var passwordHash = crypto.createHash('md5').update(password).digest("hex");
    var oldSession = (req.cookies?req.cookies.sid:null);
    mysql.query(
        "SELECT u.id, u.login, u.email " +
        "FROM " +
            "users u, `user-password` p " +
        "WHERE " +
            "p.link_user = u.id AND (u.login = ? OR u.email=?) AND p.hash=? and p.type=1",
        [login, login, passwordHash], function(error, results, fields) {
            if (error) {
                log.error(error);
                audit.customEvent(null, 'loginerror', 'Login error: '+error);
                return next(error);
            }
            if (results.length>0) {
                var userId = results[0].id;
                var userRow = results[0];
                if (oldSession>'') {
                    mysql.query("DELETE FROM session WHERE hash = ?", [oldSession], function(error, results, fields) {
                        userLoggedIn(req, res, next, userRow, remember, function( success, userId, sessionHash ) {
                            res.send({ ok: true, id: userId, sid: sessionHash });
                        });
                    });
                } else {
                    userLoggedIn(req, res, next, userRow, remember, function( success, userId, sessionHash ) {
                        res.send({ ok: true, id: userId, sid: sessionHash });
                    });
                }


            } else {
                audit.customEvent(null, 'loginerror', 'User '+login+' not found; ip: '+req.remoteIpAddr);
                return next({ message: "User "+login+" not found or password incorrect" });
            }
    });

});

function checkUserHashAndReturn( hash, comment, callback ) {
    var hashSize = 25;
    if (hash.length!=hashSize) {
        audit.customEvent(null, 'hack', comment);
        log.error(comment+'; hash: '+hash.substr(0, hashSize)+(hash.length>hashSize?'...':''));
        return callback(false, 'Incorrect token');
    }

    mysql.query("SELECT id FROM users WHERE confirm_hash = ?", [hash], function( error, results, fields) {
        if (error) {
            log.error("Can't find restoring user: "+error);
            return callback(false, 'Internal server error');
        }

        if (results.length<=0) {
            log.error("User restore hash ["+hash+"] not found");
            audit.customEvent(null, 'hack', 'User sent incorrect token: '+hash);
            return callback(false, 'Incorrect token');
        }

        callback(true, results[0]);

    });
}

router.get('/restore_state', function(req, res, next) {
    var hash = (req.query.hash||'').toLowerCase();
    checkUserHashAndReturn(hash, 'Check user state failed, ip: '+req.remoteIpAddr, function( success, result ) {
        if (!success) {
            return next({ message: result });
        }

        res.send({ ok: true });
    });
});

router.post('/reset_password', function( req, res, next) {
    var hash = (req.body.hash||'').toLowerCase();
    var password = req.body.pwd||'';
    if (password.length<3) {
        log.error("User password length ("+password.length+") to low");
        return next({ message: 'Password length too low' });
    }
    if (password.length>30) {
        log.error("User password length ("+password.length+") to hight");
        return next({ message: 'Password length to high' });
    }

    checkUserHashAndReturn(hash, 'Reset user password failed, ip: '+req.remoteIpAddr, function( success, result ) {
        if (!success) {
            log.error("Reset password for user failed with error: "+result);
            return next({ message: result });
        }

        var row = result;
        var userId = row.id;
        auth.changeUserPassword(row.id, password, function( success, result ) {
             if (!success) {
                 log.error("Change user password failed: ", result);
                 return next({ message: result });
             }

            log.info("User ["+userId+"] successfuly changed password");
            mysql.query("DELETE FROM session WHERE link_user = ?", [userId], function(error, results, fields) {
                userLoggedIn(req, res, next, row, true);
            });
        });

    });

});

router.post('/restore', function(req, res, next) {
    var email = (req.body.email||'').toLowerCase();
    if (email.length<3) {
        return next({ message: 'Incorrect email address' });
    }

    mysql.query("SELECT id, is_active, confirm_hash, date_update FROM users WHERE email=?", [email], function( error, results, fields) {
        if (error) {
            log.error(error);
            return next({ message: 'Internal server error' });
        }

        if (results.length<=0) {
            audit.customEvent(null, 'hack', 'User presents invalid email ['+email+']; ip: '+req.remoteIpAddr);
            return next({ message: 'User does not exists' });
        }

        var row = results[0];

        if (row.confirm_hash>'') {
            return next({ message: 'Restore confirmation already sent to user' });
        }

        auth.restoreAccount(row.id, email, function( success, result ) {
            if (!success) {
                log.error("Can't restore user email, error: "+result);
                return next({ message: 'Internal server error' });
            }

            res.send({ ok: true });
        });
    });

});

module.exports = router;
