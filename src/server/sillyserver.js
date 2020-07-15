//ref here: https://github.com/websockets/ws/blob/master/doc/ws.md
var WebSocket = require('./node_modules/ws');
var WebSocketServer = WebSocket.Server;

var fs        = require('fs'),
    http      = require('http'),
    https     = require('https'),
    qs		  = require('querystring'),
    url		  = require('url'),
	util	  = require('util'); //for debug

//Server
function SillyServer( server, secure )
{
	this.rooms = {}; //existing rooms
	this.clients = []; //connected clients
	this.db = {}; //to store data
	this.last_id = 1; //0 is reserved for server messages
	this.blacklist = {}; //blacklisted users by ip

	this.debug_room = null; //if you enter this room you get all the traffic

	this.MAX_BUFFER = 100;
	this.buffering = false; //allow to store last messages to resend to new users
	this.verbose = false;
	this.allow_read_files = false; //dangerous
	this.files_folder = null; //set to the folder to server files statically

	//create HTTP Server
	this.server = server;
	if(!server)
	{
		this.server = secure
				   ? https.createServer({
					   key:  fs.readFileSync(__dirname + '/server.key'),
					   cert: fs.readFileSync(__dirname + '/server.crt')
					 })
				   : http.createServer();
	}

	this.server.addListener('request', this.httpHandler.bind(this) ); //incoming http connections
	//this.server.addListener('upgrade', this.connectionHandler.bind(this) ); //incomming websocket connections
	this.server.addListener('error', this.errorHandle.bind(this) ); //errors

	this.wss = new WebSocketServer( { server: this.server } );
	this.wss.on('connection', this.connectionHandler.bind(this));

	//callbacks
	this.on_connected = null;
	this.on_message = null;
	this.on_disconnected = null;
}

SillyServer.version = "1.3";
SillyServer.default_port = 55000;

SillyServer.prototype.listen = function( port )
{
	this.port = port || SillyServer.default_port;
	console.log('SillyServer v'+SillyServer.version+' listening in port ', this.port);
	this.server.listen( this.port );
}

SillyServer.prototype.init = function()
{
	this.createRoom(""); //base room
}

//create packet server
SillyServer.prototype.connectionHandler = function(ws,req) {

	if( ws.upgradeReq )
		ws.ip = ws.upgradeReq.connection.remoteAddress;
	else if( ws.connection )
		ws.ip = ws.connection.remoteAddress;
	else if( req && req.connection )
		ws.ip = req.connection.remoteAddress;
	else
		ws.ip = "unknown_ip";
	console.log('open', ws.ip );
	this.onConnection( ws, ws.upgradeReq || req );
};

/* for FAYE
SillyServer.prototype.connectionHandler = function(request, socket, head) {
	var ws = new WebSocket(request, socket, head, ['irc', 'xmpp'], {ping: 5});
	console.log('open', ws.url, ws.version, ws.protocol);
	this.onConnection(ws);
};
*/

SillyServer.prototype.errorHandle = function(err)
{
	console.log("**** Error on opnening server, check that the port is not in use ***");
	console.log(err);
}

//NEW CLIENT
SillyServer.prototype.onConnection = function(ws, req)
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

	var path_info = url.parse( req.url );
	var params = qs.parse(path_info.query);

	//room info
	var room_name = path_info.pathname;
	ws.room = room_name.substr(1, room_name.length); //strip the dash

	if(params.feedback == '1' || params.feedback == 'true')
		ws.feedback = true;
	else
		ws.feedback = false;

	if(this.on_connected)
		if(this.on_connected(ws) == true )
			return;

	//add to room (or create it)
	if(this.rooms[ws.room] == null)
		this.createRoom(ws.room);
	var room = this.rooms[ws.room];
	room.clients.push(ws);
	this.clients.push(ws);

	//send id info
	ws.sendToClient("ID", ws.user_id );

	//send room info
	var clients = this.rooms[ws.room].clients;
	var room_info = { name: ws.room, clients:[] };
	for(var i = 0; i < clients.length; ++i)
		room_info.clients.push( clients[i].user_id );
	ws.sendToClient("INFO", JSON.stringify( room_info ) );

	//last N messages buffered
	if(this.buffering)
		for(var i = 0; i < room.buffer.length; ++i)
			ws.send(room.buffer[i]);

	//tell all
	this.sendToRoom(ws.room, ws.user_id, "LOGIN", ws.user_name, true );

	//ON MESSAGE CALLBACK
	ws.onmessage = (function(event) {

		//console.log(ws.ip + ' = ' + typeof(event.data) + "["+event.data.length+"]:" + event.data );
		//console.dir(event.data); //like var_dump

		if(this.on_message)
			if( this.on_message(event) == true )
				return;

		var is_binary = event.data.constructor !== String;
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
				data = data.substr(header_pos+1);
			}
		}

		this.sendToRoom( ws.room, ws.user_id, is_binary ? "DATA" : "MSG", data, ws.feedback, target_ids );

		if(this.verbose)
			console.log(ws.ip + ' => ' + (is_binary ? "[DATA]" : event.data) );

		this.packets += 1;
	}).bind(this);

	ws.onclose = quitUser.bind(this);
	ws.onerror = quitUser.bind(this);

	//ON CLOSE CALLBACK
	function quitUser(event)
	{
		if(!ws) //it happens sometimes
		{
			console.log('quit without ws?');
			return;
		}

		console.log('close: ', ws.user_id, ws.ip, event.code, event.type );
		this.sendToRoom(ws.room, ws.user_id, "LOGOUT", ws.user_name );
		var room = this.rooms[ws.room];
		if(room)
		{
			room.clients.splice( room.clients.indexOf(ws), 1);
			if(room.clients.length == 0)
				delete this.rooms[ws.room];
		}
		this.clients.splice( this.clients.indexOf(ws), 1);

		if(this.on_disconnected)
			this.on_disconnected(ws);
	}
}

//ROOMS *******
SillyServer.prototype.createRoom = function(name, options)
{
	options = options || {};
	console.log("Room created: " + name );
	this.rooms[name] = { clients: [], buffer:[] };
}

SillyServer.prototype.getRoomInfo = function(name)
{
	var room = this.rooms[name];

	var r = { clients: [] };
	for(var i in room.clients )
		r.clients.push( room.clients[i].user_id );
	return r;
}

SillyServer.prototype.getVars = function(name)
{
	var r = {};
	for(var i in this.db)
	{
		if( i.indexOf(name) == 0 )
			r[i] = this.db[i];
	}
	return r;
}


SillyServer.prototype.findRooms = function(name)
{
	var r = {};
	for(var i in this.rooms )
	{
		if( i.indexOf(name) == 0 )
			r[i] = this.getRoomInfo( i );
	}
	return r;
}

SillyServer.prototype.sendToRoom = function(room_name, id, cmd, data, feedback, target_ids )
{
	if(data === undefined)
		return;

	var room = this.rooms[room_name];
	if(!room)
		return;

	var header = id.toString() + "|" + cmd + "|";

	//prepare
	var packet_data = null;
	if( data.constructor === String )
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
		var client = room.clients[i];

		//skip in case is a targeted msg
		if( target_ids && target_ids.indexOf( client.user_id ) == -1 )
			continue;

		if(client.readyState != WebSocket.OPEN)
			continue;

		if (feedback || client.user_id != id)
			client.send( packet_data );
	}

	//broadcast to debug room
	if(this.debug_room && this.rooms[this.debug_room])
	{
		var debug_room = this.rooms[this.debug_room];
		if(debug_room.clients.length)
			for(var i = 0; i < debug_room.clients.length; ++i)
				debug_room.clients[i].send( packet_data + "{"+room_name+"}" );
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
		if(i[0] != "_" && i != this.debug_room) //hidden room
			r[i] = this.rooms[i].clients.length;

	var c = {};
	for(var i in this.clients)
	{
		var room_name = this.clients[i].room;
		if(room_name[0] == "_" || i == this.debug_room)
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
					if( name )
					{
						that.setData( name, value );
						sendResponse(response, 200, {'status':1,'msg':'var set'} );
					}
					else
						sendResponse(response, 200, {'status':-1,'msg':'key missing'} );
				}
				else if(POST["action"] == "get")
				{
					var name = POST["key"];
					var value = that.getData(name);
					if(value !== undefined)
						sendResponse(response, 200, {'status':1,'data': value} );
					else
						sendResponse(response, 200, {'status':1,'msg':'var not found ' + name} );
				}
				//console.log("end POST");
			});
		}
		else //method == "GET"
		{
			var GET = path_info.query;
			if( GET["action"] == "set")
			{
				if( GET["key"] != null)
				{
					var name = GET["key"];
					var value = GET["value"];
					if( name )
					{
						that.setData(name,value);
						sendResponse(response, 200, {'status':1,'msg':'var set'} );
					}
					else
						sendResponse(response, 200, {'status':-1,'msg':'key missing'} );
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
	else if(path_info.pathname == "/vars")
	{
		var GET = path_info.query;
		var vars_name = GET["name"];
		if( !vars_name || vars_name.length < 6 )
			sendResponse(response, 200, {'status':1,'msg':'invalid vars name, must be at least 6 characters long'} );
		sendResponse(response, 200, {'status':1,'msg':'var list', 'db': this.getVars(vars_name) });
	}
	else if(path_info.pathname.indexOf("/room/") == 0)
	{
		var room_name = path_info.pathname.substr(6);
		if( !room_name || !this.rooms[ room_name ] )
			sendResponse(response, 200, {'status':1,'msg':'room not found'} );
		else
			sendResponse(response, 200, {'status':1,'msg':'room info', data: this.getRoomInfo( room_name )} );
	}
	else if(path_info.pathname == "/room_info")
	{
			var GET = path_info.query;
			var room_name = GET["name"];
			if( !room_name || !this.rooms[ room_name ] )
				sendResponse(response, 200, {'status':1,'msg':'room not found'} );
			else
				sendResponse(response, 200, {'status':1,'msg':'room info', data: this.getRoomInfo( room_name )} );
	}
	else if(path_info.pathname == "/find")
	{
			var GET = path_info.query;
			var room_name = GET["name"];
			if( !room_name || room_name.length < 3 )
				sendResponse(response, 200, {'status':0,'msg':'name too short, min length is 3'} );
			else
				sendResponse(response, 200, {'status':1,'msg':'rooms info', data: this.findRooms( room_name )} );
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

if (require.main === module) {
    console.log("SillyServer.js cannot be launched directly, you need to execute main.js");
}

module.exports.SillyServer = SillyServer;
