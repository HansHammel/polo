var dgram = require('dgram');
var os = require('os');

//on win check:  netsh interface ip show joins
//var MULTICAST_ADDRESS = '239.255.255.250'; //not working on windows
//var MULTICAST_ADDRESS = '239.255.178.1'; //private multicast //not working on windows
//var MULTICAST_ADDRESS = '224.1.1.1';  //not working on windows
//var MULTICAST_ADDRESS = '224.0.0.234';
var MULTICAST_ADDRESS = '224.0.0.1'; //working on windows !!!
//var MULTICAST_ADDRESS = '224.0.0.114'; //not working on windows
//var MULTICAST_ADDRESS = '225.0.0.1'; //not working on windows

//var MULTICAST_ADDRESS = '225.0.0.1';
var MULTICAST_PORT = 60547;

module.exports = function(me, options, callback) {
	var server = dgram.createSocket({type: 'udp4', reuseAddr: true, toString: function () { return 'udp4' }});
	var env = process.env;
	var hosts = {};
	var found = 0;
	var loopTimer;

	var port = options.port || MULTICAST_PORT;
	var host = options.host || MULTICAST_ADDRESS;
	var multicast = !(options.multicast === false || (options.multicast === undefined && process.env.NODE_ENV === 'development'));

	var clear = function() {
		hosts = {};
	};
	var encode = function() {
		return 'ann;' + me + (Object.keys(hosts).length ? ';' + Object.keys(hosts).join(';') : '');
	};
	var send = function(msg) {
		msg = new Buffer(msg);
		server.send(msg, 0, msg.length, port, host);
	};
	var find = function() {
		var then = found;
		var timeout = 10;
		var loop = function() {
			if (then < found) return find();
			if (timeout > 15000) return clear();

			send(encode());
			loopTimer = setTimeout(loop, timeout *= 2);
		};

		loop();
	};

	me = Math.random().toString(16).substr(2) + '@' + me;

	server.on('listening', function() {

	});

	server.on('message', function(message, rinfo) {
		var parts = message.toString().split(';');
		var type = parts[0];
		var from = parts[1];

		if (parts.indexOf(me, 2) > -1) return;
		if (from === me) return;
		if (!from) return;

		if (type === 'ann') {
			send('ack;' + me);
		}
		if (!hosts[from]) {
			found++;
			hosts[from] = 1;
			callback(null, from.split('@')[1]);
		}
	});

function bindToAllNics(server,host){
	var ifaces = os.networkInterfaces();
	Object.keys(ifaces).forEach(function (ifname) {
	  var alias = 0;
	  ifaces[ifname].forEach(function (iface) {
	    if ('IPv4' !== iface.family || iface.internal !== false) {
	      // skip over internal (i.e. 127.0.0.1) and non-ipv4 addresses
	      return;
	    }
	    if (alias >= 1) {
	      // this single interface has multiple ipv4 addresses
	      //console.log(ifname + ':' + alias, iface.address);
	      server.addMembership(host, iface.address);
	    } else {
	      // this interface has only one ipv4 adress
	      //console.log(ifname, iface.address);
	      server.addMembership(host, iface.address);
	    }
	    ++alias;
	  });
	});
}

process.env = {};
	//server.bind(port);
	//server.bind(port, '0.0.0.0');
	server.bind(port, '0.0.0.0', function() {
		if (!multicast) 
		{ server.setMulticastTTL(0);
		} else {
			server.setMulticastTTL(128);
			server.setMulticastLoopback(true);
      server.setBroadcast(false);
		}
		try {
			//server.addMembership(host);
			bindToAllNics(server,host);
		} catch (e) {
			callback(e);
		}
	});
	
	process.env = env;

	find();

	var announcer = {};
	announcer.close = function() {
		if (server) {
			server.close();
			server = null;
		}
		clearTimeout(loopTimer);
	};

	return announcer;
};
