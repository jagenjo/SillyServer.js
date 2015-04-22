# SillyServer.js
SillyServer its a client/server library that provides a easy-to-use server in nodejs that opens a websocket and bounces any packet that receives in that socket to the rest of the users connected.

When connecting to the websocket clients can specify a room name, in that case only the traffic in that room will be bounced to the other users in that room.

It also provides some basic HTTP methods to store and retrieve basic information (information is stored in memory and will be lost when the server is shutdown).

For the client part it comes with a javascript library that provides all the methods to interact with the server.

It has been used in simple web-applications where you want to connect online users between them.

# Usage

Launch the server using the command:
```
nodejs main.js -port 55000
```

On the client side include the library sillyclient.js and connect using:
```
var server = new SillyClient();
server.connect( location.host + ":55000", "CHAT");

//this method is called when the user gets connected to the server
server.on_connect = function(){
  //connected
};

//this methods receives messages from other users (author_id its an unique identifier)
server.on_message = function( author_id, msg ){
  //data received
}

//this methods is called when a new user is connected
server.on_user_connected = function(msg){
	//new user!
}

//this methods is called when the server gets closed (its shutdown)
server.on_close = function(){
  //server closed
};
```





