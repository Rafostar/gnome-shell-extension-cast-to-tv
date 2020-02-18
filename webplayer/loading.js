var websocket = io();
websocket.once('connect', onWebsocketConnect);
websocket.on('loading-text', onLoadingText);
websocket.on('processes-done', onProcessesDone);

function onWebsocketConnect()
{
	websocket.emit('webplayer', 'loading-ask');
}

function onLoadingText(text)
{
	document.getElementById('msg').innerHTML = text;
	websocket.emit('webplayer', 'processes-ask');
}

function onProcessesDone(isDone)
{
	if(!isDone) return;

	websocket.disconnect();
	setTimeout(() => location.reload(true), 250);
}
