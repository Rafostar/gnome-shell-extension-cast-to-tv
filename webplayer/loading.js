var websocket = io();
websocket.emit('webplayer', 'processes-ask');
websocket.emit('webplayer', 'loading-ask');

websocket.on('loading-text', msg => { document.getElementById("msg").innerHTML = msg; });

var checkInterval = setInterval(() => { websocket.emit('webplayer', 'processes-ask'); }, 500);
websocket.on('processes-done', () => changePage());

function changePage()
{
	clearInterval(checkInterval);
	location.reload(true);
}
