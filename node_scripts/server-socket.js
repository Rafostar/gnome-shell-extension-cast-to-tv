var io = require('socket.io');
var bridge = require('./bridge');
var encode = require('./encode');
var extract = require('./extract');
var gettext = require('./gettext');
var msg = require('./messages.js');
var websocket;

exports.listen = function(server)
{
	websocket = io.listen(server);
	websocket.on('connection', socket => { handleMessages(socket); });
}

function handleMessages(socket)
{
	socket.on('track-ended', () => { checkNextTrack(); });
	socket.on('processes-ask', () => {
		if(!extract.subsProcess && !extract.coverProcess) websocket.emit('processes-done');
	});
	socket.on('loading-ask', () => {
		websocket.emit('loading-text', gettext.translate(msg.loading));
	});
	socket.on('message-ask', () => {
		if(bridge.config.receiverType != 'other') websocket.emit('message-refresh', gettext.translate(msg.wrongReceiver));
		else if(!bridge.selection.filePath) websocket.emit('message-refresh', gettext.translate(msg.noMedia));
		else if(encode.streamProcess) websocket.emit('message-refresh', gettext.translate(msg.streamActive));
		else websocket.emit('message-clear');
	});
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
