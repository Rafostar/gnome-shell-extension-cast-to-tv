var websocket = io();

var checkInterval = setInterval(() => { websocket.emit('processes-ask'); }, 500);
websocket.on('processes-done', msg => { changePage(); });

function changePage()
{
	clearInterval(checkInterval);
	location.reload(true);
}
