var io = require('socket.io');
var fs = require('fs');
var bridge = require('./bridge');
var encode = require('./encode');
var extract = require('./extract');
var gettext = require('./gettext');
var messages = require('./messages');
var gnome = require('./gnome');
var controller = require('./remote-controller');
var shared = require('../shared');

var clientTimeout;
var websocket;

exports.clientsConnected = 0;

exports.listen = function(server)
{
	websocket = io.listen(server);
	websocket.on('connection', handleMessages);
}

exports.emit = function(message, opts)
{
	websocket.emit(message, opts);
}

function handleMessages(socket)
{
	exports.clientsConnected++;

	if(clientTimeout)
	{
		clearTimeout(clientTimeout);
		clientTimeout = null;
	}

	socket.on('webplayer', msg =>
	{
		switch(msg)
		{
			case 'webplayer-ask':
				initWebPlayer();
				gnome.showRemote(true);
				break;
			case 'track-ended':
				controller.checkNextTrack();
				break;
			case 'processes-ask':
				if(!extract.subsProcess && !extract.coverProcess) websocket.emit('processes-done');
				break;
			case 'loading-ask':
				websocket.emit('loading-text', gettext.translate(messages.loading));
				break;
			case 'message-ask':
				sendMessage();
				break;
			default:
				break;
		}
	});

	socket.on('status-update', msg => bridge.setStatusFile(msg));
	socket.on('show-remote', msg => gnome.showRemote(msg));
	socket.on('disconnect', checkClients);
}

function initWebPlayer()
{
	var initType = 'VIDEO';
	var isSub = false;

	if(bridge.selection.streamType != 'MUSIC')
	{
		if(bridge.selection.subsPath || bridge.selection.subsSrc) isSub = true;
		else if(bridge.selection.streamType == 'VIDEO') isSub = fs.existsSync(shared.vttSubsPath);
	}

	if(bridge.selection.streamType == 'MUSIC' && !bridge.config.musicVisualizer) initType = 'MUSIC';

	var webData = {
		type: initType,
		subs: isSub,
		i18n: {
			speed: gettext.translate(messages.plyr.speed),
			normal: gettext.translate(messages.plyr.normal)
		}
	}

	websocket.emit('webplayer-init', webData);
}

function checkClients()
{
	if(exports.clientsConnected > 0) exports.clientsConnected--;

	clientTimeout = setTimeout(() =>
	{
		if(exports.clientsConnected == 0)
		{
			controller.repeat = false;
			gnome.showRemote(false);
		}
	}, 2500);
}

function sendMessage()
{
	if(bridge.config.receiverType != 'other') websocket.emit('message-refresh', gettext.translate(messages.wrongReceiver));
	else if(!bridge.selection.filePath) websocket.emit('message-refresh', gettext.translate(messages.noMedia));
	else if(encode.streamProcess) websocket.emit('message-refresh', gettext.translate(messages.streamActive));
	else if(exports.clientsConnected > 1) websocket.emit('message-refresh', gettext.translate(messages.connectLimit));
	else if(exports.clientsConnected == 1) exports.clientsConnected--;
	else websocket.emit('message-clear');
}
