# SillyServer.js
SillyServer its a client/server library that provides a easy-to-use server in nodejs that opens a websocket and bounces any packet that receives in that socket to the rest of the users connected.

When connecting to the websocket clients can specify a room name, in that case only the traffic in that room will be bounced to the other users in that room.

It also provides some basic HTTP methods to store and retrieve basic information (information is stored in memory and will be lost when the server is shutdown).

For the client part it comes with a javascript library that provides all the methods to interact with the server.

It has been used in simple web-applications where you want to connect online users between them.

# Installation

## Server

To install the server app in your own public server machine follow the next steps.

It requires to have installed nodejs.

For Linux and Mac

```js
npm install sillyserver
cp node_modules/sillyserver/src/server/*.js .
```

For Windows
```js
npm install sillyserver
copy node_modules\sillyserver\src\server\*.js .
```

## Client

You need to include the sillyclient.js in your HTML:
```html
<script src="sillyclient.js"></script>
```


# Usage

Launch the server using the command:
```js
node main.js -port 55000
```

On the client side include the library sillyclient.js and connect using:
```js
var server = new SillyClient();
server.connect( location.host + ":55000", "CHAT");

//this method is called when the server accepts the connection (no ID yet nor info about the room)
server.on_connect = function(){
  //connected
};

//this method is called when the server gives the user his ID (ready to start transmiting)
server.on_ready = function(id){
  //user has an ID
};

//this method is called when we receive the info about the current state of the room (clients connected)
server.on_room_info = function(info){
  //to know which users are inside
};

//this methods receives messages from other users (author_id is an unique identifier per user)
server.on_message = function( author_id, msg ){
  //data received
}

//this methods is called when a new user is connected
server.on_user_connected = function( user_id ){
	//new user!
}

//this methods is called when a user leaves the room
server.on_user_disconnected = function( user_id ){
	//user is gone
}

//this methods is called when the server gets closed (it shutdowns)
server.on_close = function(){
  //server closed
};

//this method is called when coulndt connect to the server
server.on_error = function(err){
};
```

To send information to all the other users connected to the same room:
```js
server.sendMessage("mymessage");
```

Or to send information only to some users, you pass the users id in an array
```js
server.sendMessage("mymessage", [1,4,7]);
```


You can store information in the server so future users could retrieve it even if you are offline:
```js
server.storeData("mykey", "mydata");
//...
server.loadData("mykey", function(data) { console.log(data); }); //should print mydata
```
but remember that this information will be lost if the server get shut down.

You can also retrieve information about the current rooms open in the server:
```js
server.getReport( function(report) { ... } );
```
Rooms that have a name that start with an underscore "_" will be ignored in the report.



Or info about one specific room:
```js
server.getRoomInfo( "myroom", function(room_info) { ... } );
```


