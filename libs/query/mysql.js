var mysql = require('../mysql');
var log = require('../log')(module);

var sqlIdIndex = 0;

function generateNewSqlId() {
    return 'query#'+(Date.now() + (sqlIdIndex+=1));
}

function SqlQuery( sqlQuery, sqlParams, options ) {

    sqlParams = sqlParams || {};
    options = options || {
        rowsAsArray: true
    };

    var queryId = generateNewSqlId();

    function compileQuery( params, count, from ) {
        params = params || {};
        from = parseInt(from);
        count = parseInt(count);
        var sqlBuf = [sqlQuery];
        var paramsArray = [];
        for (var key in params) {
            if (key in sqlParams) {
                sqlBuf.push(sqlParams[key]);
                paramsArray.push(params[key]);
            }
        }

        if (!isNaN(count) && count>0) {
            if (!isNaN(from) && from>0) {
                sqlBuf.push("LIMIT "+from+", "+count);
            } else {
                sqlBuf.push("LIMIT "+count);
            }
        }

        return { sql: sqlBuf.join(' '), params: paramsArray };
    }


    return {
        setSql: function( sql ) {
            sqlQuery = sql;
            return this;
        },
        addQueryParam: function( name, expression ) {
            sqlParams[name] = expression;
            return this;
        },
        query: function( req, params, callback ) {
            callback = callback || function() {};
            var count = parseInt(params.count) || 20;
            var posStart = parseInt(params.posStart);
            var query = compileQuery(params, count, posStart);
            mysql.query(query.sql, query.params, function( error, results, fields ) {
                if (error) {
                    log.error("Query: \n"+query.sql+"\nparams: ["+query.params+"]\nexecute failed: ", error);
                    return callback(false, error.sqlMessage);
                }

                if (options.rowsAsArray) {
                    var outBuf = [];
                    for (var i=0; i<results.length; i++) {
                        var rowBuf = [];
                        var row = results[i];
                        for (var j=1; j<fields.length; j++) {
                            rowBuf.push( row[fields[j].name]);
                        }
                        outBuf.push({ id: row.id, data: rowBuf });
                    }
                    callback(true, outBuf, fields, count, posStart);
                } else {
                    callback(true, results, fields, count, posStart);
                }

            });
            return this;
        },
        count: function( req, params, callback ) {
            var query = compileQuery(params);
            var sql = "SELECT count(1) as cnt FROM ("+query.sql+") subquery";
            mysql.query(sql, query.params, function( error, results, fields ) {
                if (error) {
                    log.error("Query: \n"+query.sql+"\nparams: ["+query.params+"]\nexecute failed: ", error);
                    return callback(false, error.sqlMessage);
                }

                var cnt = results[0].cnt;
                callback(true, cnt);
            });
            return this;
        },
        queryWithCount: function(req, params, callback) {
            var lastRowsCount = req.session.storage.get('lastRowsCount');
            var queryParams = req.session.storage.get(queryId) || {};
            if (!params.posStart || !queryParams.lastRowsCount) {
                return this.count(req, params, function( success, result ) {
                    if (!success) return callback(success, result);
                    var rowsCount = result;
                    queryParams.lastRowsCount = rowsCount;
                    this.query(req, params, function(success, result, fields, count, posStart) {
                        if (!success) return callback(success, result);
                        req.session.storage.put(queryId, queryParams);
                        return callback(true, result, rowsCount, posStart);
                    });
                }.bind(this));
            } else {
                return this.query(req, params, function(success, result, fields, count, posStart) {
                    if (!success) return callback(success, result);
                    return callback(true, result, queryParams.lastRowsCount, posStart);
                });
            }
        }
    }
}

module.exports = SqlQuery;