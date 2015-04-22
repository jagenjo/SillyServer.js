var WebSocket = require('./node_modules/faye-websocket/lib/faye/websocket');

var fs        = require('fs'),
    http      = require('http'),
    https     = require('https'),
    qs		  = require('querystring'),
    url		  = require('url');

//Server
function SillyServer( server, secure )
{
	this.rooms = {}; //existing rooms
	this.clients = []; //connected clients
	this.db = {}; //to store data
	this.last_id = 1; //0 is reserved for server messages
	this.blacklist = {}; //blacklisted users by ip

	this.MAX_BUFFER = 100;
	this.buffering = false;
	this.verbose = false;
	this.allow_read_files = false; //dangerous
	this.files_folder = null; //set to the folder to server files statically

	//create HTTP Server
	this.server = server;
	if(!server)
	{
		this.server = secure
				   ? https.createServer({
					   key:  fs.readFileSync(__dirname + 'server.key'),
					   cert: fs.readFileSync(__dirname + 'server.crt')
					 })
				   : http.createServer();
	}

	this.server.addListener('request', this.httpHandler.bind(this) ); //incoming http connections
	this.server.addListener('upgrade', this.connectionHandler.bind(this) ); //incomming websocket connections
	this.server.addListener('error', this.errorHandle.bind(this) ); //errors
}

SillyServer.default_port = 55000;

SillyServer.prototype.listen = function( port )
{
	this.port = port || SillyServer.default_port;
	console.log('SillyServer listening in port ', this.port);
	this.server.listen( this.port );
}

SillyServer.prototype.init = function()
{
	this.createRoom(""); //base room
}

//create packet server
SillyServer.prototype.connectionHandler = function(request, socket, head) {
	var ws = new WebSocket(request, socket, head, ['irc', 'xmpp'], {ping: 5});
	console.log('open', ws.url, ws.version, ws.protocol);
	this.onConnection(ws);
};

SillyServer.prototype.errorHandle = function(err)
{
	console.log("**** Error on opnening server, check that the port is not in use ***");
	console.log(err);
}

//NEW CLIENT
SillyServer.prototype.onConnection = function(ws)
{
	//add callbacks
	ws.sendToClient = function(cmd, data)
	{
		var msg = this.user_id.toString() + "|" + cmd + "|" + data;
		this.send(msg);
	}

	//check blacklist
	if(this.blacklist[ws.ip])
	{
		console.log("Banned user trying to enter: " + ws.ip);
		ws.close();
		return;
	}		

	//initialize
	ws.user_id = this.last_id;
	ws.user_name = "user_" + ws.user_id;
	this.last_id++;
	ws.packets = 0;
	var path_info = url.parse(ws.url);
	var params = qs.parse(path_info.query);

	//room info
	var room_name = path_info.pathname;
	ws.room = room_name.substr(1, room_name.length); //strip the dash

	if(params.feedback != '0' && params.feedback != 'false')
		ws.feedback = true;
	else
		ws.feedback = false;

	//add to room (or create it)
	if(this.rooms[ws.room] == null)
		this.createRoom(ws.room);
	var room = this.rooms[ws.room];
	room.clients.push(ws);
	this.clients.push(ws);

	//send id info
	ws.sendToClient("ID", ws.user_id);

	//last messages
	if(this.buffering)
		for(var i = 0; i < room.buffer.length; ++i)
			ws.send(room.buffer[i]);

	//tell all
	this.sendToRoom(ws.room, ws.user_id, "LOGIN", ws.user_name, true );

	//ON MESSAGE CALLBACK
	ws.onmessage = (function(event) {
		//console.log(ws.ip + ' = ' + typeof(event.data) + "["+event.data.length+"]:" + event.data );
		//console.dir(event.data); //like var_dump
		var is_binary = (typeof(event.data) != "string");
		var data = event.data;
		var target_ids = null;

		//used to targeted messages
		if(!is_binary && data.length && data[0] == "@")
		{
			var header_pos = data.indexOf("|");
			if(header_pos != -1)
			{
				var header = data.substr(1,header_pos-1);
				target_ids = header.split(",").map(function(v){ return parseInt(v); });
			}
		}

		this.sendToRoom(ws.room, ws.user_id, is_binary ? "DATA" : "MSG", data, ws.feedback, target_ids );

		if(this.verbose)
			console.log(ws.ip + ' => ' + (is_binary ? "[DATA]" : event.data) );

		this.packets += 1;
	}).bind(this);

	//ON CLOSE CALLBACK
	ws.onclose = (function(event) {
		console.log('close', event.code, event.reason);
		this.sendToRoom(ws.room, ws.user_id, "LOGOUT", ws.user_name );
		var room = this.rooms[ws.room];
		if(room)
			room.clients.splice( room.clients.indexOf(ws), 1);
		this.clients.splice( this.clients.indexOf(ws), 1);
		ws = null;
	}).bind(this);
}

//ROOMS *******
SillyServer.prototype.createRoom = function(name, options)
{
	options = options || {};
	console.log("Room created: " + name );
	this.rooms[name] = { clients: [], buffer:[] };
},

SillyServer.prototype.sendToRoom = function(room_name, id, cmd, data, feedback, target_ids )
{
	var room = this.rooms[room_name];
	if(!room)
		return;

	var header = id.toString() + "|" + cmd + "|";

	//prepare
	var packet_data = null;
	if(typeof(data) == "string")
		packet_data = header + data;
	else //binary data
	{
		packet_data = new Buffer(data.length + 32);
		//packet_data.fill(0,0,32); //Zero fill: do not work, it crashes
		packet_data.write(header,0);
		data.copy(packet_data,32,0,data.length);
	}

	//buffer
	if(this.buffering)
	{
		if(room.buffer.length > MAX_BUFFER)
			room.buffer.shift();
		room.buffer.push(packet_data);
	}

	//broadcast
	for(var i = 0; i < room.clients.length; ++i)
	{
		//skip in case is a targeted msg
		if( target_ids && target_ids.indexOf( i ) == -1 )
			continue;

		var client = room.clients[i];
		if (feedback || client.user_id != id)
			client.send( packet_data );
	}
}

//DATABASE info storage
SillyServer.prototype.setData = function(name, value)
{
	if(value === undefined)
		delete this.db[name];
	else
		this.db[name] = value;
}

SillyServer.prototype.getData = function(name)
{
	return this.db[name];
}

//REPORTS
SillyServer.prototype.getReport = function()
{
	var r = {};
	for(var i in this.rooms)
		if(i[0] != "_") //hidden room
			r[i] = this.rooms[i].clients.length;

	var c = {};
	for(var i in this.clients)
	{
		var room_name = this.clients[i].room;
		if(room_name[0] == "_")
			room_name = "***HIDDEN***";
		c[i] = {id: this.clients[i].user_id, ip: this.clients[i].ip, room: room_name, packets: this.clients[i].packets};
	}

	return { rooms:r, clients:c };
}

// HTTP SERVER  (used for administration) **********************
SillyServer.prototype.httpHandler = function(request, response)
{
	var that = this;
	var path = request.url;
	if(this.verbose)
		console.log(" http request: " + path);

	function sendResponse(response,status_code,data)
	{
		//allow cors
		response.writeHead(status_code, {'Content-Type': 'text/plain', "Access-Control-Allow-Origin":"*"});
		if( typeof(data) == "object")
			response.write( JSON.stringify( data ) );
		else
			response.write( data );
		response.end();
	}

	var path_info = url.parse(request.url,true);

	//data manipulation
	if(path_info.pathname == "/data")
	{
		if(request.method == 'POST')
		{
			//gather all the header
			var body='';
			request.on('data', function (data) {
				body += data;
			});

			request.on('end',function() {
				var POST =  qs.parse(body);
				//console.log(POST);
				//get all the info
				if( POST["action"] == "set")
				{
					var name = POST["key"];
					var value = POST["value"];
					if(typeof(name) != "undefined" && typeof(value) != "undefined")
					{
						that.setData( name, value);
						sendResponse(response, 200, {'status':1,'msg':'var set'} );
					}
					else
					{
						console.log("Info missing");
						sendResponse(response, 200, {'status':0,'msg':'nothing to do'} );
					}
				}
				else if(POST["action"] == "get")
				{
					var name = POST["key"];
					var value = that.getData(name);
					if(value != null)
						sendResponse(response, 200, {'status':1,'data': value} );
					else
						sendResponse(response, 200, {'status':1,'msg':'var not found ' + name} );
				}
				//console.log("end POST");
			});
		}
		else //get
		{
			var GET = path_info.query;
			if( GET["action"] == "set")
			{
				if( GET["key"] != null)
				{
					var name = GET["key"];
					var value = GET["value"];
					that.setData(name,value);
					sendResponse(response, 200, {'status':1,'msg':'var set'} );
				}
				else
				{
					sendResponse(response, 200, {'status':0,'msg':'nothing to do'} );
				}
			}
			else if( GET["action"] == "get")
			{
				var name = GET["key"];
				var value = that.getData(name);
				if(value !== undefined)
					sendResponse(response, 200, {'status':1,'data':value} );
				else
					sendResponse(response, 200, {'status':1,'msg':'var not found ' + name} );
			}
		}
	}
	else if(path_info.pathname == "/showvars")
	{
		sendResponse(response, 200, {'status':1,'msg':'var list', 'db': that.db } );
	}
	else if(path_info.pathname == "/info")
	{
		sendResponse(response, 200, that.getReport() );
	}
	else
	{
		if(this.allow_read_files && this.files_folder != null)
		  fs.readFile( this.files_folder + path, function(err, content) {
			var status = err ? 404 : 200;
			sendResponse(response, status, content || "file not found");
		  });
		 else
			sendResponse(response, 300, "cannot read files");
	}
}

module.exports.SillyServer = SillyServer;