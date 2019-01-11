const fs = require('fs');
const path = require('path');
const player = require('chromecast-player')();
const ip = require('internal-ip').v4.sync();
const spawn = require('child_process').spawn;
const config = require('/tmp/.cast-to-tv.json');
const remotePath = '/tmp/.chromecast-remote.json';
const statusPath = '/tmp/.chromecast-status.json';
const listPath = '/tmp/.chromecast-list.json';
const webUrl = 'http://' + ip + ':' + config.listeningPort + '/cast';
const schemaDir = path.join(__dirname + '/schemas');
const searchTimeout = 4000;
const retryNumber = 2;

var initType = process.argv[2];
var mimeType = process.argv[3];
var remoteContents, statusContents;
var castInterval;
var videoNewPosition;
var loopCounter = 0;
var connectRetry = 0;
var mediaTracks;
var trackIds;

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
	var exist = fs.existsSync(statusPath);
	if(exist) fs.unlinkSync(statusPath);

	exist = fs.existsSync(listPath);
	if(exist) fs.unlinkSync(listPath);

	exist = fs.existsSync(remotePath);
	if(exist) fs.unlinkSync(remotePath);

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
	setEmptyRemoteFile();
	p.close();
	connectRetry = 0;
}

function launchCast()
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
		case 'image/*':
			trackIds = null;
			mediaTracks = null;
			break;
		default:
			console.log(`Unsupported mimeType: ${mimeType}`);
			process.exit();
	}

	player.launch({path: webUrl, type: mimeType, streamType: initType, autoplay: false, ttl: searchTimeout, activeTrackIds: trackIds, media: mediaTracks}, (err, p) => {

		if(err && connectRetry < retryNumber)
		{
			connectRetry++;
			return launchCast();
		}
		else if(p)
		{
			setTimeout(startPlayback, 1200, p);

			castInterval = setInterval(() => {

				remoteContents = require(remotePath);

				p.getStatus(function(err, status)
				{
					if(status && loopCounter % 4 == 0)
					{
						setChromecastStatusFile(status);
					}
					else if(!status || err)
					{
						clearInterval(castInterval);
						castInterval = null;
						p.close();
						process.exit();
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
							closeCast(p);
							return launchCast();
						case 'REPLAY':
							p.seek(0);
							setEmptyRemoteFile();
							break;
						case 'STOP':
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
}
