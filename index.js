var Padlock = require('padlock').Padlock;
var lstreams = require('level-streams');
var underscore = require('underscore');

function LevelForeignKeys(_db, fkopts) {

    fkopts = fkopts || {};
    fkopts.sep = fkopts.sep || '!';
    var lock = new Padlock();

    function DB() {};
    DB.prototype = _db;
    var db = new DB();
    db.parent = _db;

    db.addForeignKey = function (key, field, fkey, opts, cb) {
        if (typeof opts === 'function') {
            cb = opts;
            opts = {};
        }
        lock.runwithlock(function () {
            db.parent.put(['__foreign__', key, field, fkey].join(fkopts.sep), fkey, opts, function (err) {
                db.parent.put(['__rev_foreign__', fkey, field, key].join(fkopts.sep), key, opts, function (err) {
                    lock.release();
                    cb();
                });
            });
        });
    };

    db.delForeignKey = function (key, field, fkey, opts, cb) {
        if (typeof opts === 'function') {
            cb = opts;
            opts = {};
        }
        lock.runwithlock(function () {
            db.parent.del(['__foreign__', key, field, fkey].join(fkopts.sep), opts, function (err) {
                db.parent.del(['__rev_foreign__', fkey, field, key].join(fkopts.sep), opts, function (err) {
                    lock.release();
                    cb();
                });
            });
        });
    };

    db.readForeignKeys = function (key, field, opts, rev_lookup) {
        opts = opts || {};
        var prefix = '__foreign__';
        if (rev_lookup) {
            prefix = '__rev_foreign__';
        }
        return lstreams.createPrefixReadStream(db, [prefix, key, field].join(fkopts.sep), opts)
            .pipe(new lstreams.GetKeyOfValue(db, opts));
    };

    db.readReverseForeignKeys = function (key, field, opts) {
        return db.readForeignKeys(key, field, opts, true);
    };

    db.del = function (key, opts, cb) {
        if (typeof opts === 'function') {
            cb = opts;
            opts = {};
        }
        var readOpts = underscore.clone(opts);
        lock.runwithlock(function () {
            //delete all foreign key indexes
            var foreignStream = lstreams.createPrefixReadStream(db, ['__foreign__', key].join(fkopts.sep), readOpts);
            foreignStream.pipe(new lstreams.OnEach(function(entry, next) {
                var parts = entry.key.split(fkopts.sep);
                var delOpts = underscore.clone(opts);
                if (typeof entry.extra === 'object') {
                    //clone in the extra opts, like vclock?
                    delOpts = delOpts.merge(entry.extra);
                }
                //delete reverse indexes for foreign keys
                db.parent.del(entry.key, delOpts, function (err) {
                    db.parent.del(['__rev_foreign__', parts[3], parts[2], parts[1]].join(fkopts.sep), delOpts, function (err) {
                        next();
                    });
                });
            }));
            //delete reverse indexes
            foreignStream.once('end', function () {
                var reverseStream = lstreams.createPrefixReadStream(db, ['__rev_foreign__', key].join(fkopts.sep), readOpts);
                reverseStream.pipe(new lstreams.OnEach(function(entry, next) {
                    var parts = entry.key.split(fkopts.sep);
                    var delOpts = underscore.clone(opts);
                    if (typeof entry.extra === 'object') {
                        //clone the extra opts in, like vclock?
                        delOpts = delOpts.merge(entry.extra);
                    }
                    //delete foreign key indexes for reverse indexes
                    db.parent.del(entry.key, delOpts, function (err) {
                        db.parent.del(['__foreign__', parts[3], parts[2], parts[1]].join(fkopts.sep), delOpts, function (err) {
                            next();
                        });
                    });
                }));
                reverseStream.once('end', function () {
                    //okay, now you can delete the actual key
                    db.parent.del(key, opts, function (err, extra) {
                        lock.release();
                        cb(err, extra);
                    });
                });
            });
        });
    };

    db.put = function (key, value, opts, cb) {
        if (typeof opts === 'function') {
            cb = opts;
            opts = {};
        }
        lock.runwithlock(function () {
            db.parent.put(key, value, opts, function (err, extra) {
                lock.release();
                cb(err, extra);
            });
        });
    };

    return db;
}

module.exports = LevelForeignKeys;
