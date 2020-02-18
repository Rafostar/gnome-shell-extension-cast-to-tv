var websocket = io();
websocket.once('connect', onWebsocketConnect);
websocket.on('message-refresh', refreshMessage);
websocket.on('message-clear', changePage);
var msgCheckInterval = null;

function onWebsocketConnect()
{
	websocket.emit('webplayer', 'message-ask');
	msgCheckInterval = setInterval(() => { websocket.emit('webplayer', 'message-ask'); }, 1000);
}

function refreshMessage(msg)
{
	if(document.getElementById("msg").innerHTML != msg)
		document.getElementById("msg").innerHTML = msg;
}

function changePage()
{
	if(msgCheckInterval)
		clearInterval(msgCheckInterval);

	websocket.disconnect();
	setTimeout(() => location.reload(true), 250);
}
