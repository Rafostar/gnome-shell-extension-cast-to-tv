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
const notify = require('./notify');
const messages = require('./messages.js');
const controller = require('./remote-controller');
const socket = require('./server-socket');
const addons = require('./addons-importer');
const shared = require('../shared');

const mediaDataDefaults = {
	coverPath: null,
	title: null,
	isSubsMerged: false,
	charEnc: null
};

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
exports.mediaData = Object.assign({}, mediaDataDefaults);

exports.setGnomeStatus = function(status)
{
	exports.status = {
		playerState: status.playerState,
		currentTime: status.currentTime,
		mediaDuration: status.media.duration,
		volume: status.volume,
		repeat: controller.repeat,
		slideshow: controller.slideshow
	};

	sender.sendPlaybackStatus(exports.status);
}

exports.setGnomeRemote = function(isShow, cb)
{
	if(!isShow)
		return gnome.showRemote(false, null, cb);

	gnome.showRemote(true, exports.getPlaybackData(), cb);
}

exports.getPlaybackData = function()
{
	var playbackData = {
		isPlaying: gnome.isRemote,
		selection: exports.selection,
		playlist: exports.playlist
	};

	return playbackData;
}

exports.getRemoteButtons = function()
{
	var buttonsData = {
		repeat: controller.repeat,
		slideshow: controller.slideshow
	};

	return buttonsData;
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
	/* Ignore posting same receiver name (nautilus fix) */
	if(Object.keys(contents).length === 1)
	{
		for(var recName of ['chromecastName', 'playercastName'])
		{
			if(contents[recName] && contents[recName] === exports.config[recName])
				return;
		}
	}

	debug(`New config contents: ${JSON.stringify(contents)}`);

	if(contents.listeningPort && contents.listeningPort !== exports.config.listeningPort)
	{
		debug(`Moving server to port: ${contents.listeningPort}`);
		server.changePort(contents.listeningPort);
	}

	if(contents.internalPort)
	{
		if(contents.internalPort !== sender.opts.port)
		{
			debug(`Changing sender port to: ${contents.internalPort}`);
			sender.opts.port = contents.internalPort;
		}

		if(contents.internalPort !== exports.config.internalPort)
		{
			debug(`Changing GNOME websocket port to: ${contents.internalPort}`);
			socket.connectWs(contents.internalPort);
		}
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
		{
			/* Ignore new playlist if it is not different */
			if(
				exports.playlist.length === playlist.length
				&& JSON.stringify(exports.playlist) === JSON.stringify(playlist)
			) {
				return;
			}

			exports.playlist = playlist;
		}

		debug(`Full playlist: ${JSON.stringify(exports.playlist)}`);

		/* Update remote widget with new playlist items */
		if(gnome.isRemote) exports.setGnomeRemote(true);
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

	debug(`New remote contents: ${JSON.stringify(contents)}`);
	exports.handleRemoteSignal(contents.action, contents.value);
}

exports.updateLockScreen = function(contents)
{
	if(!contents || !contents.hasOwnProperty('isLockScreen'))
		return debug('Invalid update lock screen state contents');

	debug(`Received lock screen state: ${contents.isLockScreen}`);

	gnome.isLockScreen = contents.isLockScreen;

	if(!gnome.isLockScreen)
		socket.connectWs();
}

function onSelectionUpdate()
{
	if(exports.selection.streamType !== 'PICTURE')
	{
		var isCleared = controller.clearSlideshow();

		if(isCleared)
			debug('Cleared slideshow timeout due to non-picture selection');
	}

	/* Refresh already visible remote widget to mark new playing item */
	if(gnome.isRemote) exports.setGnomeRemote(true);

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
		processSelection(err =>
		{
			if(err) return notifyFromError(err);

			extract.video.subsProcess = false;
			extract.music.coverProcess = false;
			debug('File processed successfully');

			return castFile();
		});
	}
	else
		debug('No addon and file path in selection!');
}

function castFile()
{
	switch(exports.config.receiverType)
	{
		case 'chromecast':
			chromecast.cast();
			break;
		case 'playercast':
			socket.emit('playercast', {
				name: playercastName,
				mediaData: exports.mediaData,
				...exports.selection
			});
			break;
		case 'other':
			if(exports.selection.streamType !== 'PICTURE')
				socket.emit('processes-done', true);
			else
				socket.emit('reload');
			break;
		default:
			break;
	}
}

function notifyFromError(err)
{
	debug(err);

	if(err.message.includes('FFprobe process error'))
		notify('Cast to TV', messages.ffprobeError, bridge.selection.filePath);
	else if(err.message.includes('FFprobe exec error'))
		notify('Cast to TV', messages.ffprobePath);
	else
		notify('Cast to TV', messages.extractError, bridge.selection.filePath);
}

function processSelection(cb)
{
	exports.mediaData = Object.assign({}, mediaDataDefaults);

	if(exports.config.receiverType === 'playercast')
	{
		remove.tempCover();
		remove.tempSubs();
		return processPlayercastSelection(cb);
	}

	switch(exports.selection.streamType)
	{
		case 'MUSIC':
			remove.tempSubs();
			processMusicSelection(cb);
			break;
		case 'PICTURE':
			remove.tempCover();
			remove.tempSubs();
			cb(null);
			break;
		case 'VIDEO':
		case 'VIDEO_AUDIOENC':
			remove.tempCover();
			processVideoSelection(cb);
			break;
		default:
			remove.tempCover();
			if(exports.config.burnSubtitles)
			{
				remove.tempSubs();
				processVideoTranscode(cb);
			}
			else
				processVideoSelection(cb);
			break;
	}
}

function processVideoSelection(cb)
{
	extract.video.subsProcess = true;

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
			overwrite: true,
			vttparser: true
		};

		debug('Converting subtitles file...');
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
			return analyzeVideoFile(null, cb);
		}

		fs.access(exports.config.extractorDir, fs.constants.F_OK, (err) =>
		{
			if(err)
			{
				debug('Could not access reusable subtitles dir');
				return analyzeVideoFile(null, cb);
			}

			var file = path.parse(exports.selection.filePath);
			var reusePath = path.join(exports.config.extractorDir, file.name + '.vtt');

			fs.access(reusePath, fs.constants.F_OK, (err) =>
			{
				if(err)
				{
					debug('No reusable subtitles file');
					return analyzeVideoFile(reusePath, cb);
				}

				debug('Found reusable subtitles file');
				exports.selection.subsPath = reusePath;

				return cb(null);
			});
		});
	}
}

function processVideoTranscode(cb)
{
	extract.video.subsProcess = true;

	debug('Processing file for transcoding...');

	if(exports.config.receiverType === 'other')
		socket.emit('reload');

	if(exports.selection.subsPath)
	{
		var subs = path.parse(exports.selection.subsPath);
		var isVtt = (subs.ext.toLowerCase() === '.vtt');

		if(isVtt)
		{
			debug('Selected "vtt" subtitles - no conversion needed');
			return cb(null);
		}

		extract.video.getSubsCharEnc(exports.selection.subsPath, (err, charEnc) =>
		{
			if(err) return cb(err);

			debug(`Detected subs char encoding: ${charEnc}`);

			/* ffmpeg uses UTF-8 by default */
			if(charEnc !== 'UTF-8')
				exports.mediaData.charEnc = charEnc;

			return cb(null);
		});
	}
	else
	{
		var ffprobeOpts = {
			ffprobePath : exports.config.ffprobePath,
			filePath: exports.selection.filePath
		};

		extract.analyzeFile(ffprobeOpts, (err, ffprobeData) =>
		{
			if(err) return cb(err);

			exports.mediaData.isSubsMerged = extract.video.getIsSubsMerged(ffprobeData);

			if(exports.mediaData.isSubsMerged)
				debug('Found subtitles merged in file');
			else
				debug('No merged subtitles detected');

			return cb(null);
		});
	}
}

function processMusicSelection(cb)
{
	extract.music.coverProcess = true;

	debug('Processing music file...');

	if(exports.config.receiverType === 'other')
		socket.emit('reload');

	debug('Searching for music cover...');
	analyzeMusicFile((err, parsedFile, ffprobeData) =>
	{
		if(err) return cb(err);

		if(exports.config.musicVisualizer)
		{
			exports.mediaData.coverPath = null;
			remove.tempCover();
			debug('Music visualizer enabled - skipping cover search');

			return cb(null);
		}

		extract.music.findCoverInDir(parsedFile.dir, coverNames, (err, cover) =>
		{
			if(!err)
			{
				exports.mediaData.coverPath = path.join(parsedFile.dir, cover);
				remove.tempCover();
				debug(`Found cover file in music dir: ${cover}`);

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
				remove.tempCover();
				debug('No cover found - using default image');

				return cb(null);
			}
		});
	});
}

function processPlayercastSelection(cb)
{
	debug('Processing playercast file...');

	if(socket.playercasts.length === 0)
		return cb(new Error('No playercasts connected'));

	var playercastName = (exports.config.playercastName) ?
		exports.config.playercastName : socket.playercasts[0];

	if(
		exports.selection.streamType !== 'MUSIC'
		|| exports.config.musicVisualizer
	) {
		return cb(null);
	}

	debug('Searching for music cover...');
	analyzeMusicFile((err, parsedFile, ffprobeData) =>
	{
		if(err) return cb(err);

		if(extract.music.getIsCoverMerged(ffprobeData))
		{
			debug('Found cover merged in file');

			return cb(null);
		}

		extract.music.findCoverInDir(parsedFile.dir, coverNames, (err, cover) =>
		{
			if(!err)
			{
				exports.mediaData.coverPath = path.join(parsedFile.dir, cover);
				debug(`Found cover file in music dir: ${cover}`);

				return cb(null);
			}

			exports.mediaData.coverPath = path.join(
				__dirname + '/../webplayer/images/cover.png'
			);
			debug('No cover found - using default image');

			return cb(null);
		});
	});
}

function analyzeVideoFile(reusePath, cb)
{
	var ffprobeOpts = {
		ffprobePath : exports.config.ffprobePath,
		filePath: exports.selection.filePath
	};

	extract.analyzeFile(ffprobeOpts, (err, ffprobeData) =>
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
			debug('No merged subtitles found');

			return cb(null);
		}

		var opts = {
			file: exports.selection.filePath,
			outPath: reusePath || shared.vttSubsPath,
			overwrite: true,
			vttparser: true
		};

		debug('Extracting video subtitles...');
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

function analyzeMusicFile(cb)
{
	var ffprobeOpts = {
		ffprobePath : exports.config.ffprobePath,
		filePath: exports.selection.filePath
	};

	extract.analyzeFile(ffprobeOpts, (err, ffprobeData) =>
	{
		if(err)
		{
			exports.mediaData.coverPath = null;
			exports.mediaData.title = null;
			remove.tempCover();

			return cb(err);
		}

		var parsedFile = path.parse(exports.selection.filePath);
		var metadata = extract.music.getMetadata(ffprobeData);

		if(metadata)
		{
			debug('Obtained music metadata');
			exports.mediaData.title = metadata.title;
		}
		else
		{
			debug('No music metadata');
			exports.mediaData.title = parsedFile.name;
		}

		return cb(null, parsedFile, ffprobeData);
	});
}

function closeAddon(selection, config)
{
	if(!exports.addon) return;

	exports.addon.closeStream(selection, config);
	exports.addon = null;
	debug('Closed Add-on');
}

function shutDown(err)
{
	process.removeListener('SIGINT', shutDownQuiet);
	process.removeListener('SIGTERM', shutDownQuiet);
	process.removeListener('uncaughtException', shutDown);

	if(err) console.error(err);
	else process.stdout.write('\n');

	console.log('Cast to TV: closing node app...');
	encode.enabled = false;
	sender.enabled = false;
	controller.clearSlideshow();

	debug('Closing node server');
	closeAddon();

	const finish = function()
	{
		console.log('Cast to TV: closed successfully');

		var code = (err) ? 1 : 0;
		process.exit(code);
	}

	if(gnome.isRemote)
	{
		exports.handleRemoteSignal('STOP');

		/* Give receiver time to stop playback */
		return setTimeout(() => finish(), 3000);
	}

	finish();
}

function shutDownQuiet()
{
	shutDown(null);
}
