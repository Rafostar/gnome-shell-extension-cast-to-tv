const express = require('express');
const app = express();
const path = require('path');
const webcreator = require('./web-creator');
const encode = require('./encode');
const bridge = require('./bridge');

var listeningPort = bridge.config.listeningPort;

exports.refreshConfig = function()
{
	if(listeningPort != bridge.config.listeningPort)
	{
		server.close();
		listeningPort = bridge.config.listeningPort;
		server = app.listen(listeningPort).on('error', function(err) { process.exit() });
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
	if(bridge.config.receiverType != 'other')
	{
		res.end('Selected receiver type is \"' +
		bridge.config.receiverType.charAt(0).toUpperCase() + bridge.config.receiverType.slice(1) +
		'\". Web player is only available on \"Other device\".');
		return;
	}

	if(!selection.filePath)
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

	switch(selection.streamType)
	{
		case 'VIDEO':
			res.sendFile(path.join(__dirname + '/webplayer/direct_player.html'));
			break;
		case 'MUSIC':
			if(bridge.config.musicVisualizer) res.sendFile(path.join(__dirname + '/webplayer/encode_player.html'));
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
	switch(selection.streamType)
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
	res.send(config);
});

app.use('/webplayer', express.static(__dirname + '/webplayer'));
app.use('/plyr', express.static(__dirname + '/node_modules/plyr'));

app.get('/*', function(req, res)
{
	webcreator.pageWrong(req, res);
});

var server = app.listen(listeningPort).on('error', function(err) { process.exit() });
encode.refreshSelection();
