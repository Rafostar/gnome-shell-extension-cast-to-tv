var fs = require('fs');
var watch = require('node-watch');
var server = require('./server');
var encode = require('./encode');
var extract = require('./extract');
var remove = require('./remove');
var chromecast = require('./chromecast');
var gnome = require('./gnome');
var controller = require('./remote-controller');
var socket = require('./server-socket');
var shared = require('../shared');
var remote = require(shared.remotePath);

exports.config = require(shared.configPath);
exports.selection = require(shared.selectionPath);
exports.list = require(shared.listPath);
exports.addon = null;

exports.setStatusFile = function(status)
{
	var statusContents = {
		playerState: status.playerState,
		currentTime: status.currentTime,
		mediaDuration: status.media.duration,
		volume: status.volume
	};

	fs.writeFileSync(shared.statusPath, JSON.stringify(statusContents, null, 1));
}

/* This should not be as aggressive as other watchers */
fs.watchFile(shared.configPath, { interval: 3000 }, (curr, prev) =>
{
	exports.config = getContents(shared.configPath);
	server.refreshConfig();
});

watch(shared.selectionPath, { delay: 0 }, (eventType, filename) =>
{
	if(eventType == 'update')
	{
		exports.selection = getContents(shared.selectionPath);

		if(exports.selection.addon)
		{
			//exports.addon = addons(exports.selection.addon.toLowerCase());
			//if(exports.addon) exports.addon.handleSelection(exports.selection);
		}
		else if(exports.selection.filePath)
		{
			setProcesses();

			if(exports.config.receiverType == 'chromecast') chromecast.cast();
			else if(exports.config.receiverType == 'other') setTimeout(socket.emit, 250, 'reload');
		}
	}
});

watch(shared.listPath, { delay: 0 }, (eventType, filename) =>
{
	if(eventType == 'update')
	{
		exports.list = getContents(shared.listPath);
		gnome.showRemote(false);
	}
});

watch(shared.remotePath, { delay: 0 }, (eventType, filename) =>
{
	if(eventType == 'update')
	{
		remote = getContents(shared.remotePath);

		var action = remote.action;
		var value = remote.value;

		switch(exports.config.receiverType)
		{
			case 'other':
				controller.webControl(action, value);
				break;
			default:
				chromecast.remote(action, value);
				break;
		}
	}
});

function getContents(path)
{
	delete require.cache[path];
	return require(path);
}

function setProcesses()
{
	switch(exports.selection.streamType)
	{
		case 'MUSIC':
			extract.coverProcess = true;
			extract.findCoverFile();
			extract.analyzeFile();
			remove.file(shared.vttSubsPath);
			break;
		case 'PICTURE':
			remove.covers();
			remove.file(shared.vttSubsPath);
			break;
		default:
			extract.subsProcess = true;
			if(exports.selection.subsPath) extract.detectSubsEncoding(exports.selection.subsPath);
			else extract.analyzeFile();
			remove.covers();
			break;
	}
}
