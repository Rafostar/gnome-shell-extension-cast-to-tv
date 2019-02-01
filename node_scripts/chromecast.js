var fs = require('fs');
var path = require('path');
var player = require('chromecast-player')();
var internalIp = require('internal-ip').v4;
var spawn = require('child_process').spawn;
var schemaDir = path.join(__dirname + '/../schemas');
var bridge = require('./bridge');
var extract = require('./extract');
var remove = require('./remove');
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

var castInterval;
var loopCounter = 0;
var connectRetry = 0;
var repeat;

exports.cast = function()
{
	var checkInterval = setInterval(() => {

		/* Cast after extract processes are done */
		if(!extract.subsProcess && !extract.coverProcess)
		{
			clearInterval(checkInterval);

			if(castInterval) remoteAction = 'RELOAD';
			initChromecast();
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
			break;
		case 'MUSIC':
			checkVisualizer();
			break;
		case 'PICTURE':
			mimeType = 'image/*';
			break;
		default:
			mimeType = 'video/*';
			initType = 'LIVE';
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
		return;
	}

	mimeType = 'audio/*';
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
	var statusContents = {
		playerState: status.playerState,
		currentTime: status.currentTime,
		mediaDuration: status.media.duration,
		volume: status.volume
	};

	fs.writeFileSync(shared.statusPath, JSON.stringify(statusContents, null, 1));
}

function setListBeginning()
{
	bridge.selection.filePath = bridge.list[0];
	fs.writeFileSync(shared.selectionPath, JSON.stringify(bridge.selection, null, 1));
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
			//process.exit();
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
				showGnomeRemote(true);
			}

			castInterval = setInterval(() => { statusInterval(p) }, 500);
		}
	});
}

function showGnomeRemote(enable)
{
	spawn('gsettings', ['--schemadir', schemaDir, 'set', 'org.gnome.shell.extensions.cast-to-tv', 'chromecast-playing', enable]);
}

function getChromecastOpts()
{
	var autoplayState = setAutoplay();

	var opts = {
		path: webUrl,
		type: mimeType,
		streamType: initType,
		autoplay: autoplayState,
		ttl: shared.chromecast.searchTimeout,
		activeTrackIds: trackIds,
		media: mediaTracks
	};

	return opts;
}

function setAutoplay()
{
	if(bridge.selection.streamType == 'MUSIC' && !bridge.config.musicVisualizer) return true;
	else return false;
}

function startPlayback(p)
{
	p.play();
	showGnomeRemote(true);
}

function closeCast(p)
{
	if(castInterval) clearInterval(castInterval);
	castInterval = null;
	p.close();
	loopCounter = 0;
	connectRetry = 0;

	if(repeat)
	{
		var trackID = bridge.list.indexOf(bridge.selection.filePath);
		var listLastID = bridge.list.length - 1;

		if(trackID == listLastID) setListBeginning();
	}
	else
	{
		showGnomeRemote(false);
	}
}

function statusInterval(p)
{
	//console.log('INTERVAL');
	p.getStatus(function(err, status)
	{
		if(status) setStatusFile(status);
		else if(!status || err) return closeCast(p);

		checkRemoteAction(p, status);
	});

	loopCounter++;
}

function checkRemoteAction(p, status)
{
	if(remoteAction)
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
				p.seek(position.toFixed(3));
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
			case 'SKIP':
				status.currentTime = 0;
				setStatusFile(status);
				closeCast(p);
				break;
			case 'REPEAT':
				repeat = remoteValue;
				break;
			case 'STOP':
				repeat = false;
				showGnomeRemote(false);
				closeCast(p);
				break;
			case 'RELOAD':
				showGnomeRemote(false);
				closeCast(p);
				break;
			default:
				break;
		}

		remoteAction = null;
	}
}
