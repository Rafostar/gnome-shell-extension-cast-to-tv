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

var watcherReady = false;
var watcherError = false;

var configTimeout;
var playlistTimeout;
var selectionTimeout;
var writeTimeout;

exports.config = gnome.getTempConfig();
exports.selection = require(shared.selectionPath);
exports.playlist = null;
exports.addon = null;
gnome.showMenu(true);

exports.sendStatus = function(status)
{
	var statusContents = {
		playerState: status.playerState,
		currentTime: status.currentTime,
		mediaDuration: status.media.duration,
		volume: status.volume,
		repeat: controller.repeat,
		slideshow: controller.slideshow
	};

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
			case shared.selectionPath:
				if(selectionTimeout) clearTimeout(selectionTimeout);
				selectionTimeout = setTimeout(() =>
				{
					selectionTimeout = null;
					var selectionContents = getContents(shared.selectionPath);
					exports.updateSelection(selectionContents);
				}, 150);
				break;
			default:
				break;
		}
	}
});

watcher.once('ready', () => watcherReady = true);
watcher.once('error', onWatcherError);

sender.configure(exports.config.internalPort);

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

exports.updateConfig = function(contents)
{
	debug(`New config contents: ${JSON.stringify(contents)}`);

	if(contents.listeningPort && contents.listeningPort !== exports.config.listeningPort)
	{
		debug(`Moving server to port: ${contents.listeningPort}`);
		server.changePort(contents.listeningPort);
	}

	if(contents.internalPort && contents.internalPort !== sender.opts.port)
	{
		debug(`Changing sender port to: ${contents.internalPort}`);
		sender.opts.port = contents.internalPort;
	}

	exports.config = { ...exports.config, ...contents };
	debug(`New config: ${JSON.stringify(exports.config)}`);
}

exports.updatePlaylist = function(playlist, append)
{
	if(Array.isArray(playlist))
	{
		if(append && Array.isArray(exports.playlist))
		{
			playlist.forEach(item =>
			{
				if(!exports.playlist.includes(item))
					exports.playlist.push(item);
			});
		}
		else
			exports.playlist = playlist;

		debug(`New playlist contents: ${JSON.stringify(exports.playlist)}`);

		/* Update remote widget with new playlist items */
		if(gnome.isRemote()) gnome.showRemote(true);
	}
}

exports.updateSelection = function(contents)
{
	if(!contents || exports.playlist === null) return;

	exports.selection = contents;
	debug(`New selection contents: ${JSON.stringify(contents)}`);

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

exports.updateRemote = function(contents)
{
	if(contents.value)
	{
		if(contents.value === 'true') contents.value = true;
		else if(contents.value === 'false') contents.value = false;
	}

	debug(`New remote contents: ${JSON.stringify(contents)}`);
	exports.handleRemoteSignal(contents.action, contents.value);
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
