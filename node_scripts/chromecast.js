var fs = require('fs');
var path = require('path');
var debug = require('debug')('chromecast');
var castPlayer = require('chromecast-player-reloaded')();
var internalIp = require('internal-ip').v4;
var bridge = require('./bridge');
var extract = require('./extract');
var gnome = require('./gnome');
var controller = require('./remote-controller');
var gettext = require('./gettext');
var messages = require('./messages');
var shared = require('../shared');

/* Objects */
var player;
var playerStatus;

/* Chromecast Opts */
var mimeType;
var initType;
var trackIds;
var mediaTracks;

/* Variables */
var playerVolume;
var remoteBusy;
var castInterval;
var connectRetry;
var statusTry;

exports.cast = function()
{
	stopCastInterval();

	debug('NEW SELECTION');

	connectRetry = 0;
	statusTry = 0;

	if(!extract.subsProcess && !extract.coverProcess) return initChromecast();

	debug('Waiting for extract processes to finish...');

	var checkInterval = setInterval(() =>
	{
		/* Cast after extract processes are done */
		if(!extract.subsProcess && !extract.coverProcess)
		{
			debug('Processes finished extracting');

			clearInterval(checkInterval);
			initChromecast();
		}
	}, 100);
}

exports.remote = function(action, value)
{
	if((!remoteBusy && player && player.session) || action == 'STOP')
	{
		try { checkRemoteAction(action, value); }
		catch(err) {
			debug('Remote action error!');
			debug(err);
		}
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

	debug(`Generated new session id: ${text}`);

	return text;
}

function initChromecast()
{
	initType = 'BUFFERED';
	mimeType = 'video/*';

	var ip = internalIp.sync();
	var port = bridge.config.listeningPort;
	var sessionID = makeID();

	switch(bridge.selection.streamType)
	{
		case 'VIDEO':
			break;
		case 'MUSIC':
			if(bridge.config.musicVisualizer) initType = 'LIVE';
			else mimeType = 'audio/*';
			break;
		case 'PICTURE':
			mimeType = 'image/*';
			break;
		default:
			initType = 'LIVE';
			break;
	}

	var getTextTrackStyle = () =>
	{
		const subsConfigPath = path.join(__dirname + '/../config/subtitles.json');
		var exist = fs.existsSync(subsConfigPath);

		if(exist) return JSON.parse(fs.readFileSync(subsConfigPath));
		else return shared.chromecast.subsStyle;
	}

	var getTitle = () =>
	{
		if(mimeType == 'audio/*' && extract.metadata) return extract.metadata.title;
		else if(typeof bridge.selection.title !== 'undefined') return bridge.selection.title;
		else return path.parse(bridge.selection.filePath).name;
	}

	switch(mimeType)
	{
		case 'video/*':
			trackIds = [1];
			mediaTracks = {
				textTrackStyle: getTextTrackStyle(),
				tracks: shared.chromecast.tracks,
				metadata: {
					metadataType: 'GENERIC',
					title: getTitle()
				}
			};
			mediaTracks.tracks[0].trackContentId = `http://${ip}:${port}/subswebplayer?session=${sessionID}`;
			break;
		case 'audio/*':
			trackIds = null;
			mediaTracks = {
				metadata: {
					metadataType: 'MUSIC_TRACK',
					title: getTitle(),
					images: [{url: `http://${ip}:${port}/cover?session=${sessionID}`}]
				}
			};
			break;
		case 'image/*':
			trackIds = null;
			mediaTracks = {
				metadata: {
					metadataType: 'PHOTO',
					title: getTitle()
				}
			};
			break;
	}

	debug(`Media title: ${mediaTracks.metadata.title}`);

	var getAutoplayState = () =>
	{
		if(bridge.selection.streamType == 'MUSIC' && !bridge.config.musicVisualizer) return true;
		else return false;
	}

	var getChromecastName = () =>
	{
		var name = bridge.config.chromecastName ? bridge.config.chromecastName : null;
		return name;
	}

	var getChromecastIp = () =>
	{
		if(bridge.config.chromecastName)
		{
			const devicesPath = path.join(__dirname + '/../config/devices.json');
			var exist = fs.existsSync(devicesPath);

			if(exist)
			{
				var devices = JSON.parse(fs.readFileSync(devicesPath));

				for(var i = 0; i < devices.length; i++)
				{
					if(devices[i].ip && devices[i].name == bridge.config.chromecastName)
					{
						return devices[i].ip;
					}
				}
			}
		}

		return null;
	}

	var castOpts = {
		path: `http://${ip}:${port}/cast?session=${sessionID}`,
		type: mimeType,
		streamType: initType,
		autoplay: getAutoplayState(),
		activeTrackIds: trackIds,
		media: mediaTracks,
		device: getChromecastName(),
		address: getChromecastIp(),
		ttl: shared.chromecast.searchTimeout
	};

	debug(`Setting opts: ${JSON.stringify(castOpts)}`);

	if(player && player.session) loadCast(castOpts);
	else launchCast(castOpts);
}

function launchCast(castOpts)
{
	debug('Launching new cast session...');

	castPlayer.launch(castOpts, (err, p) =>
	{
		if(err && connectRetry < shared.chromecast.retryNumber)
		{
			connectRetry++;
			debug(`Connection timed out. Retries: ${connectRetry}`);
			return launchCast(castOpts);
		}
		else if(!p && connectRetry == shared.chromecast.retryNumber)
		{
			debug('Connection timed out. Retries limit reached');
			gnome.showRemote(false);
			if(err) showTranslatedError(err.message);
		}
		else if(p)
		{
			debug('Launched new session');
			player = p;

			if(player.currentSession)
			{
				debug('Performing new session status check...');

				var statusOk = checkStatusError(player.currentSession);
				if(!statusOk) return closeCast();

				debug('New session OK');
			}

			startCastInterval();
			startPlayback();
		}
	});
}

function loadCast(castOpts)
{
	debug('Trying to load file in current session...');

	player.load(castOpts, (err) =>
	{
		if(!err)
		{
			debug('File successfully loaded');

			startCastInterval();
			startPlayback();
		}
		else
		{
			debug('File could not be loaded');
			launchCast(castOpts);
		}
	});
}

function startCastInterval()
{
	if(!castInterval)
	{
		castInterval = setInterval(() =>
		{
			try { getChromecastStatus(); }
			catch(err) { onIntervalError(); }
		}, 500);

		debug('Started status interval');
	}
}

function stopCastInterval()
{
	if(castInterval)
	{
		clearInterval(castInterval);
		castInterval = null;

		debug('Stopped status interval');
	}
}

function startPlayback()
{
	remoteBusy = false;

	if(mimeType != 'image/*')
	{
		player.getVolume((err, volume) =>
		{
			if(!err)
			{
				playerVolume = volume.level;
				debug(`Obtained volume value: ${volume.level}`);
			}
			else
			{
				playerVolume = 1;
				debug(`Could not obtain volume value. Current setting: ${playerVolume}`);
			}
		});
	}

	if(mimeType == 'video/*')
	{
		var play = () =>
		{
			if(player && player.session)
			{
				player.play(() =>
				{
					debug('Playback started');
					gnome.showRemote(true)
				});
			}
		}

		debug('Starting delayed playback...');

		/* mimeType video + streamType music = music with visualizer */
		/* Visualizations are 60fps, so Chromecast needs to buffer more to not stutter */
		if(bridge.selection.streamType == 'MUSIC') setTimeout(() => play(), shared.chromecast.visualizerBuffer);
		else setTimeout(() => play(), shared.chromecast.videoBuffer);
	}
	else
	{
		if(mimeType != 'image/*') debug('Playback autostart');
		else debug('Showing image');

		gnome.showRemote(true);
	}
}

function onIntervalError()
{
	debug('Interval error!');

	if(player && !player.session)
	{
		stopCastInterval();
		gnome.showRemote(false);
	}
}

function getChromecastStatus()
{
	statusTry++;
	if(statusTry > 5)
	{
		debug('Could not obtain chromecast status!');
		return closeCast();
	}

	/* On connection error callback is not executed */
	player.getStatus((err, status) =>
	{
		statusTry = 0;

		if(err)
		{
			debug(`Chromecast status error: ${err}`);

			showTranslatedError(err.message);
			return closeCast();
		}

		if(status)
		{
			playerStatus = status;
			playerStatus.volume = playerVolume;

			var statusOk = checkStatusError(status);
			if(!statusOk) return closeCast();

			if(!remoteBusy) bridge.setStatusFile(playerStatus);
		}
		else
		{
			debug('No playback status!');
			return closeCast();
		}
	});
}

function checkStatusError(status)
{
	if(status.playerState == 'IDLE' && status.idleReason == 'ERROR')
	{
		debug('Chromecast is IDLE due to ERROR!');

		if(initType == 'LIVE') gnome.notify('Chromecast', messages.chromecast.playError + " " + bridge.selection.filePath);
		else gnome.notify('Chromecast', messages.chromecast.playError + " " + bridge.selection.filePath + '\n' + messages.chromecast.tryAgain);

		return false;
	}

	return true;
}

function showTranslatedError(message)
{
	debug(message[0].toUpperCase() + message.slice(1));

	if(message == 'device not found') gnome.notify('Chromecast', messages.chromecast.notFound);
	else if(message == 'load failed') gnome.notify('Chromecast', messages.chromecast.loadFailed);
}

function closeCast(action)
{
	stopCastInterval();

	var currentTrackID = bridge.list.indexOf(bridge.selection.filePath) + 1;
	var listLastID = bridge.list.length;

	if(action)
	{
		if(action == 'SKIP+') return controller.changeTrack(currentTrackID + 1);
		else if(action == 'SKIP-') return controller.changeTrack(currentTrackID - 1);
	}

	if(controller.repeat && currentTrackID == listLastID) return controller.changeTrack(1);
	else if(action != 'STOP' && currentTrackID < listLastID) return controller.changeTrack(currentTrackID + 1);

	if(player && player.session)
	{
		debug('Closing cast session...');
		player.close();
		debug('Session closed');
	}

	debug('Cast finished!');
	gnome.showRemote(false);
}

function checkRemoteAction(action, value)
{
	if(value || typeof value == 'boolean') debug(`Signal from remote. ACTION: ${action}, VALUE: ${value}`);
	else debug(`Signal from remote. ACTION: ${action}`);

	var position;
	remoteBusy = true;

	var unsetBusy = () => { remoteBusy = false };

	switch(action)
	{
		case 'PLAY':
			player.play((err) =>
			{
				if(!err)
				{
					playerStatus.playerState = 'PLAYING';
					bridge.setStatusFile(playerStatus);
				}
				unsetBusy();
			});
			break;
		case 'PAUSE':
			player.pause((err) =>
			{
				if(!err)
				{
					playerStatus.playerState = 'PAUSED';
					bridge.setStatusFile(playerStatus);
				}
				unsetBusy();
			});
			break;
		case 'SEEK':
			position = playerStatus.media.duration * value;
			player.seek(position, (err) =>
			{
				if(!err)
				{
					playerStatus.currentTime = position;
					bridge.setStatusFile(playerStatus);
				}
				unsetBusy();
			});
			break;
		case 'SEEK+':
			position = playerStatus.currentTime + value;
			if(position < playerStatus.media.duration)
			{
				player.seek(position, (err) =>
				{
					if(!err)
					{
						playerStatus.currentTime = position;
						bridge.setStatusFile(playerStatus);
					}
					unsetBusy();
				});
			}
			break;
		case 'SEEK-':
			position = playerStatus.currentTime - value;
			if(position < 0) position = 0;
			player.seek(position, (err) =>
			{
				if(!err)
				{
					playerStatus.currentTime = position;
					bridge.setStatusFile(playerStatus);
				}
				unsetBusy();
			});
			break;
		case 'SKIP+':
		case 'SKIP-':
			playerStatus.currentTime = 0;
			bridge.setStatusFile(playerStatus);
			return closeCast(action);
			break;
		case 'REPEAT':
			controller.repeat = value;
			unsetBusy();
			break;
		case 'STOP':
			controller.repeat = false;
			if(player && player.session)
			{
				player.stop((err) =>
				{
					if(err) debug(err);

					closeCast(action);
					unsetBusy();
				});
			}
			else
			{
				closeCast(action);
				unsetBusy();
			}
			break;
		case 'VOLUME':
			player.setVolume(parseFloat(value), (err, volume) =>
			{
				if(!err)
				{
					playerVolume = volume.level;
					playerStatus.volume = playerVolume;
					bridge.setStatusFile(playerStatus);
				}
				unsetBusy();
			});
			break;
		default:
			unsetBusy();
			break;
	}
}
