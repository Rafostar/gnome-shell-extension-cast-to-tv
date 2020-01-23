const fs = require('fs');
const path = require('path');
const debug = require('debug')('bridge');
const server = require('./server');
const sender = require('./sender');
const encode = require('./encode');
const extract = require('./extract');
const remove = require('./remove');
const chromecast = require('./chromecast');
const gnome = require('./gnome');
const controller = require('./remote-controller');
const socket = require('./server-socket');
const addons = require('./addons-importer');
const shared = require('../shared');

process.on('SIGINT', shutDownQuiet);
process.on('SIGTERM', shutDownQuiet);
process.on('uncaughtException', shutDown);

var coverNames = extract.music.getPossibleCoverNames(
	shared.coverNames, shared.coverExtensions
);

gnome.loadSchema();

exports.config = gnome.getTempConfig();
exports.playlist = [];
exports.selection = {};
exports.status = {};
exports.addon = null;
exports.mediaData = {
	coverPath: null,
	title: null,
	isSubsMerged: false
};

sender.configure(exports.config.internalPort);
gnome.showMenu(true);

exports.sendStatus = function(status)
{
	exports.status = {
		playerState: status.playerState,
		currentTime: status.currentTime,
		mediaDuration: status.media.duration,
		volume: status.volume,
		repeat: controller.repeat,
		slideshow: controller.slideshow
	};

	sender.send(exports.status);
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

exports.updateConfig = function(contents)
{
	contents = getParsedContents(contents);
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
			debug(`New playlist append: ${JSON.stringify(playlist)}`);

			playlist.forEach(item =>
			{
				if(!exports.playlist.includes(item))
					exports.playlist.push(item);
			});
		}
		else
			exports.playlist = playlist;

		debug(`Full playlist: ${JSON.stringify(exports.playlist)}`);

		/* Update remote widget with new playlist items */
		if(gnome.isRemote()) gnome.showRemote(true);
	}
	else
		debug('Received playlist is not an array');
}

exports.updateSelection = function(contents)
{
	if(!contents)
		return debug('No selection contents for update');
	else if(!exports.playlist.length)
		return debug('Ignoring selection because playlist is empty');
	else if(typeof contents !== 'object')
		return debug(`Ignoring invalid selection: ${contents}`);

	contents = getParsedContents(contents);

	if(contents !== exports.selection)
	{
		exports.selection = contents;
		debug(`New selection contents: ${JSON.stringify(exports.selection)}`);
	}

	onSelectionUpdate();
}

exports.updateRemote = function(contents)
{
	if(!contents || !contents.action)
		return debug('Invalid update remote contents');

	if(contents.value)
	{
		if(contents.value === 'true') contents.value = true;
		else if(contents.value === 'false') contents.value = false;
	}

	debug(`New remote contents: ${JSON.stringify(contents)}`);
	exports.handleRemoteSignal(contents.action, contents.value);
}

function onSelectionUpdate()
{
	if(exports.selection.streamType !== 'PICTURE')
	{
		var isCleared = controller.clearSlideshow();
		if(isCleared) debug('Cleared slideshow timeout due to non-picture selection');
	}

	/* Close addon before selecting a new one */
	closeAddon(exports.selection, exports.config);

	if(exports.selection.addon)
	{
		exports.addon = addons(exports.selection.addon.toLowerCase());

		if(exports.addon)
			exports.addon.handleSelection(exports.selection, exports.config);

		remove.tempCover();
		remove.tempSubs();
	}
	else if(exports.selection.filePath)
	{
		if(exports.config.receiverType === 'playercast')
			castFile();
		else
		{
			processSelection(err =>
			{
				if(err)
				{
					debug(err);
					return notify('Cast to TV', messages.extractError, bridge.selection.filePath);
				}

				extract.video.subsProcess = false;
				extract.video.coverProcess = false;
				debug('File processed successfully');

				castFile();
			});
		}
	}
}

function castFile()
{
	/* Refresh already visible remote widget to mark new playing item */
	if(gnome.isRemote()) gnome.showRemote(true);

	switch(exports.config.receiverType)
	{
		case 'chromecast':
			chromecast.cast();
			break;
		case 'playercast':
			if(socket.playercasts.length === 0) return;

			/* Temporary workaround for Playercast cover detection */
			exports.mediaData.coverPath = 'muxed_image';

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
			break;
		case 'other':
			socket.emit('processes-done', true);
			break;
		default:
			break;
	}
}

function getParsedContents(contents)
{
	for(var key in contents)
	{
		switch(contents[key])
		{
			case 'true':
				contents[key] = true;
				break;
			case 'false':
				contents[key] = false;
				break;
			case 'null':
				contents[key] = null;
				break;
			default:
				break;
		}
	}

	return contents;
}

function processSelection(cb)
{
	switch(exports.selection.streamType)
	{
		case 'MUSIC':
			remove.tempSubs();
			processMusicSelection(cb);
			break;
		case 'PICTURE':
			exports.mediaData.coverPath = null;
			exports.mediaData.title = null;

			remove.tempCover();
			remove.tempSubs();

			cb(null);
			break;
		default:
			remove.tempCover();
			processVideoSelection(cb);
			break;
	}
}

function processVideoSelection(cb)
{
	extract.video.subsProcess = true;
	exports.mediaData.isSubsMerged = false;
	exports.mediaData.coverPath = null;
	exports.mediaData.title = null;

	if(exports.config.receiverType === 'other')
		socket.emit('reload');

	debug('Processing video file...');

	if(exports.selection.subsPath)
	{
		var subs = path.parse(exports.selection.subsPath);
		var isVtt = (subs.ext.toLowerCase() === '.vtt');

		if(isVtt)
		{
			debug('Selected "vtt" subtitles - no conversion needed');

			if(exports.selection.subsPath !== shared.vttSubsPath)
				remove.tempSubs();

			return cb(null);
		}

		var opts = {
			file: exports.selection.subsPath,
			outPath: shared.vttSubsPath,
			overwrite: true
		};

		extract.video.subsToVtt(opts, (err) =>
		{
			if(err)
			{
				exports.selection.subsPath = "";
				remove.tempSubs();

				return cb(err);
			}

			exports.selection.subsPath = opts.outPath;
			debug('Successfully converted subtitles file');

			return cb(null);
		});
	}
	else
	{
		if(
			!exports.config.extractorReuse
			|| !exports.config.extractorDir
		) {
			return analyzeVideoFile(cb);
		}

		fs.access(exports.config.extractorDir, fs.constants.F_OK, (err) =>
		{
			if(err)
			{
				debug('Could not access reusable subtitles dir');
				return analyzeVideoFile(cb);
			}

			var file = path.parse(exports.selection.filePath);
			var reusePath = path.join(exports.config.extractorDir, file.name + '.vtt');

			fs.access(reusePath, fs.constants.F_OK, (err) =>
			{
				if(err)
				{
					debug('No reusable subtitles file');
					return analyzeVideoFile(cb);
				}

				debug('Found reusable subtitles file');
				exports.selection.subsPath = reusePath;

				return cb(null);
			});
		});
	}
}

function analyzeVideoFile(cb)
{
	extract.analyzeSelection((err, ffprobeData) =>
	{
		if(err)
		{
			exports.selection.subsPath = "";
			remove.tempSubs();

			return cb(err);
		}

		exports.mediaData.isSubsMerged = extract.video.getIsSubsMerged(ffprobeData);

		if(!exports.mediaData.isSubsMerged)
		{
			exports.selection.subsPath = "";
			remove.tempSubs();

			return cb(null);
		}

		var opts = {
			file: exports.selection.filePath,
			outPath: shared.vttSubsPath,
			overwrite: true
		};

		extract.video.videoToVtt(opts, (err) =>
		{
			if(err)
			{
				exports.selection.subsPath = "";
				return cb(err);
			}

			exports.selection.subsPath = opts.outPath;
			debug('Successfully extracted video subtitles');

			return cb(null);
		});
	});
}

function processMusicSelection(cb)
{
	extract.music.coverProcess = true;
	exports.mediaData.isSubsMerged = false;
	exports.selection.subsPath = "";

	if(exports.config.receiverType === 'other')
		socket.emit('reload');

	debug('Processing music file...');

	extract.analyzeSelection((err, ffprobeData) =>
	{
		if(err)
		{
			exports.mediaData.coverPath = null;
			exports.mediaData.title = null;
			remove.tempCover();

			return cb(err);
		}

		var file = path.parse(exports.selection.filePath);
		var metadata = extract.music.getMetadata(ffprobeData);

		if(metadata)
			exports.mediaData.title = metadata.title;
		else
			exports.mediaData.title = file.name;

		if(exports.config.musicVisualizer)
		{
			exports.mediaData.coverPath = null;
			remove.tempCover();
			debug('Music visualizer enabled - skipping cover search');

			return cb(null);
		}

		extract.music.findCoverInDir(file.dir, coverNames, (err, cover) =>
		{
			if(!err)
			{
				exports.mediaData.coverPath = path.join(file.dir, cover);
				debug(`Found cover file in music dir: ${cover}`);
				remove.tempCover();

				return cb(null);
			}

			if(extract.music.getIsCoverMerged(ffprobeData))
			{
				var opts = {
					file: exports.selection.filePath,
					outPath: shared.coverDefault + '.jpg',
					overwrite: true
				};

				extract.music.coverToJpg(opts, (err) =>
				{
					if(err)
					{
						exports.mediaData.coverPath = null;
						return cb(err);
					}

					exports.mediaData.coverPath = opts.outPath;
					debug('Using music cover extracted from file');

					return cb(null);
				});
			}
			else
			{
				exports.mediaData.coverPath = path.join(
					__dirname + '/../webplayer/images/cover.png'
				);
				debug('No cover found - using default image');
				remove.tempCover();

				return cb(null);
			}
		});
	});
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

function shutDown(err)
{
	process.removeListener('SIGINT', shutDownQuiet);
	process.removeListener('SIGTERM', shutDownQuiet);
	process.removeListener('uncaughtException', shutDown);

	if(err) console.error(err);
	else process.stdout.write('\n');

	console.log('Cast to TV: closing node app...');
	controller.clearSlideshow();

	debug('Closing node server');
	sender.stop();
	closeAddon();

	var finish = () =>
	{
		gnome.showMenu(false, () =>
		{
			debug('Removed top bar indicator');

			console.log('Cast to TV: closed successfully');
			process.exit();
		});
	}

	if(gnome.isRemote())
	{
		gnome.showRemote(false);
		exports.handleRemoteSignal('STOP');

		setTimeout(() =>
		{
			/* Remote might be reshown before timeout executes */
			gnome.showRemote(false);
			finish();
		}, 3000);
	}
	else
	{
		finish();
	}
}

function shutDownQuiet()
{
	shutDown(null);
}
