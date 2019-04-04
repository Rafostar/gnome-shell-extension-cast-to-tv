var fs = require('fs');
var path = require('path');
var castPlayer = require('chromecast-player')();
var internalIp = require('internal-ip').v4;
var bridge = require('./bridge');
var extract = require('./extract');
var remove = require('./remove');
var gnome = require('./gnome');
var controller = require('./remote-controller');
var gettext = require('./gettext');
var messages = require('./messages.js');
var shared = require('../shared');

/* Objects */
var player;
var playerStatus;

/* Chromecast Opts */
var webUrl;
var mimeType;
var initType;
var trackIds;
var mediaTracks;

/* Remote variables */
var remoteAction;
var remoteValue;

var castInterval;
var connectRetry;
var transcodigEnabled;

exports.cast = function()
{
	var checkInterval = setInterval(() =>
	{
		/* Cast after extract processes are done */
		if(!extract.subsProcess && !extract.coverProcess)
		{
			clearInterval(checkInterval);
			connectRetry = 0;

			if(castInterval)
			{
				/* Close previous process */
				remoteAction = 'REINIT';
				controller.repeat = false;
				closeCast();
			}

			initChromecast();
		}
	}, 100);
}

exports.remote = function(action, value)
{
	remoteAction = action;
	remoteValue = value;

	if(player) checkRemoteAction(playerStatus);
}

function initChromecast()
{
	var ip = internalIp.sync();
	var port = bridge.config.listeningPort;

	webUrl = 'http://' + ip + ':' + port + '/cast';
	initType = 'BUFFERED';
	remoteAction = null;
	remoteValue = null;

	switch(bridge.selection.streamType)
	{
		case 'VIDEO':
			mimeType = 'video/*';
			transcodigEnabled = false;
			break;
		case 'MUSIC':
			checkVisualizer();
			break;
		case 'PICTURE':
			mimeType = 'image/*';
			transcodigEnabled = false;
			break;
		default:
			mimeType = 'video/*';
			initType = 'LIVE';
			transcodigEnabled = true;
			break;
	}

	setMediaTracks(ip, port);
	launchCast();
}

function checkVisualizer()
{
	if(bridge.config.musicVisualizer)
	{
		mimeType = 'video/*';
		initType = 'LIVE';
		transcodigEnabled = true;
		return;
	}

	mimeType = 'audio/*';
	transcodigEnabled = false;
}

function setMediaTracks(ip, port)
{
	switch(mimeType)
	{
		case 'video/*':
			trackIds = [1];
			mediaTracks = {
				textTrackStyle: getTextTrackStyle(),
				tracks: shared.chromecast.tracks
			};
			mediaTracks.tracks[0].trackContentId = 'http://' + ip + ':' + port + '/subswebplayer';
			break;
		case 'audio/*':
			trackIds = null;
			mediaTracks = {
				metadata: {
					metadataType: 'MUSIC_TRACK',
					title: getTitle(),
					images: [{url: 'http://' + ip + ':' + port + '/cover'}]
				}
			};
			break;
		case 'image/*':
			trackIds = null;
			mediaTracks = null;
			break;
	}
}

function getTextTrackStyle()
{
	const subsConfigPath = '../config/subtitles.json';
	var exist = fs.existsSync(subsConfigPath);

	if(exist) return JSON.parse(fs.readFileSync(subsConfigPath));
	else return shared.chromecast.subsStyle;
}

function getTitle()
{
	if(extract.metadata) return extract.metadata.title;
	else return path.parse(bridge.selection.filePath).name;
}

function launchCast()
{
	var chromecastOpts = getChromecastOpts();

	castPlayer.launch(chromecastOpts, (err, p) => {

		if(err && connectRetry < shared.chromecast.retryNumber)
		{
			connectRetry++;
			return launchCast();
		}
		else if(connectRetry == shared.chromecast.retryNumber)
		{
			gnome.showRemote(false);
			if(err) showTranslatedError(err.message);
		}
		else if(p)
		{
			player = p;

			if(mimeType == 'video/*')
			{
				/* mimeType video + streamType music = music with visualizer */
				/* Visualizations are 60fps, so Chromecast needs to buffer more to not stutter */
				if(bridge.selection.streamType == 'MUSIC') setTimeout(startPlayback, shared.chromecast.visualizerBuffer);
				else setTimeout(startPlayback, shared.chromecast.videoBuffer);
			}
			else
			{
				gnome.showRemote(true);
			}

			var initStatus = player.currentSession;
			var statusOk = checkStatusError(initStatus);
			if(!statusOk) return closeCast();

			castInterval = setInterval(() => {
				try{ getChromecastStatus(); }
				catch(e){ onIntervalError(); }
				}, 500);
		}
	});
}

function onIntervalError()
{
	if(player && !player.session)
	{
		if(castInterval) clearInterval(castInterval);
		castInterval = null;
		gnome.showRemote(false);
	}
}

function getChromecastOpts()
{
	var autoplayState = setAutoplay();
	var chromecastName = getChromecastName();

	var opts = {
		path: webUrl,
		type: mimeType,
		streamType: initType,
		autoplay: autoplayState,
		activeTrackIds: trackIds,
		media: mediaTracks,
		device: chromecastName,
		ttl: shared.chromecast.searchTimeout
	};

	return opts;
}

function setAutoplay()
{
	if(bridge.selection.streamType == 'MUSIC' && !bridge.config.musicVisualizer) return true;
	else return false;
}

function getChromecastName()
{
	var name = bridge.config.chromecastName;
	if(!name) name = null;

	return name;
}

function startPlayback()
{
	if(player.session)
	{
		player.play();
		gnome.showRemote(true);
	}
}

function closeCast()
{
	if(castInterval) clearInterval(castInterval);
	castInterval = null;

	if(player) player.close();
	player = null;

	var currentTrackID = bridge.list.indexOf(bridge.selection.filePath) + 1;
	var listLastID = bridge.list.length;

	/* Do not change this order mindlessly */
	if(controller.repeat && currentTrackID == listLastID) return controller.changeTrack(1);
	else if(remoteAction == 'SKIP+') return controller.changeTrack(currentTrackID + 1);
	else if(remoteAction == 'SKIP-') return controller.changeTrack(currentTrackID - 1);
	else if(remoteAction == 'REINIT') return;
	else if(remoteAction == 'STOP') return gnome.showRemote(false);
	else if(remoteAction != 'STOP')
	{
		if(currentTrackID < listLastID) return controller.changeTrack(currentTrackID + 1);
		else gnome.showRemote(false);
	}
}

function getChromecastStatus()
{
	player.getStatus(function(err, status)
	{
		if(err)
		{
			showTranslatedError(err.message);
			return closeCast();
		}

		if(status)
		{
			playerStatus = status;

			var statusOk = checkStatusError(status);
			if(!statusOk) return closeCast();

			if(!remoteAction) bridge.setStatusFile(status);
		}
		else
		{
			return closeCast();
		}
	});
}

function checkStatusError(status)
{
	if(status.playerState == 'IDLE' && status.idleReason == 'ERROR')
	{
		if(transcodigEnabled) gnome.notify('Chromecast', messages.chromecast.playError + " " + bridge.selection.filePath);
		else gnome.notify('Chromecast', messages.chromecast.playError + " " + bridge.selection.filePath + '\n' + messages.chromecast.tryAgain);

		return false;
	}

	return true;
}

function showTranslatedError(message)
{
	if(message == 'device not found') gnome.notify('Chromecast', messages.chromecast.notFound);
	else if(message == 'load failed') gnome.notify('Chromecast', messages.chromecast.loadFailed);
}

function checkRemoteAction(status)
{
	var position;

	switch(remoteAction)
	{
		case 'PLAY':
			player.play();
			break;
		case 'PAUSE':
			player.pause();
			break;
		case 'SEEK':
			position = status.media.duration * remoteValue;
			player.seek(position);
			break;
		case 'SEEK+':
			position = status.currentTime + remoteValue;
			if(position < status.media.duration) player.seek(position);
			break;
		case 'SEEK-':
			position = status.currentTime - remoteValue;
			if(position > 0) player.seek(position);
			else player.seek(0);
			break;
		case 'SKIP+':
		case 'SKIP-':
			status.currentTime = 0;
			bridge.setStatusFile(status);
			return closeCast();
		case 'REPEAT':
			controller.repeat = remoteValue;
			break;
		case 'STOP':
			controller.repeat = false;
			return closeCast();
		default:
			break;
	}

	remoteAction = null;
}
