const fs = require('fs');
const io = require('socket.io');
const WebSocket = require('ws');
const debug = require('debug')('socket');
const bridge = require('./bridge');
const encode = require('./encode');
const extract = require('./extract');
const gettext = require('./gettext');
const messages = require('./messages');
const gnome = require('./gnome');
const controller = require('./remote-controller');
const sender = require('./sender');
const shared = require('../shared');

var clientTimeout;
var reconnectTimeout;
var websocket;
var wsConnected;

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

exports.connectWs = function(port)
{
	if(gnome.isLockScreen || wsConnected)
		return;

	if(reconnectTimeout)
	{
		clearTimeout(reconnectTimeout);
		reconnectTimeout = null;
	}

	port = port || bridge.config.internalPort;

	debug(`Connecting to GNOME websocket on port: ${port}`);
	var ws = new WebSocket(`ws://127.0.0.1:${port}/websocket/node`);

	const onConnOpen = function()
	{
		debug('GNOME websocket connected');
		ws.send('connected');
		wsConnected = true;
		sender.enabled = true;
	}

	const onConnClose = function()
	{
		debug('GNOME websocket disconnected');
		ws.removeAllListeners();
		wsConnected = false;
		sender.enabled = false;

		if(!gnome.isLockScreen)
		{
			if(reconnectTimeout)
				clearTimeout(reconnectTimeout);

			reconnectTimeout = setTimeout(() =>
			{
				reconnectTimeout = null;
				exports.connectWs(bridge.config.internalPort);
			}, 4250);
		}
	}

	ws.once('open', onConnOpen);
	ws.once('close', onConnClose);
	ws.once('error', onConnClose);
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

	socket.on('status-update', bridge.setGnomeStatus);
	socket.on('show-remote', msg =>
	{
		if(msg)
			controller.setSlideshow();
		else
		{
			controller.clearSlideshow();
			controller.slideshow = false;
		}

		bridge.setGnomeRemote(msg)
	});

	socket.on('disconnect', msg =>
	{
		if(socket.playercastName)
		{
			if(
				socket.playercastInvalid
				|| !exports.playercasts.includes(socket.playercastName)
			)
				return;

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
		{
			if(
				bridge.selection.streamType === 'VIDEO'
				|| !bridge.config.burnSubtitles
			)
				isSub = true;
		}
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

	if(!gnome.isRemote)
		bridge.setGnomeRemote(true);
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
			bridge.setGnomeRemote(false);
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
