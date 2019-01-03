const express = require('express');
const app = express();
const path = require('path');
const webcreator = require('./webcreator');
const encodesettings = require('./encodesettings');
const configbridge = require('./configbridge');

var config = configbridge.config;
var listeningPort = config.listeningPort;

exports.refreshConfig = function()
{
	config = configbridge.config;

	if(listeningPort != config.listeningPort)
	{
		server.close();
		listeningPort = config.listeningPort;
		server = app.listen(listeningPort).on('error', function(err) { process.exit() });
	}
}

function closeStreamProcess()
{
	if(encodesettings.streamProcess)
	{
		process.kill(encodesettings.streamProcess.pid, 'SIGHUP');
		encodesettings.streamProcess = null;
	}
}

app.get('/', function(req, res)
{
	if(config.receiverType != 'other')
	{
		res.end('Selected receiver type is \"' +
		config.receiverType.charAt(0).toUpperCase() + config.receiverType.slice(1) +
		'\". Web player is only available on \"Other device\".');
		return;
	}

	if(!config.filePath)
	{
		res.statusCode = 404;
		res.end("No media file selected!");
		return;
	}

	if(encodesettings.streamProcess)
	{
		res.end("Streaming process is still active!");
		return;
	}

	switch(config.streamType)
	{
		case 'VIDEO':
			res.sendFile(path.join(__dirname + '/webplayer/direct_player.html'));
			break;
		case 'MUSIC':
			if(config.musicVisualizer) res.sendFile(path.join(__dirname + '/webplayer/encode_player.html'));
			else res.sendFile(path.join(__dirname + '/webplayer/direct_player.html'));
			break;
		case 'PICTURE':
			webcreator.fileStream(req, res);
			break;
		default:
			res.sendFile(path.join(__dirname + '/webplayer/encode_player.html'));
	}
});

app.get('/cast', function(req, res)
{
	switch(config.streamType)
	{
		case 'MUSIC':
			if(config.musicVisualizer) webcreator.encodedStream(req, res);
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

app.get('/config', function(req, res)
{
	res.send(config);
});

app.use('/webplayer', express.static(__dirname + '/webplayer'));
app.use('/plyr', express.static(__dirname + '/node_modules/plyr'));

app.get('/*', function(req, res)
{
	webcreator.pageWrong(req, res);
});

var server = app.listen(listeningPort).on('error', function(err) { process.exit() });
encodesettings.refreshConfig();
