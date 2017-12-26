var log = require('./log.js')(module);
var config = require('./config');
var fs = require('fs');
var path = require('path');
var util = require('./util');
var bodyParser = require('body-parser');
var cookieParser = require('cookie-parser')
var session = require('express-session');
var webStorage = require('./web/session_storage');
var root = {};

module.exports = function( express, app ) {
    var router = express.Router();
    var modulesDir = './libs/rest';

    fs.lstat(path.join(modulesDir), function(err, stat) {
        if (stat.isDirectory()) {
            fs.readdir(modulesDir, function(err, files) {
                app.use(bodyParser.json());
                app.use(cookieParser());
                app.use(bodyParser.urlencoded({ extended: true }));
                app.use(session({
                    secret: 'cookie-secret',
                    resave: false,
                    saveUninitialized: true
                }));

                app.use(function(req, res, next){

                    req.remoteIpAddr = util.getRemoteIp(req);
                    req.session.storage = webStorage.getSessionStorage(req.sessionID);
                    next();
                });

                var f, l = files.length;
                for (var i=0; i<l; i++) {
                    var modName = path.basename(files[i], path.extname(files[i]));
                    f = path.join('./rest', files[i]);
                    app.use(config.get('root-path')+'/'+modName, require('./'+f));
                }

                app.use(function(req, res, next){
                    res.status(404);
                    log.debug('Not found URL: %s',req.url);
                    res.send({ error: 'Service not exists, please check your url' });
                    return;
                });

                app.use(function(err, req, res, next){
                    if (err == true) {
                        res.send({ ok: false });
                    } else {
                        res.status(err.status || 500);
                        log.error('Internal error('+res.statusCode+'): '+err.message);
                        res.send({ ok: false, error: err.message, code: err.code || 0 });
                    }

                    return;
                });
            });
        }
    });

}

