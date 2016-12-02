#!/usr/bin/env node

// in another process
var polo = require('./');
var os = require('os');
var apps = polo({
    multicast: true,     // disables network multicast,
    monitor: true,        // fork a monitor for faster failure detection,
    heartbeat: 1000 // set the service heartbeat interval (defaults to 2min)
});
var Table = require('cli-table2');
var colors = require('colors/safe');

var servicehistory = [];
var columnfilter = ['name', 'port', 'host', 'address', 'hostname'];
const State = {
   UP: 'UP',
   DOWN: 'DOWN',
}
var tableconf = {
  	head: columnfilter,
    chars: { 'top': '' , 'top-mid': '' , 'top-left': '' , 'top-right': ''
 , 'bottom': '' , 'bottom-mid': '' , 'bottom-left': '' , 'bottom-right': ''
 , 'left': '' , 'left-mid': '' , 'mid': '' , 'mid-mid': ''
 , 'right': '' , 'right-mid': '' , 'middle': '\t' },
    style: { 'padding-left': 1, 'padding-right': 1 }
  }
var tableconfcurrent = Object.assign({}, tableconf);
tableconfcurrent.head = columnfilter.concat(['status','up-time']).map(function(obj){ return colors.yellow(obj); });
var tableconfhistory = Object.assign({}, tableconf);
tableconfhistory.head = columnfilter.concat(['status','start/stop time']).map(function(obj){ return colors.yellow(obj); })

apps.on('up', function(name, service) {                   // up fires everytime some service joins
    //console.log('up',name,service, apps.get(name));                        // should print out the joining service, e.g. hello-world
    //console.log(' Service ' + colors.green('UP'),name, service);
    addservicestate(servicehistory,service,columnfilter,State.UP);
});

apps.on('down', function(name, service) {                   // up fires everytime some service joins
    //console.log(' Service ' + colors.red('DOWN'),name, service);                        // should print out the joining service, e.g. hello-world
    addservicestate(servicehistory,service,columnfilter,State.DOWN);
});

function secondsToHMS(secs) {
  function z(n){return (n<10?'0':'') + n;}
  var sign = secs < 0? '-':'';
  secs = Math.abs(secs);
  var h = Math.floor(secs / 3600);
  var m = Math.floor(secs % 3600 / 60);
  var s = Math.floor(secs % 3600 % 60);
  return sign + z(h |0) + ':' + z(m |0) + ':' + z(s | 0);
}

function addservicestate(arr,service,columnfilter,state, uptime){
  var row= [];
  var n =columnfilter.length-1;
  Object.keys(service).forEach(function(element, index, arr) {
  	var i = columnfilter.indexOf(element);
  	if (i < 0) return;
    var val = service[element];
    row[i]=val;
  });
  row[n+1]=state == State.UP ? colors.green(state) : colors.red(state);
  row[n+2]= uptime ? secondsToHMS((new Date() - new Date(service.config.started))/1000) : new Date().toISOString();
  arr.push(row);
}

function refresh(){
  //readline.cursorTo(process.stdout,0,0);
  //readline.clearScreenDown();
  //console.log('\x1Bc');
  //var clear = require('clear-it');
  //clear();
  process.stdout.write('\u001b[2J')
  process.stdout.write('\u001b[1;1H')
  
  console.log(os.EOL,colors.yellow(' Services running '),new Date().toUTCString());
  var services = apps.all();
  var currentservices= [];
  var currentservicetable = new Table(tableconfcurrent);
  Object.keys(services).forEach(function(element1, index1, array1) {
    var service = services[element1][0];
    addservicestate(currentservices,service,columnfilter,State.UP, true);
  });
  currentservicetable.push(...currentservices);
  console.log(currentservicetable.toString());
  
  console.log(colors.yellow(os.EOL,' Services history '));
  var servicehistorytable = new Table(tableconfhistory);
  servicehistorytable.push(...servicehistory);
  console.log(servicehistorytable.toString());
  
  console.log(os.EOL,colors.yellow('Monitor up-time:'), secondsToHMS(process.uptime()));
}

refresh();
var printallrunningservices = setInterval(refresh, 1000);

function exitHandler(options, err) {
    if (options.cleanup) {
    	console.log('clean');
    	clearInterval(printallrunningservices);
    	apps.stop();
    }
    if (err) console.log(err.stack);
    if (options.exit) process.exit();
}

//do something when app is closing
process.on('exit', exitHandler.bind(null,{cleanup:true,exit:true}));

//catches ctrl+c event
process.on('SIGINT', exitHandler.bind(null, {cleanup:true,exit:true}));

//catches uncaught exceptions
process.on('uncaughtException', exitHandler.bind(null, {cleanup:true,exit:true}));