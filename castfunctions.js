const fs = require('fs');
const path = require('path');
const player = require('chromecast-player')();
const ip = require('internal-ip').v4.sync();
const spawn = require('child_process').spawn;
const configPath = '/tmp/.cast-to-tv.json';
const remotePath = '/tmp/.chromecast-remote.json';
const statusPath = '/tmp/.chromecast-status.json';
const listPath = '/tmp/.chromecast-list.json';
const metadataPath = '/tmp/.chromecast-metadata.json';
const schemaDir = path.join(__dirname + '/schemas');
const searchTimeout = 4000;
const retryNumber = 2;

var initType = process.argv[2];
var mimeType = process.argv[3];
var config = require(configPath);
var webUrl = 'http://' + ip + ':' + config.listeningPort + '/cast';
var remoteContents, statusContents;
var castInterval;
var videoNewPosition;
var loopCounter = 0;
var connectRetry = 0;
var mediaTracks;
var trackIds;
var repeat;

const subsStyle = {
	backgroundColor: '#00000000',
	foregroundColor: '#FFFFFFFF',
	edgeType: 'OUTLINE',
	edgeColor: '#000000FF',
	fontScale: 1.0,
	fontStyle: 'NORMAL',
	fontFamily: 'Droid Sans',
	fontGenericFamily: 'SANS_SERIF',
	windowType: 'NONE'
};

switch(initType)
{
	case 'LIVE':
	case 'BUFFERED':
		setEmptyRemoteFile();
		launchCast();
		break;
	default:
		if(!initType) console.log("No streamType specified!");
		else console.log(`Unsupported streamType: ${initType}`);
}

process.on('exit', () => {

	if(castInterval) clearInterval(castInterval);
	showGnomeRemote(false);

	/* Remove all temp files */
	removeExistingFile(statusPath);
	removeExistingFile(listPath);
	removeExistingFile(remotePath);
	removeExistingFile(metadataPath);

	spawn('pkill', ['-SIGINT', '-f', __dirname + '/castserver']);
});

function setEmptyRemoteFile()
{
	remoteContents = {
		action: ''
	};

	fs.writeFileSync(remotePath, JSON.stringify(remoteContents, null, 1));
}

function setChromecastStatusFile(status)
{
	statusContents = {
		playerState: status.playerState,
		currentTime: status.currentTime,
		mediaDuration: status.media.duration,
		volume: status.volume
	};

	fs.writeFileSync(statusPath, JSON.stringify(statusContents, null, 1));
}

function reloadConfigFile()
{
	delete require.cache[configPath];
	config = require(configPath);
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

function setListBegining()
{
	var list = require(listPath);
	var listFirstTrack = list[0];
	config.filePath = listFirstTrack;

	fs.writeFileSync(configPath, JSON.stringify(config, null, 1));
	delete require.cache[listPath];
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
	delete require.cache[metadataPath];
}

function getTitle()
{
	if(fs.existsSync(metadataPath))
	{
		var metadataFile = require(metadataPath);
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
				textTrackStyle: subsStyle,
				tracks: [{
					trackId: 1,
					type: 'TEXT',
					trackContentId: 'http://' + ip + ':' + config.listeningPort + '/subswebplayer',
					trackContentType: 'text/vtt',
					name: 'Subtitles',
					subtype: 'SUBTITLES'
				}]
			};
			break;
		case 'audio/*':
			var songTitle = getTitle();
			mediaTracks = {
				metadata: {
					metadataType: 'MUSIC_TRACK',
					title: songTitle,
					images: [{
						url: 'http://' + ip + ':' + config.listeningPort + '/cover'
					}]
				}
			};
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
	setTimeout(() => {

		reloadConfigFile();
		setMediaTracks();

		var autoplayState = setAutoplay();

		var chromecastOpts = {
			path: webUrl,
			type: mimeType,
			streamType: initType,
			autoplay: autoplayState,
			ttl: searchTimeout,
			activeTrackIds: trackIds,
			media: mediaTracks
		};

		player.launch(chromecastOpts, (err, p) => {

			if(err && connectRetry < retryNumber)
			{
				connectRetry++;
				return launchCast();
			}
			else if(connectRetry == retryNumber)
			{
				process.exit();
			}
			else if(p)
			{
				if(mimeType == 'video/*')
				{
					/* mimeType video + streamType music = music with visualizer */
					/* Visualizations are 60fps, so Chromecast needs to buffer more to not stutter */
					if(config.streamType == 'MUSIC') setTimeout(startPlayback, 6500, p);
					else setTimeout(startPlayback, 1200, p);
				}
				else showGnomeRemote(true);

				castInterval = setInterval(() => {

					remoteContents = require(remotePath);

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
								return launchCast();
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
								if(videoNewPosition < status.media.duration)
								{
									p.seek(videoNewPosition);
								}
								setEmptyRemoteFile();
								break;
							case 'SEEK-':
								videoNewPosition = status.currentTime - remoteContents.value;
								if(videoNewPosition > 0)
								{
									p.seek(videoNewPosition);
								}
								else
								{
									p.seek(0);
								}
								setEmptyRemoteFile();
								break;
							case 'SKIP':
								status.currentTime = 0;
								setChromecastStatusFile(status);
								closeCast(p);
								return launchCast();
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
								return launchCast();
							default:
								break;
						}
					});

					delete require.cache[remotePath];
					loopCounter++;

				}, 250);
			}
		});
	}, 3000);
}
