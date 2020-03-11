const express = require('express');
const bodyParser = require('body-parser');
const bowser = require('bowser');
const path = require('path');
const bridge = require('./bridge');
const webcreator = require('./web-creator');
const sender = require('./sender');
const socket = require('./server-socket');
const encode = require('./encode');
const extract = require('./extract');
const gettext = require('./gettext');

const app = express();

var userAgent = null;
var server = app.listen(bridge.config.listeningPort, () =>
{
	gettext.initTranslations();
	sender.configure(bridge.config.internalPort);
	socket.listen(server);

	bridge.createTempDir(() => socket.connectWs());
});

app.use(bodyParser.json());

exports.changePort = function(port)
{
	server.close();

	server = app.listen(port);
	socket.listen(server);
}

function checkMessagePage(req, res)
{
	if(
		bridge.config.receiverType != 'other'
		|| !bridge.selection.filePath
		|| encode.streamProcess
		|| socket.activeConnections > 0
	) {
		res.sendFile(path.join(__dirname + '/../webplayer/message.html'));
		return true;
	}

	if(extract.video.subsProcess || extract.music.coverProcess)
	{
		res.sendFile(path.join(__dirname + '/../webplayer/loading.html'));
		return true;
	}

	return false;
}

function getBrowserName()
{
	if(!userAgent)
		return null;

	var parsedAgent = bowser.parse(userAgent);

	if(parsedAgent && parsedAgent.browser && parsedAgent.browser.name)
		return parsedAgent.browser.name;

	return null;
}

app.get('/', function(req, res)
{
	var lang = req.acceptsLanguages.apply(req, gettext.locales);

	if(lang) gettext.setLocale(lang);
	else gettext.setLocale('en');

	var isMessage = checkMessagePage(req, res);
	if(isMessage) return;

	if(
		bridge.config.receiverType === 'other'
		&& userAgent !== req.headers['user-agent']
	) {
		userAgent = req.headers['user-agent'];
		sender.sendBrowserName(getBrowserName());
	}

	switch(bridge.selection.streamType)
	{
		case 'VIDEO':
			res.sendFile(path.join(__dirname + '/../webplayer/webplayer_direct.html'));
			break;
		case 'MUSIC':
			if(bridge.config.musicVisualizer)
				res.sendFile(path.join(__dirname + '/../webplayer/webplayer_encode.html'));
			else
				res.sendFile(path.join(__dirname + '/../webplayer/webplayer_direct.html'));
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
	if(bridge.selection.addon)
	{
		/* Send to add-on if available, otherwise ignore request */
		if(bridge.addon)
			bridge.addon.fileStream(req, res, bridge.selection, bridge.config);

		return;
	}

	switch(bridge.selection.streamType)
	{
		case 'MUSIC':
			if(bridge.config.musicVisualizer)
				webcreator.encodedStream(req, res);
			else
				webcreator.fileStream(req, res);
			break;
		case 'VIDEO':
		case 'PICTURE':
			webcreator.fileStream(req, res);
			break;
		default:
			webcreator.encodedStream(req, res);
			break;
	}
});

app.get('/subs(webplayer)?', function(req, res)
{
	if(bridge.selection.addon && bridge.selection.subsSrc)
		bridge.addon.subsStream(req, res, bridge.selection, bridge.config);
	else
		webcreator.subsStream(req, res);
});

app.get('/cover', function(req, res)
{
	if(bridge.selection.addon && bridge.selection.coverSrc)
		bridge.addon.coverStream(req, res, bridge.selection, bridge.config);
	else
		webcreator.coverStream(req, res);
});

app.get('/webplayer/webconfig.css', function(req, res)
{
	webcreator.webConfig(req, res);
});

app.get('/temp/*', function(req, res)
{
	if(req.params[0] === 'browser')
		res.send({ name: getBrowserName() });
	else
		webcreator.getTemp(req.params[0], req, res);
});

app.post('/temp/*', function(req, res)
{
	webcreator.postTemp(req.params[0], req, res);
});

app.get('/segment*', function(req, res)
{
	webcreator.hlsStream(req, res);
});

app.use('/webplayer', express.static(__dirname + '/../webplayer'));
app.use('/plyr', express.static(__dirname + '/../node_modules/plyr/dist'));

app.get('/*', function(req, res)
{
	res.redirect('/');
});
