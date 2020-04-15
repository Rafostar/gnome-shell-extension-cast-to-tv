const path = require('path');
const debug = require('debug');
const debugCast = debug('chromecast');
const debugStatus = debug('chromecast:status');
const chromecast = require('chromecast-controller');
const internalIp = require('internal-ip').v4;
const bridge = require('./bridge');
const controller = require('./remote-controller');
const gnome = require('./gnome');
const notify = require('./notify');
const messages = require('./messages');
const shared = require('../shared');

var playerStatus = {};
var playerVolume = 1;
var remoteBusy = false;
var delayCount = 0;
var castInterval;
var playTimeout;
var initType;

exports.cast = function()
{
	remoteBusy = true;

	clearPlayTimeout();
	stopCastInterval();

	if(chromecast._player)
	{
		chromecast._player.removeListener('close', finishCast);
		chromecast._player.removeListener('status', handleChromecastStatus);
	}

	debugCast('NEW SELECTION');
	initChromecast();
}

exports.remote = function(action, value)
{
	if(remoteBusy) return;

	if(!isNaN(value) || typeof value === 'boolean')
		debugCast(`Signal from remote. ACTION: ${action}, VALUE: ${value}`);
	else
		debugCast(`Signal from remote. ACTION: ${action}`);

	var position;
	remoteBusy = true;

	var unsetBusy = () => remoteBusy = false;

	switch(action)
	{
		case 'PLAY':
			chromecast.play(err =>
			{
				if(!err)
				{
					playerStatus.playerState = 'PLAYING';
					bridge.setGnomeStatus(playerStatus);
				}
				unsetBusy();
			});
			break;
		case 'PAUSE':
			chromecast.pause(err =>
			{
				if(!err)
				{
					playerStatus.playerState = 'PAUSED';
					bridge.setGnomeStatus(playerStatus);
				}
				unsetBusy();
			});
			break;
		case 'SEEK':
			position = playerStatus.media.duration * value;
			chromecast.seek(position, (err) =>
			{
				if(!err)
				{
					playerStatus.currentTime = position;
					bridge.setGnomeStatus(playerStatus);
				}
				unsetBusy();
			});
			break;
		case 'SEEK+':
			position = playerStatus.currentTime + value;
			if(position < playerStatus.media.duration)
			{
				chromecast.seek(position, (err) =>
				{
					if(!err)
					{
						playerStatus.currentTime = position;
						bridge.setGnomeStatus(playerStatus);
					}
					unsetBusy();
				});
			}
			break;
		case 'SEEK-':
			position = playerStatus.currentTime - value;
			if(position < 0) position = 0;
			chromecast.seek(position, (err) =>
			{
				if(!err)
				{
					playerStatus.currentTime = position;
					bridge.setGnomeStatus(playerStatus);
				}
				unsetBusy();
			});
			break;
		case 'SKIP+':
		case 'SKIP-':
			playerStatus.currentTime = 0;
			bridge.setGnomeStatus(playerStatus);
			return closeCast(action);
			break;
		case 'REPEAT':
			controller.repeat = value;
			unsetBusy();
			break;
		case 'STOP':
			controller.repeat = false;
			controller.slideshow = false;
			chromecast.stop(err =>
			{
				if(err) debugCast(err);

				closeCast(action);
				unsetBusy();
			});
			break;
		case 'VOLUME':
			chromecast.setVolume(parseFloat(value), (err, volume) =>
			{
				if(!err)
				{
					playerVolume = volume.level;
					playerStatus.volume = playerVolume;
					bridge.setGnomeStatus(playerStatus);
				}
				unsetBusy();
			});
			break;
		case 'SLIDESHOW':
			controller.slideshow = value;
			if(controller.slideshow)
				controller.setSlideshow();
			else
				controller.clearSlideshow();
			unsetBusy();
			break;
		default:
			unsetBusy();
			break;
	}
}

function makeID()
{
	var text = "";
	var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

	for(var i = 0; i < 10; i++)
	{
		text += possible.charAt(Math.floor(Math.random() * possible.length));
	}

	debugCast(`Generated new session id: ${text}`);

	return text;
}

function initChromecast()
{
	var mimeType = 'video/*';
	var trackIds = [];
	var mediaTracks = null;
	var ip = internalIp.sync();
	var port = bridge.config.listeningPort;
	var sessionID = makeID();

	initType = 'BUFFERED';

	switch(bridge.selection.streamType)
	{
		case 'VIDEO':
			break;
		case 'MUSIC':
			if(bridge.config.musicVisualizer)
				initType = 'LIVE';
			else
				mimeType = 'audio/*';
			break;
		case 'PICTURE':
			mimeType = 'image/*';
			break;
		default:
			if(bridge.selection.hlsStream)
				mimeType = 'application/x-mpegurl';

			initType = 'LIVE';
			break;
	}

	var getTitle = () =>
	{
		if(mimeType === 'audio/*' && bridge.mediaData.title)
			return bridge.mediaData.title;
		else if(bridge.selection.title)
			return bridge.selection.title;
		else
			return path.parse(bridge.selection.filePath).name;
	}

	switch(mimeType)
	{
		case 'video/*':
			mediaTracks = {
				metadata: {
					metadataType: 1,
					images: [{url: ''}]
				}
			};

			if(!bridge.selection.subsPath)
				break;

			trackIds = [1];
			mediaTracks.textTrackStyle = {
				...shared.chromecast.subsStyle,
				...bridge.config.chromecastSubtitles
			};
			mediaTracks.tracks = shared.chromecast.tracks;
			mediaTracks.tracks[0].trackContentId = `http://${ip}:${port}/subswebplayer?session=${sessionID}`;
			break;
		case 'audio/*':
			mediaTracks = {
				metadata: {
					metadataType: 3,
					images: [{url: `http://${ip}:${port}/cover?session=${sessionID}`}]
				}
			};
			break;
		case 'image/*':
			mediaTracks = {
				metadata: {
					metadataType: 4,
					images: [{url: ''}]
				}
			};
			break;
		default:
			mediaTracks = {
				metadata: {
					metadataType: 1,
					images: [{url: ''}]
				}
			};
			break;
	}

	mediaTracks.metadata.title = getTitle();
	debugCast(`Media title: ${mediaTracks.metadata.title}`);

	var getAutoplayState = () =>
	{
		switch(bridge.selection.streamType)
		{
			case 'MUSIC':
				return (bridge.config.musicVisualizer) ? false : true;
			case 'LIVE':
				return true;
			default:
				return false;
		}
	}

	var getChromecastName = () =>
	{
		return (bridge.config.chromecastName) ? bridge.config.chromecastName : null;
	}

	var getChromecastIp = () =>
	{
		if(!bridge.config.chromecastName)
			return null;

		var devices = bridge.config.chromecastDevices;

		if(!Array.isArray(devices))
			return null;

		var foundDevice = devices.find(dev =>
			(dev.ip && dev.name === bridge.config.chromecastName)
		);

		return (foundDevice) ? foundDevice.ip : null;
	}

	var media = {
		contentId: `http://${ip}:${port}/cast?session=${sessionID}`,
		contentType: mimeType,
		streamType: initType,
		...mediaTracks
	};

	if(debug.enabled)
		debugCast(`Setting media: ${JSON.stringify(media)}`);

	var castOpts = {
		autoplay: getAutoplayState(),
		activeTrackIds: trackIds,
		name: getChromecastName(),
		ip: getChromecastIp()
	};

	if(debug.enabled)
		debugCast(`Setting opts: ${JSON.stringify(castOpts)}`);

	launchCast(media, castOpts);
}

function launchCast(media, castOpts)
{
	debugCast('Casting...');

	chromecast.cast(media, castOpts, (err) =>
	{
		if(err)
		{
			debugCast(`Could not cast: ${err.message}`);
			return showTranslatedError(err, castOpts);
		}

		chromecast._player.once('close', finishCast);
		chromecast._player.on('status', handleChromecastStatus);

		debugCast('Cast started');
		startPlayback(media);
	});
}

function startCastInterval()
{
	if(castInterval) return;

	castInterval = setInterval(() => getChromecastStatus(), 1000);
	debugCast('Started status interval');
}

function stopCastInterval()
{
	if(!castInterval) return;

	clearInterval(castInterval);
	castInterval = null;

	debugCast('Stopped status interval');
}

function clearPlayTimeout()
{
	if(!playTimeout) return;

	clearTimeout(playTimeout);
	playTimeout = null;

	debugCast('Stopped delayed playback');
}

function startPlayback(media)
{
	remoteBusy = false;
	var mimeType = media.contentType;

	/* Get startup volume level when not casting picture */
	if(mimeType !== 'image/*')
	{
		chromecast.getVolume((err, volume) =>
		{
			if(!err)
			{
				playerVolume = volume;
				return debugCast(`Obtained volume value: ${volume}`);
			}

			playerVolume = 1;
			debugCast(`Could not obtain volume value. Current setting: ${playerVolume}`);
		});
	}

	/* Delay playback to allow media buffer a little */
	if(mimeType === 'video/*' && !media.autoplay)
	{
		var play = () =>
		{
			playTimeout = null;

			chromecast.play(err =>
			{
				if(err)
				{
					debugCast('Could not play!');
					debugCast(err);
					return closeCast();
				}

				debugCast('Playback started');
				startCastInterval();
				/* Refresh is handled in bridge.js */
				if(!gnome.isRemote) bridge.setGnomeRemote(true);
			});
		}

		debugCast('Starting delayed playback...');

		/* mimeType video + streamType music = music with visualizer */
		/* Visualizations are 60fps, so Chromecast needs to buffer more to not stutter */
		var delay = (bridge.selection.streamType === 'MUSIC') ?
			shared.chromecast.visualizerBuffer : shared.chromecast.videoBuffer;

		playTimeout = setTimeout(() => play(), delay);
	}
	else
	{
		if(mimeType === 'image/*')
		{
			debugCast('Showing image');
			if(controller.slideshow)
			{
				controller.setSlideshow();
				debugCast('Started slideshow timer');
			}
		}
		else
			debugCast('Playback autostart');

		startCastInterval();

		/* Refresh is handled in bridge.js */
		if(!gnome.isRemote) bridge.setGnomeRemote(true);
	}
}

function getChromecastStatus()
{
	chromecast.getStatus((err, status) =>
	{
		if(err)
		{
			debugCast(`Chromecast status error: ${err}`);
			return showTranslatedError(err);
		}
		else if(status && typeof status === 'object')
		{
			handleChromecastStatus(status);
		}
	});
}

function handleChromecastStatus(status)
{
	if(debug.enabled)
	{
		debugStatus('Got Chromecast status');
		debugStatus(status);
	}

	playerStatus = { ...playerStatus, ...status };
	playerStatus.volume = playerVolume;

	if(!playerStatus.media)
	{
		playerStatus.currentTime = 0;
		playerStatus.media = { duration: 1 };
	}

	if(status.playerState === 'IDLE')
	{
		switch(status.idleReason)
		{
			case 'ERROR':
				/* Show error and close */
				showIdleError();
			case 'FINISHED':
				return closeCast();
			default:
				break;
		}
	}

	if(bridge.selection.maxLiveDelay)
		checkLiveDelay(status);

	if(!remoteBusy)
		bridge.setGnomeStatus(playerStatus);
}

function checkLiveDelay(status)
{
	if(
		remoteBusy
		|| status.playerState !== 'PLAYING'
		|| !status.liveSeekableRange
		|| isNaN(status.currentTime)
		|| isNaN(status.liveSeekableRange.end)
	)
		return delayCount = 0;

	var currTime = status.currentTime;
	var buffTime = status.liveSeekableRange.end;

	if(buffTime < currTime)
		return delayCount = 0;

	var currDelay = (buffTime - currTime).toFixed(1);
	debugCast(`Current stream delay: ${currDelay} sec`);

	if(currDelay > bridge.selection.maxLiveDelay)
	{
		if(delayCount < 5)
		{
			delayCount++;
			return debugCast(`Delay observed: ${delayCount} times`);
		}

		remoteBusy = true;

		debugCast('Reducing stream delay...');
		chromecast.seek(buffTime, () => remoteBusy = false);
	}

	/* This has to be cleared after seek */
	delayCount = 0;
}

function showIdleError()
{
	debugCast('Chromecast is IDLE due to ERROR!');

	var info = (initType === 'LIVE' && !bridge.addon) ? messages.chromecast.tryAgain : null;
	notify('Chromecast', messages.chromecast.playError, bridge.selection.filePath, info);
}

function showTranslatedError(err, opts)
{
	var msg = err.message.toLowerCase();
	var info = null;
	debugCast(err);

	opts = opts || {};

	switch(msg)
	{
		case 'device not found':
			notify('Chromecast', messages.chromecast.notFound);
			break;
		case 'load failed':
			notify('Chromecast', messages.chromecast.loadFailed);
			break;
		case 'connection timeout!':
			info = (opts.ip) ? messages.chromecast.verifyIp : null;
			notify('Chromecast', messages.chromecast.connectFailed, null, info);
			break;
		default:
			debugCast(`Unhandled message: ${msg}`);
			break;
	}
}

/* Normal close from app */
function closeCast(action)
{
	clearPlayTimeout();
	stopCastInterval();
	controller.clearSlideshow();

	chromecast._player.removeListener('close', finishCast);
	chromecast._player.removeListener('status', handleChromecastStatus);

	var currentTrackID = bridge.playlist.indexOf(bridge.selection.filePath) + 1;
	var listLastID = bridge.playlist.length;

	if(action)
	{
		if(action == 'SKIP+')
			return controller.changeTrack(currentTrackID + 1);
		else if(action == 'SKIP-')
			return controller.changeTrack(currentTrackID - 1);
	}

	if(controller.repeat && currentTrackID === listLastID)
		return controller.changeTrack(1);
	else if(action !== 'STOP' && currentTrackID < listLastID)
		return controller.changeTrack(currentTrackID + 1);

	debugCast('Closing cast session...');
	chromecast.close(err =>
	{
		if(!err) debugCast('Session closed');
		else debugCast('Could not close session!');

		bridge.setGnomeRemote(false);
		debugCast('Cast finished!');
	});
}

/* Close by external event */
function finishCast()
{
	clearPlayTimeout();
	stopCastInterval();
	controller.clearSlideshow();

	/* 'close' listener is auto removed as it is a 'once' event performed here */
	chromecast._player.removeListener('status', handleChromecastStatus);

	bridge.setGnomeRemote(false);
	debugCast('Cast finished due to close event!');
}
