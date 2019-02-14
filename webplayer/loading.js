var websocket = io();
websocket.emit('processes-ask');
websocket.emit('loading-ask');

websocket.on('loading-text', msg => { document.getElementById("msg").innerHTML = msg; });

var checkInterval = setInterval(() => { websocket.emit('processes-ask'); }, 500);
websocket.on('processes-done', () => { changePage(); });

function changePage()
{
	clearInterval(checkInterval);
	location.reload(true);
}
