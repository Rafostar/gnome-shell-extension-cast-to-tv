var fs = require('fs');
var path = require('path');
var player = require('chromecast-player')();
var internalIp = require('internal-ip').v4;
var bridge = require('./bridge');
var extract = require('./extract');
var remove = require('./remove');
var gnome = require('./gnome');
var gettext = require('./gettext');
var msg = require('./messages.js');
var shared = require('../shared');

/* Chromecast Opts */
var webUrl;
var mimeType;
var initType;
var trackIds;
var mediaTracks;

/* Remote variables */
var remoteAction;
var remoteValue;

var statusContents;
var castInterval;
var connectRetry;
var repeat;
var transcodigEnabled;

exports.cast = function()
{
	var checkInterval = setInterval(() => {

		/* Cast after extract processes are done */
		if(!extract.subsProcess && !extract.coverProcess)
		{
			clearInterval(checkInterval);
			connectRetry = 0;

			if(castInterval)
			{
				/* Close previous process */
				remoteAction = 'REINIT';
				setTimeout(initChromecast, shared.chromecast.relaunchDelay);
			}
			else
			{
				remoteAction = null;
				initChromecast();
			}
		}
	}, 100);
}

exports.remote = function(action, value)
{
	remoteAction = action;
	remoteValue = value;
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
				textTrackStyle: shared.chromecast.subsStyle,
				tracks: shared.chromecast.tracks
			};
			mediaTracks.tracks[0].trackContentId = 'http://' + ip + ':' + port + '/subswebplayer';
			break;
		case 'audio/*':
			trackIds = null;
			mediaTracks = {
				metadata: shared.chromecast.metadata
			};
			mediaTracks.metadata.title = getTitle();
			mediaTracks.metadata.images[0].url = 'http://' + ip + ':' + port + '/cover';
			break;
		case 'image/*':
			trackIds = null;
			mediaTracks = null;
			break;
	}
}

function getTitle()
{
	if(extract.metadata) return extract.metadata.title;
	else return path.parse(bridge.selection.filePath).name;
}

function setStatusFile(status)
{
	statusContents = {
		playerState: status.playerState,
		currentTime: status.currentTime,
		mediaDuration: status.media.duration,
		volume: status.volume
	};

	fs.writeFileSync(shared.statusPath, JSON.stringify(statusContents, null, 1));
}

function launchCast()
{
	var chromecastOpts = getChromecastOpts();

	player.launch(chromecastOpts, (err, p) => {

		if(err && connectRetry < shared.chromecast.retryNumber)
		{
			connectRetry++;
			return launchCast();
		}
		else if(connectRetry == shared.chromecast.retryNumber)
		{
			gnome.showRemote(false);
			if(err) showTranslatedError(err);
		}
		else if(p)
		{
			if(mimeType == 'video/*')
			{
				/* mimeType video + streamType music = music with visualizer */
				/* Visualizations are 60fps, so Chromecast needs to buffer more to not stutter */
				if(bridge.selection.streamType == 'MUSIC') setTimeout(startPlayback, shared.chromecast.visualizerBuffer, p);
				else setTimeout(startPlayback, shared.chromecast.videoBuffer, p);
			}
			else
			{
				gnome.showRemote(true);
			}

			var initStatus = p.currentSession;
			var statusOk = checkStatusError(initStatus);
			if(!statusOk) return closeCast(p);

			castInterval = setInterval(() => {
				try{ getChromecastStatus(p); }
				catch(e){ onIntervalError(p); }
				}, 500);
		}
	});
}

function onIntervalError(p)
{
	if(!p.session)
	{
		clearInterval(castInterval);
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

function startPlayback(p)
{
	if(p.session)
	{
		p.play();
		gnome.showRemote(true);
	}
}

function closeCast(p)
{
	if(castInterval) clearInterval(castInterval);
	castInterval = null;
	p.close();

	var currentTrackID = bridge.list.indexOf(bridge.selection.filePath) + 1;
	var listLastID = bridge.list.length;

	/* Do not change this order mindlessly */
	if(repeat && currentTrackID == listLastID) return bridge.changeTrack(1);
	else if(remoteAction == 'SKIP+') return bridge.changeTrack(currentTrackID + 1);
	else if(remoteAction == 'SKIP-') return bridge.changeTrack(currentTrackID - 1);
	else if(remoteAction == 'REINIT') return;
	else if(remoteAction == 'STOP') return gnome.showRemote(false);
	else if(remoteAction != 'STOP')
	{
		if(currentTrackID < listLastID) return bridge.changeTrack(currentTrackID + 1);
		else gnome.showRemote(false);
	}
}

function getChromecastStatus(p)
{
	p.getStatus(function(err, status)
	{
		if(err)
		{
			showTranslatedError(err);
			return closeCast(p);
		}

		if(status)
		{
			var statusOk = checkStatusError(status);
			if(!statusOk) return closeCast(p);

			if(!remoteAction) setStatusFile(status);
			else checkRemoteAction(p, status);
		}
		else
		{
			return closeCast(p);
		}
	});
}

function checkStatusError(status)
{
	if(status.playerState == 'IDLE' && status.idleReason == 'ERROR')
	{
		if(transcodigEnabled) gnome.notify('Chromecast', msg.chromecast.playError + " " + bridge.selection.filePath);
		else gnome.notify('Chromecast', msg.chromecast.playError + " " + bridge.selection.filePath + '\n' + msg.chromecast.tryAgain);

		return false;
	}

	return true;
}

function showTranslatedError(err)
{
	if(err == 'Error: device not found') gnome.notify('Chromecast', msg.chromecast.notFound);
	else if(err == 'Error: load failed') gnome.notify('Chromecast', msg.chromecast.loadFailed);
}

function checkRemoteAction(p, status)
{
	var position;

	switch(remoteAction)
	{
		case 'PLAY':
			p.play();
			break;
		case 'PAUSE':
			p.pause();
			break;
		case 'SEEK':
			position = status.media.duration * remoteValue;
			p.seek(position);
			break;
		case 'SEEK+':
			position = status.currentTime + remoteValue;
			if(position < status.media.duration) p.seek(position);
			break;
		case 'SEEK-':
			position = status.currentTime - remoteValue;
			if(position > 0) p.seek(position);
			else p.seek(0);
			break;
		case 'SKIP+':
		case 'SKIP-':
			status.currentTime = 0;
			setStatusFile(status);
			return closeCast(p);
		case 'REPEAT':
			repeat = remoteValue;
			break;
		case 'STOP':
			repeat = false;
			return closeCast(p);
		case 'REINIT':
			repeat = false;
			return closeCast(p);
		default:
			break;
	}

	remoteAction = null;
}
