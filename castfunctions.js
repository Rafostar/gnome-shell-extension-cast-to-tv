const fs = require('fs');
const path = require('path');
const player = require('chromecast-player')();
const ip = require('internal-ip').v4.sync();
const spawn = require('child_process').spawn;
const config = require('/tmp/.cast-to-tv.json');
const remotePath = '/tmp/.chromecast-remote.json';
const statusPath = '/tmp/.chromecast-status.json';
const webUrl = 'http://' + ip + ':' + config.listeningPort + '/cast';
const schemaDir = path.join(__dirname + '/schemas');
const initType = process.argv[2];
const searchTimeout = 4000;
const retryNumber = 2;

var remoteContents, statusContents;
var castInterval;
var videoNewPosition;
var loopCounter = 0;
var connectRetry = 0;

switch(initType)
{
	case 'LIVE':
	case 'BUFFERED':
		setEmptyRemoteFile();
		launchCast();
		break;
	default:
		if(!initType)
		{
			console.log("No streamType specified!");
		}
		return;
}

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

function launchCast()
{
	player.launch({path: webUrl, streamType: initType, ttl: searchTimeout}, (err, p) => {

		if(err && connectRetry < retryNumber)
		{
			connectRetry++;
			return launchCast();
		}
		else if(err && connectRetry == retryNumber)
		{
			showGnomeRemote(false);
		}

		p.once('playing', () => {

			showGnomeRemote(true);

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
						fs.unlinkSync(statusPath);
						showGnomeRemote(false);
						clearInterval(castInterval);
						p.close();
						return;
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
							p.seek(remoteContents.value);
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
						case 'REPLAY':
							p.seek(0);
							setEmptyRemoteFile();
							break;
						case 'STOP':
							p.stop();
							setEmptyRemoteFile();
							break;
						default:
							break;
					}
				});

				delete require.cache[remotePath];
				loopCounter++;

			}, 250);
		});
	});
}
