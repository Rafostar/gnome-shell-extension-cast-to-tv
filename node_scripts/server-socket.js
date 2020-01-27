const fs = require('fs');
const io = require('socket.io');
const bridge = require('./bridge');
const encode = require('./encode');
const extract = require('./extract');
const gettext = require('./gettext');
const messages = require('./messages');
const gnome = require('./gnome');
const controller = require('./remote-controller');
const shared = require('../shared');

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
				controller.setSlideshow();
				break;
			case 'track-ended':
				controller.checkNextTrack();
				break;
			case 'processes-ask':
				if(!extract.video.subsProcess && !extract.music.coverProcess)
					websocket.emit('processes-done', true);
				else
					websocket.emit('processes-done', false);
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

	socket.on('status-update', msg => bridge.sendStatus(msg));
	socket.on('show-remote', msg =>
	{
		if(msg) controller.setSlideshow();
		else
		{
			controller.clearSlideshow();
			controller.slideshow = false;
		}

		gnome.showRemote(msg)
	});

	socket.on('disconnect', msg =>
	{
		if(socket.playercastName)
		{
			if(socket.playercastInvalid || !exports.playercasts.includes(socket.playercastName)) return;

			var index = exports.playercasts.indexOf(socket.playercastName);
			exports.playercasts.splice(index, 1);
		}
		else
			checkClients(msg);
	});
}

function initWebPlayer()
{
	var initType = 'VIDEO';
	var isSub = false;

	if(
		bridge.selection.streamType !== 'MUSIC'
		&& bridge.selection.streamType !== 'PICTURE'
	) {
		if(bridge.selection.subsPath || bridge.selection.subsSrc)
			isSub = true;
	}

	if(bridge.selection.streamType === 'MUSIC' && !bridge.config.musicVisualizer)
		initType = 'MUSIC';

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
		{
			controller.clearSlideshow();
			controller.slideshow = false;
			gnome.showRemote(false);
		}
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
