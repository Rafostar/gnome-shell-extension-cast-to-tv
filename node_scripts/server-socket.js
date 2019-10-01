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

exports.activeConnections = 0;
exports.playercasts = [];

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
	exports.activeConnections++;

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

	socket.on('playercast-connect', msg =>
	{
		socket.playercastName = msg;

		if(exports.activeConnections > 0)
			exports.activeConnections--;

		if(!exports.playercasts.includes(socket.playercastName))
		{
			exports.playercasts.push(socket.playercastName);
			socket.emit('invalid', false);
			bridge.writePlayercasts();
		}
		else
		{
			socket.playercastInvalid = true;
			socket.emit('invalid', 'name');
		}
	});

	socket.on('playercast-ctl', msg =>
	{
		switch(msg)
		{
			case 'track-ended':
				if(!controller.checkNextTrack())
					controller.webControl('STOP');
				break;
			case 'previous-track':
				controller.webControl('SKIP-');
				break;
			case 'next-track':
				controller.webControl('SKIP+');
				break;
			default:
				break;
		}
	});

	socket.on('status-update', msg => bridge.setStatusFile(msg));
	socket.on('show-remote', msg => gnome.showRemote(msg));

	socket.on('disconnect', msg =>
	{
		if(socket.playercastName)
		{
			if(socket.playercastInvalid || !exports.playercasts.includes(socket.playercastName)) return;

			var index = exports.playercasts.indexOf(socket.playercastName);
			exports.playercasts.splice(index, 1);
			bridge.writePlayercasts();
		}
		else
			checkClients(msg);
	});
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
	if(exports.activeConnections > 0)
		exports.activeConnections--;

	clientTimeout = setTimeout(() =>
	{
		clientTimeout = null;

		if(exports.activeConnections == 0)
			gnome.showRemote(false);
	}, 2500);
}

function sendMessage()
{
	if(bridge.config.receiverType == 'chromecast')
		websocket.emit('message-refresh', gettext.translate(messages.receiverChromecast));
	else if(bridge.config.receiverType == 'playercast')
		websocket.emit('message-refresh', gettext.translate(messages.receiverPlayercast));
	else if(!bridge.selection.filePath)
		websocket.emit('message-refresh', gettext.translate(messages.noMedia));
	else if(encode.streamProcess)
		websocket.emit('message-refresh', gettext.translate(messages.streamActive));
	else if(exports.activeConnections > 1)
		websocket.emit('message-refresh', gettext.translate(messages.connectLimit));
	else if(exports.activeConnections == 1)
		exports.activeConnections--;
	else
		websocket.emit('message-clear');
}
