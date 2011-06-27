
/**
 * Module dependencies.
 */

var express = require('express');
var http = require('http');
var url = require('url');
var querystring = require('querystring');

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
    title: 'MobSign Server'
  });
});


// in memory structures, for demo purpose only
var requests = [];
var registries = [];
registries.push({"uid":"team-milkshake@amazon.com", "site":"amazon.com", "deviceId":"6b4273b50428284c"}); // This device id is my samsung phone
registries.push({"uid":"team-milkshake@linkedin.com", "site":"linkedin.com", "deviceId":"device2"});
registries.push({"uid":"team-milkshake@facebook.com", "site":"facebook.com",
"deviceId":"device3"});

// uid = user name
// sessionId = browser session id
// callback = callback url, when an auth response is received from the mobile device, this callback will be invoked
// site = website to be authed
app.get('/auth', function(req, res) {
    // console.log(req.query);

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
        console.log("Received auth request with uid = " + uid + ", site = " + site + ", callback = " + callback);

        // check that the uid and sites exist
        var len = registries.length;
        var found = false;
        for (var i = 0; i < len; i++) {
            var r = registries[i];
            if (r.uid == uid && r.site == site) {
                // if the user is already registered, persist the request
                requests.push({"uid":uid, "site":site, "sessionId":sessionId, "callback":callback, "time":new Date().getTime(), "fired":false});
                found = true;
                break;
            }
        }
        if (!found) {
            result = "User and site not registered";
        } else {
            result = "Found user in registry, persisted request";
        }
        console.log("Pending request size = " + requests.length);
    }
    res.send({res:result});
});

// deviceId = the device to pull auth requests from
// return: msg indicating success or failure
// return: an array of {uid,site} indicating the user and site the auth request is for
app.get('/pull-device', function(req, res) {
//    console.log(req.query);

    var resultMsg = "";
    var authedRequests = []; // list of authed sites
    if (req.query.deviceId === undefined) {
        resultMsg = "device id is required";
    } else {
        resultMsg = "success";
        var deviceId = req.query.deviceId;
        console.log("Device id " + deviceId + " is pulling...");

        // filter the registries down to the ones that match the correct device
        var filteredRegistries = registries.filter(function(val) {
            return val.deviceId == deviceId;
        });

        // filter the requests down to the ones that match the correct uid and site
        for (var i = 0; i < filteredRegistries.length; i++) {

            var registry = filteredRegistries[i];
            var filteredRequests = requests.filter(function(val) {
                var filtered = val.uid == registry.uid && val.site == registry.site && !val.fired;
                if (filtered) {
                    val.fired = true;
                }
                return filtered;
            });

            console.log(filteredRequests.length + " requests in queue match the uid and site of device " + deviceId + " and have not been fired. uid = " + uid + ", site = " + site);


            var authedSet = {};
            for (var ii = 0; ii < filteredRequests.length; ii++) {
                var val = filteredRequests[ii];
                if (val.uid == registry.uid && val.site == registry.site && new Date().getTime() - val.time < 60000) {
                    //console.log("Found matching request");
                    //authedRequests.push({"uid":val.uid, "site":val.site});
                    var t = {"uid": val.uid, "site":val.site};
                    authedSet[t] = t; 
                }
            }
            for (o in authedSet) {
                authedRequests.push(authedSet[o]);
            }
            console.log("Total number of requests in queue = " + requests.length);
            // console.log("all requests = " + JSON.stringify(requests));
            //console.log("filtered requests = " + JSON.stringify(filteredRequests));
            console.log("authed requests = " + JSON.stringify(authedRequests));

            // sort the requests by time
            filteredRequests.sort(function(l, r) {
                return l.time - r.time;
            });
            // keep the latest request
            filteredRequests.pop();

            // remove all of filtered requests from the global requests except the latest one because a pull has been made
            requests = requests.filter(function(val) {
                return filteredRequests.indexOf(val) == -1;
            });

            console.log("Total number of requests after removing filtered requests = " + requests.length);
            // console.log("all requests after removing filtered requests = " + JSON.stringify(requests));
        }
    }
    res.send({"msg":resultMsg, "auth_requests":authedRequests});
});

app.get('/mobile-auth', function(req, res) {
    var msg;
    var callback;
    if (req.query.deviceId === undefined) {
        msg = "device id is required";
    } else if (req.query.uid === undefined) {
        msg = "uid is required";
    } else if (req.query.site === undefined) {
        msg = "site is required";
    } else if (req.query.authed === undefined) {
        msg = "authed is required";
    } else {
        var deviceId = req.query.deviceId;
        var uid = req.query.uid;
        var site = req.query.site;
        var authed = req.query.authed;
        // filter the registries down to the ones that match the correct device
        var filteredRegistries = registries.filter(function(val) {
            return val.deviceId == deviceId && val.uid == uid && val.site == site;
        });

        // this obviously won't work for all cases and is just for demo purpose
        for (var i = 0; i < requests.length; i++) {
            var r = requests[i];
            if (r.uid == uid && r.site == site) {
                callback = r.callback;
                break;
            }
        }

        if (callback !== undefined) {

            var qs = querystring.stringify({
                "uid": uid,
                "authed":authed
            });

            var siteUrl = url.parse(callback);
            var options = {
                host: siteUrl.host,
                port: siteUrl.port || 80,
                path: siteUrl.pathname + '?'+qs
            };

            http.get(options, function(response) {
                response.on('data', function(d) {
                });
            }).on('error', function(e) {
                console.log("Got error: " + e.message);
            });

            res.send({callback:callback});
        } else {
            res.send("Cannot find callback");
        }
    }
    if (msg !== undefined) {
        res.send(msg);
    }

});

app.listen(80);
console.log("Express server listening on port %d", app.address().port);
