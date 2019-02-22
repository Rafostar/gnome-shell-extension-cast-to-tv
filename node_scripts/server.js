var express = require('express');
var app = express();
var path = require('path');
var bridge = require('./bridge');
var webcreator = require('./web-creator');
var socket = require('./server-socket');
var encode = require('./encode');
var extract = require('./extract');
var gettext = require('./gettext');
var listeningPort = bridge.config.listeningPort;

var server = app.listen(listeningPort).on('error', () => process.exit());
socket.listen(server);
gettext.initTranslations();

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

function checkMessagePage(req, res)
{
	var message;

	if(bridge.config.receiverType != 'other') message = true;
	else if(!bridge.selection.filePath) message = true;
	else if(encode.streamProcess) message = true;
	else message = false;

	if(message)
	{
		res.sendFile(path.join(__dirname + '/../webplayer/message.html'));
		return true;
	}

	if(extract.subsProcess || extract.coverProcess)
	{
		res.sendFile(path.join(__dirname + '/../webplayer/loading.html'));
		return true;
	}

	return false;
}

app.get('/', function(req, res)
{
	var lang = req.acceptsLanguages.apply(req, gettext.locales);

	if(lang) gettext.setLocale(lang);
	else gettext.setLocale('en');

	var isMessage = checkMessagePage(req, res);
	if(isMessage) return;

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

app.use('/webplayer', express.static(__dirname + '/../webplayer'));
app.use('/plyr', express.static(__dirname + '/../node_modules/plyr/dist'));

app.get('/*', function(req, res)
{
	webcreator.pageWrong(req, res);
});
