//ECV EXAMPLE APP
//*****************

var room_name = "CHAT";
var timer = null;

//connect to the server
var server = new SillyClient();
server.connect( location.host + ":55000", room_name);

//change the text in the website
$("#server_info").html( "Conectandose..." );

//this method is called when the user gets connected to the server
server.on_connect = function(){
	$("#server_info").html( "<span class='good btn btn-success'>Connected</span> Data received <span id='data-sent'>0</span>" );
	$("#server-icon")[0].src = "imgs/server-icon.png";
	if(timer)
		clearInterval( timer );
	timer = setInterval( onTick, 30000 ); //Every 30 seconds
};

//this methods receives messages from other users (author_id its an unique identifier)
server.on_message = function( author_id, msg ){
	//change the website
	var chat = $("#chat")[0];

	$("#data-sent").html( server.info_received );
	if(chat.childNodes.length > 200)
		$(chat.childNodes[0]).remove();
	$(chat).append("<p class='msg'>user_"+author_id+": "+msg+"</p>");
	$(chat).animate({
          scrollTop:  10000000000000
     });
}

//this methods is called when a new user is connected
server.on_user_connected = function(msg){
	//new user!
	$("#chat").append("<p class='msg'>User connected</p>");
}

//this methods is called when a new user is connected
server.on_user_disconnected = function(msg){
	//bye user
	$("#chat").append("<p class='msg'>User disconnected</p>");
}

//this methods is called when the server gets closed (its shutdown)
server.on_close = function(){
	$("#server_info").html( "<span class='btn btn-danger'>Disconnected</span> Server seems to be offline." );
	$("#server-icon")[0].src = "imgs/server-icon_off.png";
	if(timer)
	{
		clearInterval( timer );
		timer = null;
	}
};

//We call this function every 30 seconds to have an example
function onTick()
{
	if(server && server.is_connected)
		server.sendMessage("ping!");
}
