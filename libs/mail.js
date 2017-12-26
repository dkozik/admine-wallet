var async = require('async');
var nodemailer = require('nodemailer');
var pug = require('pug');
var config = require('./config');
var mysql = require('./mysql');
var log = require('./log')(module);
var mailFrom = config.get('email:address');

var emailTransportConfig = {
    host: config.get('email:smtp-server'),
    port: config.get('email:port'),
    secure: false,
    ignoreTLS: true
};

if (config.get('email:pass')) {
    emailTransportConfig.user = mailFrom;
    emailTransportConfig.pass = config.get('email:pass');
}

var transporter = nodemailer.createTransport(emailTransportConfig);

function mailSenderThread() {
    var online = false;
    var currentEmailId = 0;

    function getNextMail( callback ) {
        mysql.query(
            "SELECT " +
                "id, status, `to`, subject, template, params " +
            "FROM " +
                "`email-queue` " +
            "WHERE " +
                "status=0 " +
            "LIMIT 1", [], function(error, results, fields) {
                if (error) {
                    log.error(error);
                    return callback(false, error);
                }

                if (results.length<=0) return callback(true, null);

                var row = results[0];
                mysql.query("UPDATE `email-queue` SET status=1 WHERE id=?", [row.id], function(error, results, fields) {
                    if (error) {
                        log.error(error);
                        return callback(false, error);
                    }

                    return callback(true, row);
                });
            });
    }

    function sendMail( to, subject, text, html, callback) {
        var mailOptions = {
            from: '"AdMine Support" '+mailFrom,
            to: to,
            subject: subject,
            text: text,
            html: html
        };

        log.info("Send email to "+to+", subject: ", subject);
        try {
            transporter.sendMail(mailOptions, function (error, info) {
                if (error) return callback(false, error);

                callback(true, info.messageId);
            });
        } catch(e) {
            log.error("Email transport failure with message: "+e);
            callback(false, e.message);
        }
    }

    return {
        process: function( callback ) {
            if (online) return callback(false, "Sender still working with "+currentEmailId);
            getNextMail(function( success, result ) {
                if (!success) return callback(false, result);

                if (!result) {
                    return callback(true);
                }

                online = true;
                var mail = result;
                currentEmailId = mail.id;
                var mailParams = JSON.parse(mail.params);
                var mailText = pug.renderFile('./views/'+mail.template+'.txt.pug', mailParams);
                var mailHtml = pug.renderFile('./views/'+mail.template+'.pug', mailParams);

                sendMail(mail.to, mail.subject, mailText, mailHtml, function( success, result ) {

                    currentEmailId = 0;
                    online = false;

                    if (!success) return callback(false, result);

                    callback(true, result);
                });
            });
        }
    }
}

var emailThread = new mailSenderThread();

async.parallel([
    function() {
        setInterval(function() {
            emailThread.process(function( success, result ) {
                if (!success) log.debug(result);
            });
        }, 1000);
    }
]);

module.exports.addMail = function( to, subject, template, params, callback) {
    mysql.query(
        "INSERT INTO " +
            "`email-queue` (status, `to`, subject, template, params, date) " +
        "VALUES (0, ?, ?, ?, ?, now())", [to, subject, template, JSON.stringify(params)],
        function(error, results, fields) {
            if (error) {
                log.error(error);
                return callback(false, error);
            }

            callback(true, results.insertId);
        });
}
