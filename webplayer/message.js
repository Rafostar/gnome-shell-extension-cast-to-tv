var websocket = io();
websocket.emit('webplayer', 'message-ask');

var msgCheckInterval = setInterval(() => { websocket.emit('webplayer', 'message-ask'); }, 1000);
websocket.on('message-refresh', msg => refreshMessage(msg));
websocket.on('message-clear', () => changePage());

function refreshMessage(msg)
{
	if(document.getElementById("msg").innerHTML != msg)
		document.getElementById("msg").innerHTML = msg;
}

function changePage()
{
	clearInterval(msgCheckInterval);
	websocket.disconnect();
	location.reload(true);
}
