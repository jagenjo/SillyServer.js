//ECV EXAMPLE APP
//*****************

//connect to the server
var server = new SillyClient();
server.connect( location.host + ":55000", "DEMO");

//change the text in the website
$("#server_info").html( "Conectandose..." );

//this method is called when the user gets connected to the server
server.on_connect = function(){
	$("#server_info").html( "<span class='good btn btn-success'>Connected</span> Data received <span id='data-sent'>0</span>" );
	$("#server-icon")[0].src = "imgs/server-icon.png";
};

//this methods receives messages from other users (author_id its an unique identifier)
server.on_message = function( author_id, msg ){
	//change the website
	var chat = $("#chat")[0];

	var data = JSON.parse(msg);

	$("#data-sent").html( server.info_received );

	if(data.type == "chat")
	{
		if(chat.childNodes.length > 200)
			$(chat.childNodes[0]).remove();
		$(chat).append("<p class='msg'>user_"+author_id+": "+data.text+"</p>");
		$(chat).animate({
			  scrollTop:  10000000000000
		 });
	}
	else if(data.type == "cursor")
	{
		setCursor(author_id, data.x, data.y);
	}
}

//this methods is called when a new user is connected
server.on_user_connected = function(id){
	//new user!
	$("#chat").append("<p class='msg'>User connected</p>");
	setCursor(id,0,0);
}

//this methods is called when a new user is connected
server.on_user_disconnected = function(id){
	//bye user
	$("#chat").append("<p class='msg'>User disconnected</p>");
	$("#cursor-" + id).remove();
}

//this methods is called when the server gets closed (its shutdown)
server.on_close = function(){
	$("#server_info").html( "<span class='btn btn-danger'>Disconnected</span> Server seems to be offline." );
	$("#server-icon")[0].src = "imgs/server-icon_off.png";
	$(".cursor").remove();
};


//Cursor stuff: send the info to the server
document.body.addEventListener("mousemove", function(e){
	if(!server || !server.is_connected)
		return;

	server.sendMessage({ type:"cursor", x: e.x, y: e.y });
});

function setCursor(id, x, y)
{
	var cursor = document.getElementById("cursor-" + id);
	if(!cursor)
	{
		cursor = document.createElement("div");
		cursor.id = "cursor-" + id;
		cursor.className = "cursor";
		cursor.innerHTML = "<img src='imgs/cursor.png'/>" + id;
		document.body.appendChild(cursor);
	}

	cursor.style.left = x + "px";
	cursor.style.top = y + "px";
}