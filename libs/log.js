var args = require('./arguments');
var winston = require('winston');
var path = require('path');

var logLevel = (''+args.get('log-level')).toLowerCase() || 'info';
var logFile = args.get('log-file');

function zeroLead( vl ) {
    return ('0'+vl).substr(-2);
}

if (logFile>'') {
    module.exports = function (module) {
        var modulePath = module.filename.split(path.sep).slice(-2).join(path.sep);
        var dirName = path.dirname(logFile);
        var fileName = path.basename(logFile);

        return new winston.Logger({
            transports: [
                new winston.transports.File({
                    filename: fileName,
                    dirname: dirName,
                    level: logLevel,
                    label: modulePath,
                    json: false,
                    timestamp: function () {
                        var dt = new Date();
                        return dt.getFullYear() + '-' + zeroLead(dt.getMonth()) + '-' + zeroLead(dt.getDate()) + ' ' + zeroLead(dt.getHours()) + ':' + zeroLead(dt.getMinutes()) + ':' + zeroLead(dt.getSeconds());
                    }
                })
            ]
        });
    }
} else {
    module.exports = function (module) {
        var path = module.filename.split('/').slice(-2).join('/');

        return new winston.Logger({
            transports: [
                new winston.transports.Console({
                    colorize: true,
                    level: logLevel,
                    label: path,
                    timestamp: function () {
                        var dt = new Date();
                        return dt.getFullYear() + '-' + zeroLead(dt.getMonth()) + '-' + zeroLead(dt.getDate()) + ' ' + zeroLead(dt.getHours()) + ':' + zeroLead(dt.getMinutes()) + ':' + zeroLead(dt.getSeconds());
                    }
                })
            ]
        });
    }
}

