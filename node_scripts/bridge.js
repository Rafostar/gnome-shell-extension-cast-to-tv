var fs = require('fs');
var watch = require('node-watch');
var debug = require('debug')('bridge');
var server = require('./server');
var sender = require('./sender');
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

var watcherReady = false;
var watcherError = false;

var configTimeout;
var playlistTimeout;
var selectionTimeout;
var writeTimeout;

exports.config = require(shared.configPath);
exports.selection = require(shared.selectionPath);
exports.playlist = require(shared.listPath);
exports.addon = null;
gnome.showMenu(true);

exports.setStatusFile = function(status)
{
	var statusContents = {
		playerState: status.playerState,
		currentTime: status.currentTime,
		mediaDuration: status.media.duration,
		volume: status.volume,
		repeat: controller.repeat,
		slideshow: controller.slideshow
	};

	fs.writeFileSync(shared.statusPath, JSON.stringify(statusContents, null, 1));
	sender.send(statusContents);
}

exports.handleRemoteSignal = function(action, value)
{
	switch(exports.config.receiverType)
	{
		case 'chromecast':
			chromecast.remote(action, value);
			break;
		default:
			controller.webControl(action, value);
			break;
	}
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
					configTimeout = null;
					updateConfig();
				}, 125);
				break;
			case shared.listPath:
				if(playlistTimeout) clearTimeout(playlistTimeout);
				playlistTimeout = setTimeout(() =>
				{
					playlistTimeout = null;
					updatePlaylist();
				}, 100);
				break;
			case shared.selectionPath:
				if(selectionTimeout) clearTimeout(selectionTimeout);
				selectionTimeout = setTimeout(() =>
				{
					selectionTimeout = null;
					updateSelection();
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

watcher.once('ready', () => watcherReady = true);
watcher.once('error', onWatcherError);

sender.configure(exports.config);

function onWatcherError(err)
{
	watcherError = true;
	exports.shutDown(err);
}

exports.shutDown = function(err)
{
	if(err) console.error(err);
	else process.stdout.write('\n');

	console.log('Cast to TV: closing node app...');
	controller.clearSlideshow();

	debug('Closing node server');
	sender.stop();
	closeAddon();

	var finish = () =>
	{
		watcher.close();
		debug('Closed file watcher');

		gnome.showMenu(false, () =>
		{
			debug('Removed top bar indicator');

			fs.writeFileSync(shared.selectionPath,
				JSON.stringify({streamType: "", subsPath: "", filePath: ""}, null, 1));

			debug('Cleaned selection temp file');

			console.log('Cast to TV: closed successfully');
			process.exit();
		});
	}

	var closeWatcher = () =>
	{
		if(watcherReady || watcherError) finish();
		else watcher.once('ready', finish);
	}

	if(gnome.isRemote())
	{
		gnome.showRemote(false);
		exports.handleRemoteSignal('STOP');

		setTimeout(() =>
		{
			/* Remote might be reshown before timeout executes */
			gnome.showRemote(false);
			closeWatcher();
		}, 3000);
	}
	else
	{
		closeWatcher();
	}
}

exports.writePlayercasts = function()
{
	if(writeTimeout)
	{
		clearTimeout(writeTimeout);
		writeTimeout = null;
	}

	writeTimeout = setTimeout(() =>
	{
		writeTimeout = null;

		fs.writeFile(shared.playercastsPath, JSON.stringify(socket.playercasts), (err) =>
		{
			if(err)
			{
				var nextRetry = 60000;
				console.error('Could not write Playercasts to temp file! ' +
					`Next retry in ${nextRetry/1000} seconds.`
				);
				setTimeout(() => exports.writePlayercasts(), nextRetry);
			}
		});
	}, 1000);
}

function updateConfig()
{
	var configContents = getContents(shared.configPath);
	if(configContents === null) return;

	if(exports.config.listeningPort !== configContents.listeningPort)
		sender.configure(configContents);

	exports.config = configContents;
	debug(`New config contents: ${JSON.stringify(exports.config)}`);
	server.refreshConfig();
}

function updatePlaylist()
{
	exports.playlist = getContents(shared.listPath);

	if(exports.playlist)
		debug(`New playlist contents: ${JSON.stringify(exports.playlist)}`);

	/* Update remote widget with new playlist items */
	if(gnome.isRemote()) gnome.showRemote(true);
}

function updateSelection()
{
	/* Prevent updating selection while playlist is still being read */
	if(playlistTimeout)
	{
		setTimeout(() => updateSelection(), 150);
		return;
	}

	var selectionContents = getContents(shared.selectionPath);
	if(selectionContents === null || exports.playlist === null) return;

	exports.selection = selectionContents;
	debug(`New selection contents: ${JSON.stringify(exports.selection)}`);

	if(exports.selection.streamType !== 'PICTURE')
	{
		controller.clearSlideshow();
		debug('Cleared slideshow timeout due to non-picture selection');
	}

	/* Close addon before selecting a new one */
	closeAddon(exports.selection, exports.config);

	if(exports.selection.addon)
	{
		exports.addon = addons(exports.selection.addon.toLowerCase());

		if(exports.addon)
			exports.addon.handleSelection(exports.selection, exports.config);

		remove.covers();
		remove.file(shared.vttSubsPath);
	}
	else if(exports.selection.filePath && exports.config.receiverType !== 'playercast')
	{
		setProcesses();
	}

	if(exports.selection.filePath)
	{
		/* Refresh already visible remote widget to mark new playing item */
		if(gnome.isRemote()) gnome.showRemote(true);

		switch(exports.config.receiverType)
		{
			case 'chromecast':
				chromecast.cast();
				break;
			case 'playercast':
				if(socket.playercasts.length > 0)
				{
					/* Temporary workaround for Playercast cover detection */
					extract.coverPath = 'muxed_image';

					var playercastName = (exports.config.playercastName) ?
						exports.config.playercastName : socket.playercasts[0];

					if(
						exports.selection.streamType === 'MUSIC'
						&& !exports.config.musicVisualizer
						&& !exports.addon
					) {
						extract.checkCoverIncluded(isIncluded =>
						{
							if(!isIncluded) extract.findCoverFile();

							socket.emit('playercast', {
								name: playercastName,
								...exports.selection
							});
						});
					}
					else
					{
						socket.emit('playercast', {
							name: playercastName,
							...exports.selection
						});
					}
				}
				break;
			case 'other':
				setTimeout(socket.emit, 250, 'reload');
				break;
			default:
				break;
		}
	}
}

function updateRemote()
{
	var remoteContents = getContents(shared.remotePath);
	if(remoteContents === null) return;

	debug(`New remote contents: ${JSON.stringify(remoteContents)}`);
	remote = remoteContents;

	exports.handleRemoteSignal(remote.action, remote.value);
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
			if(exports.selection.subsPath)
				extract.detectSubsEncoding(exports.selection.subsPath);
			else
				extract.analyzeFile();
			remove.covers();
			break;
	}
}

function closeAddon(selection, config)
{
	if(exports.addon)
	{
		exports.addon.closeStream(selection, config);
		exports.addon = null;
		debug('Closed Add-on');
	}
}
