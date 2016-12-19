const root = require('root');
const request = require('request');
const proc = require('child_process');
const net = require('net');
const path = require('path');
const announce = require('./announce');

const EventEmitter = require('events');

class Repository extends EventEmitter {
	constructor(uri) {
		super();
    this.uri = uri;
    this.all = {};
  }
  keys() {
    return Object.keys(this.all);
};
pushAll(vals) {
    var self = this;

    Object.keys(vals).forEach(function (key) {
        self.push(key, vals[key]);
    });
};
push(key, val) {
    var list = this.all[key] = this.get(key);

    val = Array.isArray(val) ? val : [val];
    list.push.apply(list, val);
    this.emit('push', key, val);
};
pop(key) {
    var list = this.all[key];

    if (!list) return;
    delete this.all[key];
    this.emit('pop', key, list);
};
get(key) {
    return this.all[key] || [];
};
destroy() {
    this.emit('destroy');
    this.keys().forEach(this.pop.bind(this));
};
toJSON() {
    return this.all;
};
}

function future() {
		var that = {};
		var stack = [];
		
		that.get = function(fn) {
			stack.push(fn);
		};
		that.put = function(a,b) {
			that.get = function(fn) {
				fn(a,b);
			};
			
			while (stack.length) {
				stack.shift()(a,b);
			}
		};
		return that;
	};



const PROXY = 'address get all push'.split(' ');
const PING_TIMEOUT = 10 * 1000;
const HEARTBEAT = 2 * 60 * 1000;
const ME = /**
 * @return {string}
 */
    function () {
    const nets = require('os').networkInterfaces();

    for (let i in nets) {
        var candidate = nets[i].filter(function (item) {
            return item.family === 'IPv4' && !item.internal;
        })[0];

        if (candidate) {
            return candidate.address;
        }
    }
    //fallback to localhost
    return '127.0.0.1';
}();

const startMonitor = function (callback) {
    const retry = function () {
        connect(function (err, socket) {
            if (err) return setTimeout(retry, 100);
            callback(null, socket);
        });
    };
    const fork = function () {
        const child = proc.fork(path.join(__dirname, 'monitor.js'), {
            detached: true,
            stdio: ['ignore', 'ignore', 'ignore', 'ipc']
        });
        child.unref();
        retry();
    };
    const connect = function (callback) {
        const socket = net.connect(63567, '127.0.0.1');
        const onerror = function (err) {
            callback(err);
        };

        socket.on('error', onerror);
        socket.on('connect', function () {
            socket.removeListener('error', onerror);
            callback(null, socket);
        });
    };

    connect(function (err, socket) {
        if (err) return fork();
        callback(null, socket);
    });
};

let pool = {};
const listen = function (options) {
    //var that = common.createEmitter();
    const that = new Repository();
    const app = root();
    let announcer;
    const id = process.pid.toString(16) + Math.random().toString(16).substr(2);
    let heartbeat;

    //var onmonitor = common.future();
    const onmonitor = future();
    const monitor = function (message) {
        onmonitor.get(function (err, daemon) {
            if (!daemon || !daemon.writable) return;
            daemon.write(JSON.stringify(message) + '\n');
        });
    };

    if (options.useMonitor || options.monitor) {
        startMonitor(onmonitor.put);
    }

    let cache = {};
    const own = new Repository(id);
    let repos = {
        me: own
    };
    const proxy = function (repo) {
        repo.on('push', function (key, values) {
            cache = {};
            values.forEach(function (val) {
                that.emit('push', key, val);
            });
        });
        repo.on('pop', function (key, values) {
            values.forEach(function (val) {
                that.emit('pop', key, val);
            });
        });
    };
    const repository = function (uri) {
        let repo = repos[uri];

        if (repo) return repo;

        monitor({
            up: uri
        });
        repo = repos[uri] = new Repository(uri);
        repo.on('destroy', function () {
            cache = {};
            delete repos[uri];
            monitor({
                down: uri
            });
        });

        proxy(repo);
        return repo;
    };
    const gc = function () {
        remote(function (repo) {
            request({
                uri: repo.uri + '/ping',
                json: true,
                timeout: PING_TIMEOUT
            }, onresponse(repo));
        });

        clearTimeout(heartbeat);
        heartbeat = setTimeout(gc, options.heartbeat || HEARTBEAT);
    };
    const onresponse = function (repo) {
        return function (err, res, body) {
            if (!err && res.statusCode === 200 && body.ack) return;
            repo.destroy();
        };
    };
    const remote = function (fn) {
        Object.keys(repos).forEach(function (uri) {
            if (uri === 'me') return;
            fn(repos[uri]);
        });
    };

    proxy(own);
    own.on('push', function (key, values) {
        cache = {};
        remote(function (repo) {
            request.post({
                uri: repo.uri + '/data/' + key,
                headers: {
                    'x-repository': own.uri
                },
                json: true,
                body: values
            }, onresponse(repo));
        });
    });

    app.get('/' + id, function (req, res) {
        res.send(own);
    });
    app.get('/' + id + '/ping', function (req, res) {
        res.send({
            ack: true
        });
    });
    app.post('/' + id + '/gc', function (req, res) {
        gc();
        res.send({
            ack: true
        });
    });
    app.post('/' + id + '/data/:key', function (req, res) {
        var repo = repository(req.headers['x-repository'] || own.uri);

        req.on('json', function (body) {
            repo.push(req.params.key, body);
            res.json({
                ack: true
            });
        })
    });

    app.listen(function (addr, server) {
        own.uri = 'http://' + ME + ':' + server.address().port + '/' + id;
        gc();
        announcer = announce(own.uri, options, function (error, uri) {
            if (error) {
                that.emit('error', error);
                return;
            }

            request({
                uri: uri,
                json: true
            }, function (err, res, body) {
                if (err || res.statusCode !== 200) return;

                repository(uri).pushAll(body);
                gc();
            });
        });
    });


    that.address = ME;
    that.push = function (key, val) {
        own.push(key, val);
    };
    that.get = function (key) {
        if (cache[key]) return cache[key];

        var list = cache[key] = [];

        Object.keys(repos).forEach(function (uri) {
            Array.prototype.push.apply(list, repos[uri].get(key));
        });

        return list;
    };
    that.all = function () {
        if (cache._all) return cache._all;

        var all = cache._all = {};

        Object.keys(repos).forEach(function (uri) {
            let repo = repos[uri];

            repo.keys().forEach(function (key) {
                Array.prototype.push.apply(all[key] = all[key] || [], repo.get(key));
            });
        });

        return all;
    };

    that.close = function () {
        app.close();
        clearTimeout(heartbeat);
        announcer.close();
    };

    return that;
};
const proxy = function (options) {
    const key = 'host=' + options.host + ',port=' + options.port + ',multicast=' + options.multicast;
    const shared = pool[key] || (pool[key] = listen(options));
    //var that = common.createEmitter();
    const that = new Repository();

    process.nextTick(function () {
        const all = shared.all();

        Object.keys(all).forEach(function (key) {
            all[key].forEach(function (val) {
                that.emit('push', key, val);
            });
        });

        shared.on('push', function (key, val) {
            that.emit('push', key, val);
        });
        shared.on('pop', function (key, val) {
            that.emit('pop', key, val);
        });
        shared.on('error', function (error) {
            that.emit('error', error);
        });
    });

    PROXY.forEach(function (method) {
        that[method] = shared[method];
    });

    that.close = function () {
        shared.close();
        delete pool[key];
    };

    return that;
};

module.exports = proxy;
