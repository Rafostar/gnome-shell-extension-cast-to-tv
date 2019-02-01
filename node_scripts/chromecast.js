const fs = require('fs');
const path = require('path');
const player = require('chromecast-player')();
const ip = require('internal-ip').v4.sync();
const spawn = require('child_process').spawn;
const schemaDir = path.join(__dirname + '/schemas');

var shared = require('./shared');
var initType = process.argv[2];
var mimeType = process.argv[3];
var config = require(shared.configPath);
var webUrl = 'http://' + ip + ':' + config.listeningPort + '/cast';
var remoteContents, statusContents;
var castInterval;
var videoNewPosition;
var loopCounter = 0;
var connectRetry = 0;
var mediaTracks;
var trackIds;
var repeat;

switch(mimeType)
{
	case 'video/*':
	case 'audio/*':
	case 'image/*':
		break;
	default:
		if(!mimeType) console.log("No mimeType specified!");
		else console.log(`Unsupported mimeType: ${mimeType}`);
}

switch(initType)
{
	case 'LIVE':
	case 'BUFFERED':
		setEmptyRemoteFile();
		setTimeout(launchCast, shared.chromecast.launchDelay);
		break;
	default:
		if(!initType) console.log("No streamType specified!");
		else console.log(`Unsupported streamType: ${initType}`);
}

process.on('exit', () => {

	if(castInterval) clearInterval(castInterval);
	showGnomeRemote(false);

	/* Remove all temp files */
	removeExistingFile(shared.statusPath);
	removeExistingFile(shared.listPath);
	removeExistingFile(shared.remotePath);
	removeExistingFile(shared.metadataPath);
	removeCoverFiles();

	spawn('pkill', ['-SIGINT', '-f', __dirname + '/server']);
});

function setEmptyRemoteFile()
{
	remoteContents = {
		action: ''
	};

	fs.writeFileSync(shared.remotePath, JSON.stringify(remoteContents, null, 1));
}

function setChromecastStatusFile(status)
{
	statusContents = {
		playerState: status.playerState,
		currentTime: status.currentTime,
		mediaDuration: status.media.duration,
		volume: status.volume
	};

	fs.writeFileSync(shared.statusPath, JSON.stringify(statusContents, null, 1));
}

function reloadConfigFile()
{
	delete require.cache[shared.configPath];
	config = require(shared.configPath);
}

function removeExistingFile(fileToRemove)
{
	if(fs.existsSync(fileToRemove))
	{
		fs.unlink(fileToRemove, (err) => {
			if(err) throw err;
		});
	}
}

function removeCoverFiles()
{
	shared.coverExtensions.forEach(function(ext)
	{
		removeExistingFile(shared.coverDefault + ext);
	});
}

function setListBegining()
{
	var list = require(shared.listPath);
	var listFirstTrack = list[0];
	config.filePath = listFirstTrack;

	fs.writeFileSync(shared.configPath, JSON.stringify(config, null, 1));
	delete require.cache[shared.listPath];
}

function showGnomeRemote(enable)
{
	spawn('gsettings', ['--schemadir', schemaDir, 'set', 'org.gnome.shell.extensions.cast-to-tv', 'chromecast-playing', enable]);
}

function startPlayback(p)
{
	p.play();
	showGnomeRemote(true);
}

function closeCast(p)
{
	clearInterval(castInterval);
	castInterval = null;
	setEmptyRemoteFile();
	p.close();
	connectRetry = 0;
	delete require.cache[shared.metadataPath];
}

function getTitle()
{
	if(fs.existsSync(shared.metadataPath))
	{
		var metadataFile = require(shared.metadataPath);
		return metadataFile.title;
	}

	return path.parse(config.filePath).name;
}

function setAutoplay()
{
	if(config.streamType == 'MUSIC' && !config.musicVisualizer) return true;
	else return false;
}

function setMediaTracks()
{
	switch(mimeType)
	{
		case 'video/*':
			trackIds = [1];
			mediaTracks = {
				textTrackStyle: shared.chromecast.subsStyle,
				tracks: shared.chromecast.tracks
			};
			mediaTracks.tracks[0].trackContentId = 'http://' + ip + ':' + config.listeningPort + '/subswebplayer';
			break;
		case 'audio/*':
			mediaTracks = {
				metadata: shared.chromecast.metadata
			};
			mediaTracks.metadata.title = getTitle();
			mediaTracks.metadata.images[0].url = 'http://' + ip + ':' + config.listeningPort + '/cover';
			break;
		case 'image/*':
			trackIds = null;
			mediaTracks = null;
			break;
		default:
			console.log(`Unsupported mimeType: ${mimeType}`);
			process.exit();
	}
}

function launchCast()
{
	reloadConfigFile();
	setMediaTracks();

	var autoplayState = setAutoplay();

	var chromecastOpts = {
		path: webUrl,
		type: mimeType,
		streamType: initType,
		autoplay: autoplayState,
		ttl: shared.chromecast.searchTimeout,
		activeTrackIds: trackIds,
		media: mediaTracks
	};

	player.launch(chromecastOpts, (err, p) => {

		if(err && connectRetry < shared.chromecast.retryNumber)
		{
			connectRetry++;
			return launchCast();
		}
		else if(connectRetry == shared.chromecast.retryNumber)
		{
			process.exit();
		}
		else if(p)
		{
			if(mimeType == 'video/*')
			{
				/* mimeType video + streamType music = music with visualizer */
				/* Visualizations are 60fps, so Chromecast needs to buffer more to not stutter */
				if(config.streamType == 'MUSIC') setTimeout(startPlayback, shared.chromecast.visualizerBuffer, p);
				else setTimeout(startPlayback, shared.chromecast.videoBuffer, p);
			}
			else showGnomeRemote(true);

			castInterval = setInterval(() => {

				remoteContents = require(shared.remotePath);

				p.getStatus(function(err, status)
				{
					if(status && loopCounter % 2 == 0)
					{
						setChromecastStatusFile(status);
					}
					else if(!status || err)
					{
						closeCast(p);

						if(repeat)
						{
							setListBegining();
							/* Refresh Remote Menu */
							showGnomeRemote(false);
							showGnomeRemote(true);
							return setTimeout(launchCast, shared.chromecast.launchDelay);
						}
						else
						{
							process.exit();
						}
					}

					switch(remoteContents.action)
					{
						case 'PLAY':
							p.play();
							setEmptyRemoteFile();
							break;
						case 'PAUSE':
							p.pause();
							setEmptyRemoteFile();
							break;
						case 'SEEK':
							videoNewPosition = status.media.duration * remoteContents.value;
							p.seek(videoNewPosition.toFixed(3));
							setEmptyRemoteFile();
							break;
						case 'SEEK+':
							videoNewPosition = status.currentTime + remoteContents.value;
							if(videoNewPosition < status.media.duration) p.seek(videoNewPosition);
							setEmptyRemoteFile();
							break;
						case 'SEEK-':
							videoNewPosition = status.currentTime - remoteContents.value;
							if(videoNewPosition > 0) p.seek(videoNewPosition);
							else p.seek(0);
							setEmptyRemoteFile();
							break;
						case 'SKIP':
							status.currentTime = 0;
							setChromecastStatusFile(status);
							closeCast(p);
							if(mimeType == 'image/*') return launchCast();
							return setTimeout(launchCast, shared.chromecast.launchDelay);
						case 'REPEAT':
							repeat = remoteContents.value;
							setEmptyRemoteFile();
							break;
						case 'STOP':
							repeat = false;
							p.stop();
							setEmptyRemoteFile();
							break;
						case 'RELOAD':
							mimeType = remoteContents.mimeType;
							initType = remoteContents.initType;
							closeCast(p);
							showGnomeRemote(false);
							if(mimeType == 'image/*') return launchCast();
							return setTimeout(launchCast, shared.chromecast.launchDelay);
						default:
							break;
					}
				});

				delete require.cache[shared.remotePath];
				loopCounter++;

			}, 250);
		}
	});
}
