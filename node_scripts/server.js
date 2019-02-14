var express = require('express');
var app = express();
var path = require('path');
var bridge = require('./bridge');
var webcreator = require('./web-creator');
var socket = require('./server-socket');
var encode = require('./encode');
var extract = require('./extract');
var gettext = require('./gettext');
var msg = require('./messages.js');
var listeningPort = bridge.config.listeningPort;
var message;

var server = app.listen(listeningPort).on('error', () => process.exit());
socket.listen(server);

exports.refreshConfig = function()
{
	if(listeningPort != bridge.config.listeningPort)
	{
		server.close();
		listeningPort = bridge.config.listeningPort;
		server = app.listen(listeningPort).on('error', () => process.exit());
		socket.listen(server);
	}
}

function closeStreamProcess()
{
	if(encode.streamProcess)
	{
		process.kill(encode.streamProcess.pid, 'SIGHUP');
		encode.streamProcess = null;
	}
}

app.get('/', function(req, res)
{
	gettext.initTranslations();
	var lang = req.acceptsLanguages.apply(req, gettext.locales);

	if(lang) gettext.setLocale(lang);
	else gettext.setLocale('en');

	if(bridge.config.receiverType != 'other')
	{
		res.end('Selected receiver type is \"' +
		bridge.config.receiverType.charAt(0).toUpperCase() + bridge.config.receiverType.slice(1) +
		'\". Web player is only available on \"Other device\".');
		return;
	}

	if(!bridge.selection.filePath)
	{
		res.statusCode = 404;
		res.end("No media file selected!");
		return;
	}

	if(encode.streamProcess)
	{
		res.end("Streaming process is still active!");
		return;
	}

	if(extract.subsProcess || extract.coverProcess)
	{
		message = gettext.translate(msg.loading);
		res.sendFile(path.join(__dirname + '/../webplayer/loading.html'));
		return;
	}

	switch(bridge.selection.streamType)
	{
		case 'VIDEO':
			res.sendFile(path.join(__dirname + '/../webplayer/webplayer_direct.html'));
			break;
		case 'MUSIC':
			if(bridge.config.musicVisualizer) res.sendFile(path.join(__dirname + '/../webplayer/webplayer_encode.html'));
			else res.sendFile(path.join(__dirname + '/../webplayer/webplayer_direct.html'));
			break;
		case 'PICTURE':
			res.sendFile(path.join(__dirname + '/../webplayer/picture.html'));
			break;
		default:
			res.sendFile(path.join(__dirname + '/../webplayer/webplayer_encode.html'));
	}
});

app.get('/cast', function(req, res)
{
	switch(bridge.selection.streamType)
	{
		case 'MUSIC':
			if(bridge.config.musicVisualizer) webcreator.encodedStream(req, res);
			else webcreator.fileStream(req, res);
			break;
		case 'VIDEO':
		case 'PICTURE':
			webcreator.fileStream(req, res);
			break;
		default:
			webcreator.encodedStream(req, res);
	}

	req.on('close', function()
	{
		closeStreamProcess();
	});
});

app.get('/subs(webplayer)?', function(req, res)
{
	webcreator.subsStream(req, res);
});

app.get('/cover', function(req, res)
{
	webcreator.coverStream(req, res);
});

app.get('/config', function(req, res)
{
	res.send(bridge.config);
});

app.get('/selection', function(req, res)
{
	res.send(bridge.selection);
});

app.get('/message', function(req, res)
{
	res.send(message);
});

app.use('/webplayer', express.static(__dirname + '/../webplayer'));
app.use('/plyr', express.static(__dirname + '/../node_modules/plyr/dist'));

app.get('/*', function(req, res)
{
	webcreator.pageWrong(req, res);
});
