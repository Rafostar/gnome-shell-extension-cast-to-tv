var websocket = io();

/* Web player related websocket functions */
if(typeof player !== 'undefined')
{
	websocket.emit('webplayer-ask');

	websocket.on('webplayer-init', msg => preparePlayer(msg));
	player.on('ended', () => websocket.emit('track-ended'));
}

websocket.on('reload', () => location.reload(true));
