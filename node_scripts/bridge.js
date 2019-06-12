var fs = require('fs');
var watch = require('node-watch');
var debug = require('debug')('bridge');
var server = require('./server');
var encode = require('./encode');
var extract = require('./extract');
var remove = require('./remove');
var chromecast = require('./chromecast');
var gnome = require('./gnome');
var controller = require('./remote-controller');
var socket = require('./server-socket');
var addons = require('./addons-importer');
var shared = require('../shared');
var remote = require(shared.remotePath);

var configTimeout;
var playlistTimeout;
var selectionTimeout;

exports.config = require(shared.configPath);
exports.selection = require(shared.selectionPath);
exports.list = require(shared.listPath);
exports.addon = null;
gnome.showMenu(true);

exports.setStatusFile = function(status)
{
	var statusContents = {
		playerState: status.playerState,
		currentTime: status.currentTime,
		mediaDuration: status.media.duration,
		volume: status.volume,
		repeat: controller.repeat
	};

	fs.writeFileSync(shared.statusPath, JSON.stringify(statusContents, null, 1));
}

var watcher = watch(shared.tempDir, { delay: 0 }, (eventType, filename) =>
{
	if(eventType == 'update')
	{
		switch(filename)
		{
			case shared.configPath:
				if(configTimeout) clearTimeout(configTimeout);
				configTimeout = setTimeout(() =>
				{
					updateConfig();
					configTimeout = null;
				}, 250);
				break;
			case shared.listPath:
				if(playlistTimeout) clearTimeout(playlistTimeout);
				playlistTimeout = setTimeout(() =>
				{
					updatePlaylist();
					playlistTimeout = null;
				}, 100);
				break;
			case shared.selectionPath:
				if(selectionTimeout) clearTimeout(selectionTimeout);
				selectionTimeout = setTimeout(() =>
				{
					updateSelection();
					selectionTimeout = null;
				}, 150);
				break;
			case shared.remotePath:
				updateRemote();
				break;
			default:
				break;
		}
	}
});

exports.shutDown = function(err)
{
	if(err) console.log(err);
	else process.stdout.write('\n');

	debug('Closing node server');

	watcher.close();
	debug('Closed file watcher');

	var finish = () =>
	{
		gnome.showMenu(false);
		debug('Removed top bar indicator');

		fs.writeFileSync(shared.selectionPath,
			JSON.stringify({streamType: "", subsPath: "", filePath: ""}, null, 1));

		debug('Cleaned selection temp file');
		process.exit();
	}

	if(gnome.isRemote())
	{
		gnome.showRemote(false);
		handleRemoteSignal('STOP');

		setTimeout(() =>
		{
			/* Remote might be reshown before timeout executes */
			if(gnome.isRemote()) gnome.showRemote(false);
			finish();
		}, 3000);
	}
	else
	{
		finish();
	}
}

function updateConfig()
{
	var configContents = getContents(shared.configPath);
	if(configContents === null) return;

	exports.config = configContents;
	debug(`New config contents: ${JSON.stringify(exports.config)}`);
	server.refreshConfig();
}

function updatePlaylist()
{
	exports.list = getContents(shared.listPath);
	if(exports.list) debug(`New playlist contents: ${JSON.stringify(exports.list)}`);

	gnome.showRemote(false);
}

function updateSelection()
{
	/* Prevent from updating selection while playlist is still read */
	if(playlistTimeout)
	{
		setTimeout(() => updateSelection(), 150);
		return;
	}

	var selectionContents = getContents(shared.selectionPath);
	if(selectionContents === null || exports.list === null) return;

	exports.selection = selectionContents;
	debug(`New selection contents: ${JSON.stringify(exports.selection)}`);

	/* Close addon before selecting a new one */
	closeAddon();

	if(exports.selection.addon)
	{
		exports.addon = addons(exports.selection.addon.toLowerCase());
		if(exports.addon) exports.addon.handleSelection(exports.selection, exports.config);

		remove.covers();
		remove.file(shared.vttSubsPath);
	}
	else if(exports.selection.filePath)
	{
		setProcesses();
	}

	if(exports.selection.filePath)
	{
		if(exports.config.receiverType == 'chromecast') chromecast.cast();
		else if(exports.config.receiverType == 'other') setTimeout(socket.emit, 250, 'reload');
	}
}

function updateRemote()
{
	var remoteContents = getContents(shared.remotePath);
	if(remoteContents === null) return;

	debug(`New remote contents: ${JSON.stringify(remoteContents)}`);
	remote = remoteContents;

	handleRemoteSignal(remote.action, remote.value);
}

function handleRemoteSignal(action, value)
{
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

function getContents(path)
{
	var data;

	delete require.cache[path];

	try { data = require(path); }
	catch(err)
	{
		debug(`Could not read file: ${path}`);
		debug(err);
		data = null
	}

	return data;
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

function closeAddon()
{
	if(exports.addon)
	{
		exports.addon.closeStream();
		exports.addon = null;
	}
}
