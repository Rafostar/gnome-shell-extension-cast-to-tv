var io = require('socket.io');
var bridge = require('./bridge');
var websocket;

exports.listen = function(server)
{
	websocket = io.listen(server);
	websocket.on('connection', socket => { handleMessages(socket); });
}

function handleMessages(socket)
{
	socket.on('track-ended', () => { checkNextTrack(); });
}

exports.emit = function(message)
{
	websocket.emit(message);
}

function checkNextTrack()
{
	var currentTrackID = bridge.list.indexOf(bridge.selection.filePath) + 1;
	var listLastID = bridge.list.length;

	if(currentTrackID < listLastID) bridge.changeTrack(currentTrackID + 1);
}
