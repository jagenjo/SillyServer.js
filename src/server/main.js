var SillyServer = require('./sillyserver.js').SillyServer;

//input parameters
var pos = process.argv.indexOf("-port")
var port   = (pos != -1 && (process.argv.length > pos + 1) ? process.argv[pos+1] : 55000),
    secure = process.argv.indexOf("-ssl") != -1;
var verbose = (process.argv.indexOf("-v") != -1 ? true : false);
if(verbose)
	console.log("verbose mode ON");


//launch the server
var sillyserver = new SillyServer(null, secure);
sillyserver.verbose = verbose;
sillyserver.listen( port );




