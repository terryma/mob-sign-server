
/**
 * Module dependencies.
 */

var express = require('express');

var app = module.exports = express.createServer();

// Configuration

app.configure(function(){
  app.set('views', __dirname + '/views');
  app.set('view engine', 'jade');
  app.use(express.bodyParser());
  app.use(express.methodOverride());
  app.use(app.router);
  app.use(express.static(__dirname + '/public'));
});

app.configure('development', function(){
  app.use(express.errorHandler({ dumpExceptions: true, showStack: true })); 
});

app.configure('production', function(){
  app.use(express.errorHandler()); 
});

// Routes

app.get('/', function(req, res){
  res.render('index', {
    title: 'Express'
  });
});


// in memory structures, for demo purpose only
var requests = [];
var registries = [];
registries.push({"uid":"terry@amazon.com", "site":"amazon.com", "deviceId":"12345"});
registries.push({"uid":"terry@google.com", "site":"google.com", "deviceId":"12345"});

app.get('/register-user', function(req, res) {
    console.log(req.query);

    var result = "";
    if (req.query.uid === undefined) {
        result = "uid is required";
    } else if (req.query.sessionId === undefined) {
        result = "sessionId is required";
    } else if (req.query.callback === undefined) {
        result = "callback is required";
    } else if (req.query.site === undefined) {
        result = "site is required";
    } else {
        var uid = req.query.uid;
        var sessionId = req.query.sessionId;
        var callback = req.query.callback;
        var site = req.query.site;


        // check that the uid and sites exist
        var len = registries.length;
        var found = false;
        for (var i = 0; i < len; i++) {
            var r = registries[i];
            if (r.uid == uid && r.site == site) {
                // if the user is already registered, persist the request
                requests.push({"uid":uid, "site":site, "sessionId":sessionId, "callback":callback, "time":new Date().getTime()});
                found = true;
                break;
            }
        }
        if (!found) {
            result = "User and site not registered";
        } else {
            result = "Found user in registry, persisted request";
        }
    }
    res.send({res:result});
});

app.get('/pull-device', function(req, res) {
    console.log(req.query);

    var resultMsg = "";
    var authedRequests = []; // list of authed sites
    if (req.query.deviceId === undefined) {
        resultMsg = "device id is required";
    } else {
        resultMsg = "success";
        var deviceId = req.query.deviceId;

        // filter the registries down to the ones that match the correct device
        var filteredRegistries = registries.filter(function(val) {
            return val.deviceId == deviceId;
        });

        // filter the requests down to the ones that match the correct uid and site
        for (var i = 0; i < filteredRegistries.length; i++) {

            var registry = filteredRegistries[i];
            var filteredRequests = requests.filter(function(val) {
                return val.uid == registry.uid && val.site == registry.site;
            });

            var authedSet = {};
            for (var ii = 0; ii < filteredRequests.length; ii++) {
                var val = filteredRequests[ii];
                if (val.uid == registry.uid && val.site == registry.site && new Date().getTime() - val.time < 60000) {
                    console.log("Found matching request");
                    //authedRequests.push({"uid":val.uid, "site":val.site});
                    var t = {"uid": val.uid, "site":val.site};
                    authedSet[t] = t; 
                }
            }
            for (o in authedSet) {
                authedRequests.push(authedSet[o]);
            }

            console.log("all requests = " + JSON.stringify(requests));
            console.log("filtered requests = " + JSON.stringify(filteredRequests));
            console.log("authed requests = " + JSON.stringify(authedRequests));
            // remove all of filtered requests from the global requests because a pull has been made
            requests = requests.filter(function(val) {
                return filteredRequests.indexOf(val) == -1;
            });

            console.log("all requests after removing filtered requests = " + JSON.stringify(requests));
        }
    }
    res.send({"msg":resultMsg, "auth-requests":authedRequests});
});

app.listen(3000);
console.log("Express server listening on port %d", app.address().port);
