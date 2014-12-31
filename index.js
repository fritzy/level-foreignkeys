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

    db.getForeignTotal = function (key, field, opts, cb) {
        if (typeof opts === 'function') {
            cb = opts;
            opts = {};
        }
        db.parent.getCount(['__foreign_total__', key, field].join(fkopts.sep), opts, cb);
    };
    
    db.getReverseForeignTotal = function (key, field, opts, cb) {
        if (typeof opts === 'function') {
            cb = opts;
            opts = {};
        }
        db.parent.getCount(['__rev_foreign_total__', key, field].join(fkopts.sep), opts, cb);
    };

    db.addForeignKey = function (key, field, fkey, opts, cb) {
        if (typeof opts === 'function') {
            cb = opts;
            opts = {};
        }
        lock.runwithlock(function () {
            if (opts.primaryBucket) {
                opts.bucket = opts.primaryBucket;
            }
            db.parent.put(
                ['__foreign_bucket__', key, opts.bucket].join(fkopts.sep),
                opts.bucket,
                {bucket: opts.secondaryBucket || opts.bucket},
            function (err) {
                db.parent.put(
                    ['__rev_foreign_bucket__', fkey, opts.secondaryBucket || opts.bucket].join(fkopts.sep),
                    opts.secondaryBucket || opts.bucket,
                    {bucket: opts.primaryBucket || opts.bucket},
                    addLinks
                );
            })
            function addLinks() {
                db.parent.get(['__foreign__', key, field, fkey].join(fkopts.sep), opts, function (err, value) {
                    if (!err || value) {
                        lock.release();
                        cb();
                        return;
                    }
                    db.parent.put(['__foreign__', key, field, fkey].join(fkopts.sep), {key: fkey, bucket: opts.secondaryBucket || opts.bucket}, opts, function (err) {
                        if (opts.secondaryBucket) {
                            opts.bucket = opts.secondaryBucket;
                        }
                        db.parent.put(['__rev_foreign__', fkey, field, key].join(fkopts.sep), {key: key, bucket: opts.primaryBucket || opts.bucket}, opts, function (err) {
                            db.parent.increment(['__foreign_total__', key, field].join(fkopts.sep), 1, {bucket: opts.secondaryBucket || opts.bucket}, function (err) {
                                db.parent.increment(['__rev_foreign_total__', fkey, field].join(fkopts.sep), 1, {bucket: opts.primaryBucket || opts.bucket}, function (err) {
                                    lock.release();
                                    cb();
                                });
                            });
                        });
                    });
                });
            }
        });
    };

    db.delForeignKey = function (key, field, fkey, opts, cb) {
        if (typeof opts === 'function') {
            cb = opts;
            opts = {};
        }
        lock.runwithlock(function () {
            if (opts.secondaryBucket) {
                opts.bucket = opts.secondaryBucket;
            }
            db.parent.del(['__foreign__', key, field, fkey].join(fkopts.sep), opts, function (err) {
                if (err) {
                    lock.release();
                    cb();
                    return;
                }
                db.parent.increment(['__foreign_total__', key, field].join(fkopts.sep), -1, opts, function (err) {
                    if (opts.secondaryBucket) {
                        opts.bucket = opts.secondaryBucket;
                    }
                    db.parent.del(['__rev_foreign__', fkey, field, key].join(fkopts.sep), opts, function (err) {
                        db.parent.increment(['__rev_foreign_total__', fkey, key, field].join(fkopts.sep), -1, function (err) {
                            lock.release();
                            cb();
                        });
                    });
                });
            });
        });
    };

    db.hasForeignKey = function (key, field, fkey, opts, cb) {
        if (typeof opts === 'function') {
            cb = opts;
            opts = {};
        }
        lock.runwithlock(function () {
            if (opts.secondaryBucket) {
                opts.bucket = opts.secondaryBucket;
            }
            db.parent.get(['__foreign__', key, field, fkey].join(fkopts.sep), opts, function (err, val) {
                lock.release();
                if (err) {
                    cb(null, false);
                } else {
                    cb(null, true);
                }
            });
        });
    };

    db.readForeignKeys = function (key, field, opts, rev_lookup) {
        opts = opts || {};
        var prefix = '__foreign__';
        if (rev_lookup) {
            prefix = '__rev_foreign__';
        }
        opts.keyValue = 'key';
        return lstreams.createPrefixReadStream(db, [prefix, key, field].join(fkopts.sep), opts)
            .pipe(new lstreams.GetKeyOfValue(db, opts));
    };

    db.readReverseForeignKeys = function (key, field, opts) {
        return db.readForeignKeys(key, field, opts, true);
    };

    function cleanUpForeign(key, opts, cb) {
        var tick = false;
        var readOpts = underscore.clone(opts);
        var revOpts = underscore.clone(opts);
        var foreignBStream = lstreams.createPrefixReadStream(db, ['__foreign_bucket__', key, undefined].join(fkopts.sep), readOpts);
        foreignBStream.pipe(new lstreams.OnEach(function (entry, next) {
            tick = true;
            var bucket = entry.value;
            foreignStream = lstreams.createPrefixReadStream(db, ['__foreign__', key, undefined].join(fkopts.sep), {bucket: bucket});
            foreignStream.pipe(new lstreams.OnEach(function (entry, next) {
                var parts = entry.key.split(fkopts.sep);
                var delOpts = {bucket: bucket};
                if (typeof entry.extra === 'object') {
                    //clone in the extra opts, like vclock?
                    delOpts = underscore.extend(delOpts, entry.extra);
                }
                //delete reverse indexes for foreign keys
                db.parent.increment(['__foreign_total__', parts[1], parts[2]].join(fkopts.sep), -1, delOpts, function (err) {
                    db.parent.del(entry.key, delOpts, function (err, del) {
                        db.parent.increment(['__rev_foreign_total__', parts[4], parts[5], parts[3]].join(fkopts.sep), -1, delOpts, function (err) {
                            var delkey = ['__rev_foreign__', parts[4], parts[5], parts[3], parts[1], parts[2]].join(fkopts.sep);
                            db.parent.del(delkey, readOpts, function (err) {
                                next();
                            });
                        });
                    });
                });
            }));
            foreignStream.once('end', function () {
                cb();
            });
        }));
        foreignBStream.once('end', function () {
            if (!tick) {
                cb();
            }
        });
    }

    function cleanUpReverseForeign(key, opts, cb) {
        var tick = false;
        var readOpts = underscore.clone(opts);
        var revOpts = underscore.clone(opts);
        var foreignBStream = lstreams.createPrefixReadStream(db, ['__rev_foreign_bucket__', key, undefined].join(fkopts.sep), readOpts);
        foreignBStream.pipe(new lstreams.OnEach(function (entry, next) {
            tick = true;
            var bucket = entry.value;
            foreignStream = lstreams.createPrefixReadStream(db, ['__rev_foreign__', key, undefined].join(fkopts.sep), {bucket: bucket});
            foreignStream.pipe(new lstreams.OnEach(function (entry, next) {
                var parts = entry.key.split(fkopts.sep);
                var delOpts = {bucket: bucket};
                if (typeof entry.extra === 'object') {
                    //clone in the extra opts, like vclock?
                    delOpts = underscore.extend(delOpts, entry.extra);
                }
                //delete reverse indexes for foreign keys
                db.parent.increment(['__rev_foreign_total__', parts[1], parts[2]].join(fkopts.sep), -1, delOpts, function (err) {
                    db.parent.get(entry.key, delOpts, function (err, del) {
                        db.parent.increment(['__foreign_total__', parts[4], parts[5], parts[3]].join(fkopts.sep), -1, delOpts, function (err) {
                            var delkey = ['__foreign__', parts[4], parts[5], parts[3], parts[1], parts[2]].join(fkopts.sep);
                            db.parent.del(delkey, readOpts, function (err) {
                                next();
                            });
                        });
                    });
                });
            }));
            foreignStream.once('end', function () {
                cb();
            });
        }));
        foreignBStream.once('end', function () {
            if (!tick) {
                cb();
            }
        });
    }

    db.del = function (key, opts, cb) {
        if (typeof opts === 'function') {
            cb = opts;
            opts = {};
        }
        lock.runwithlock(function () {
            //delete reverse indexes
            cleanUpForeign(key, opts, function (err) {
                cleanUpReverseForeign(key, opts, function (err) {
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
