var express = require('express');
var path = require('path');
var log = require('./libs/log')(module);
var winston = require('winston');
var config = require('./libs/config');
var fs = require('fs');

log.info("Start admine.io application server");
log.info("\n"+fs.readFileSync('./media/logo').toString());

var app = express();
app.set('views', './views');
app.set('view engine', 'pug');
var router = require('./libs/router.js')(express, app);

var balanceWatcher = require('./libs/balance_watcher');

//var auth = require('./libs/auth.js')(app);

//app.use(express.favicon()); // отдаем стандартную фавиконку, можем здесь же свою задать
//app.use(express.logger('dev')); // выводим все запросы со статусами в консоль
//app.use(express.bodyParser()); // стандартный модуль, для парсинга JSON в запросах
//app.use(express.methodOverride()); // поддержка put и delete
//app.use(app.router); // модуль для простого задания обработчиков путей

app.listen(config.get('port'), config.get('host'), function(){
    log.info('Express server listening on '+config.get('host')+':'+config.get('port'));
});

// Запуск треда проверки балансов кошельков
balanceWatcher.onError(function( err ) {
    log.error(err);
});

balanceWatcher.updateWatchList(function(success, err) {
    if (success) {
        balanceWatcher.start();
    }
});
