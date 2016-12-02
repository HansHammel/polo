var http = require('http');
var uuidV4 = require('uuid/v4');
var polo = require('../');
var apps = polo({
    multicast: true,     // disables network multicast,
    monitor: true,        // fork a monitor for faster failure detection,
    heartbeat: 1000 // set the service heartbeat interval (defaults to 2min)
});
var colors = require('colors/safe');

apps.on('up', function(name, service) {                   // up fires everytime some service joins
    //console.log('up',name,service, apps.get(name));                        // should print out the joining service, e.g. hello-world
    console.log('Service ' + colors.green('UP'),service.name,service.address);
});

apps.on('down', function(name, service) {                   // up fires everytime some service joins
    console.log('Service ' + colors.red('DOWN'),service.name,service.address);                        // should print out the joining service, e.g. hello-world
});

var servicename = uuidV4();

var server = http.createServer(function(req, res) {
    if (req.url !== '/') {
        res.writeHead(404);
        res.end();
        return;
    }
    res.end('hello-http is available at http://'+apps.get(servicename).address);
});

var random_boolean = Math.random() >= 0.5;

server.listen(0, function() {
    var port = server.address().port; // let's find out which port we binded to


var data = {
        name: servicename,
        //host set automatically
        //hostname: random_boolean ? 'somehost' : null,
        port: port,
        config: {
        	started: new Date().toISOString(),
        	somestuff: { o: 'b' }
        }
    };
    if (random_boolean) data.hostname='somehost';
    apps.put(data);

    console.log('visit: http://localhost:'+port);
    //console.log(apps.all());
});