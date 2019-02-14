var io = require('socket.io');
var fs = require('fs');
var bridge = require('./bridge');
var encode = require('./encode');
var extract = require('./extract');
var gettext = require('./gettext');
var msg = require('./messages.js');
var shared = require('../shared');
var websocket;

exports.listen = function(server)
{
	websocket = io.listen(server);
	websocket.on('connection', socket => { handleMessages(socket); });
}

function handleMessages(socket)
{
	socket.on('webplayer-ask', () => { initWebPlayer(); });
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

function initWebPlayer()
{
	var initType = 'VIDEO';
	var isSub = false;

	if(bridge.selection.streamType != 'MUSIC')
	{
		if(bridge.selection.subsPath) isSub = true;
		else isSub = fs.existsSync(shared.vttSubsPath);
	}

	if(bridge.selection.streamType == 'MUSIC' && !bridge.config.musicVisualizer) initType = 'MUSIC';

	websocket.emit('webplayer-init', { type: initType, subs: isSub });
}

function checkNextTrack()
{
	var currentTrackID = bridge.list.indexOf(bridge.selection.filePath) + 1;
	var listLastID = bridge.list.length;

	if(currentTrackID < listLastID) bridge.changeTrack(currentTrackID + 1);
}
