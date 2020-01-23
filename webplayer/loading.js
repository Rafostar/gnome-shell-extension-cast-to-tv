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
	{
		websocket.emit('webplayer', 'loading-ask');
		return;
	}

	websocket.disconnect();
	location.reload(true);
}
