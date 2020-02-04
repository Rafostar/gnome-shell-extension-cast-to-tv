var websocket = io();

websocket.on('loading-text', onLoadingText);
websocket.on('processes-done', onProcessesDone);
websocket.emit('webplayer', 'processes-ask');

function onLoadingText(text)
{
	document.getElementById('msg').innerHTML = text;
}

function onProcessesDone(isDone)
{
	if(!isDone)
		return websocket.emit('webplayer', 'loading-ask');

	websocket.disconnect();
	location.reload(true);
}
