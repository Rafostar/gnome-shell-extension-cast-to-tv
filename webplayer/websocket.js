var websocket = io();

websocket.on('reload', function()
{
	location.reload(true);
});

player.on('ended', function()
{
	websocket.emit('track-ended');
});
