//

function SillyClient()
{
	this.url = "";
	this.socket = null;
	this.is_connected = false;
	this.clients = {};
	this.info_transmitted = 0;
	this.info_received = 0;

	this.user_id = 0;
	this.user_name = "anonymous";

	this.on_connect = null;
	this.on_message = null;
	this.on_close = null;
	this.on_user_connected = null;
	this.on_user_disconnected = null;
}

SillyClient.prototype.connect = function( url, room_name, on_connect, on_message, on_close )
{
	room_name = room_name || "";
	var that = this;
	this.url = url;
	if(!url)
		throw("You must specify the server URL of the SillyServer");

	if(this.socket)
		this.socket.close();

	if(typeof(WebSocket) == "undefined")
		WebSocket = window.MozWebSocket;
	if(typeof(WebSocket) == "undefined")
	{
		alert("Websockets not supported by your browser, consider switching to the latest version of Firefox, Chrome or Safari.");
		return;
	}

	//connect
	this.socket = new WebSocket("ws://"+url+"/" + room_name);
	this.socket.onopen = function(){  
		that.is_connected = true;
		console.log("Socket has been opened! :)");  
		if(on_connect && typeof(on_connect) == "function" )
			on_connect();
		if(that.on_connect)
			that.on_connect();
	}

	this.socket.addEventListener("close", function(e) {
		console.log("Socket has been closed: ", e); 
		if(on_close)
			on_close();
		if(that.on_close)
			that.on_close( e );
		that.socket = null;
		that.clients = {};
		that.is_connected = false;
	});

	this.socket.onmessage = function(msg){  
		that.info_received += 1;
		var tokens = msg.data.split("|");
		if(tokens.length < 3)
			console.log("Received: " + msg.data); //Awesome!  
		else
			that.onServerEvent( tokens[0],tokens[1], msg.data.substr( tokens[0].length + tokens[1].length + 2, msg.data.length), on_message );
	}

	this.socket.onerror = function(err){  
		console.log("error: ", err );
	}

	return true;
}

SillyClient.prototype.onServerEvent = function( author_id, cmd, data, on_message )
{
	if (cmd == "MSG") //user message received
	{
		if(on_message)
			on_message( author_id, data );
		if(this.on_message)
			this.on_message( author_id, data );
	}
	else if (cmd == "LOGIN") //new user entering
	{
		console.log("User connected: " + data);
		var name = "user_" + author_id.toString(); 
		this.clients[ author_id ] = { id: author_id, name: name };
		if(author_id != this.user_id)
		{
			if(this.on_user_connected) //somebody else is connected
				this.on_user_connected( author_id, data );
		}
	}
	else if (cmd == "LOGOUT") //user leaving
	{
		if(this.clients[author_id])
			console.log("User disconnected: " + this.clients[author_id].name );
		if(this.on_user_disconnected) //somebody else is connected
			this.on_user_disconnected( author_id );
		delete this.clients[ author_id ];
	}
	else if (cmd == "ID") //retrieve user id
	{
		this.user_id = author_id;
		this.user_name = "user_" + author_id.toString(); 
		this.clients[ author_id ] = { id: author_id, name: this.user_name };
	}
}

SillyClient.prototype.sendMessage = function(msg)
{
	if(typeof(msg) == "object")
		msg = JSON.stringify(msg);
	if(!this.socket || this.socket.readyState !== WebSocket.OPEN)
	{
		console.error("Not connected, cannot send info");
		return;
	}

	this.socket.send(msg);
	this.info_transmitted += 1;
}

SillyClient.prototype.setData = function(key, value)
{
	var req = new XMLHttpRequest();
	req.open('GET', "http://" + this.url + "/data?action=set&key="+key + ((value !== undefined && value !== null) ? "&value="+value : ""), true);
	req.onreadystatechange = function (aEvt) {
	  if (req.readyState == 4) {
		 if(req.status != 200)
			return console.error("Error setting data: ", req.responseText );
	  }
	};
	req.send(null);
}

SillyClient.prototype.getData = function(key, on_complete)
{
	var req = new XMLHttpRequest();
	req.open('GET', "http://" + this.url + "/data?action=get&key="+key, true);
	req.onreadystatechange = function (aEvt) {
	  if (req.readyState == 4) {
		 if(req.status != 200)
			return console.error("Error setting data: ", req.responseText );
		 var resp = JSON.parse(req.responseText);
		 if(on_complete)
			 on_complete( resp.data );
	  }
	};
	req.send(null);
}
