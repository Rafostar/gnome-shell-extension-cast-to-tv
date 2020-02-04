var websocket = io();

var statusContents = {
	playerState: 'PAUSED',
	currentTime: 0,
	media: { duration: 0 },
	volume: getVolume()
};

function getVolume()
{
	if(typeof player === 'undefined' || player.muted)
		return 0;
	else
		return player.volume;
}

/* Web player related websocket functions */
if(typeof player !== 'undefined')
{
	var progress = 0;
	var playbackStarted = false;

	websocket.emit('webplayer', 'webplayer-ask');

	websocket.on('webplayer-init', msg =>
	{
		preparePlayer(msg);
		addClickListeners();
	});
	player.on('ended', () => websocket.emit('webplayer', 'track-ended'));

	player.on('loadeddata', () =>
	{
		/* Workaround Plyr volume bug */
		player.currentTime = 0;

		statusContents.media.duration = player.duration;
	});

	player.on('canplay', () =>
	{
		if(!playbackStarted) player.play();
	});

	player.on('playing', () =>
	{
		playbackStarted = true;
		statusContents.playerState = 'PLAYING';
		websocket.emit('status-update', statusContents);
	});

	player.on('pause', () =>
	{
		statusContents.playerState = 'PAUSED';
		websocket.emit('status-update', statusContents);
	});

	player.on('seeked', () =>
	{
		progress = 0;
		statusContents.currentTime = player.currentTime;
		websocket.emit('status-update', statusContents);
	});

	player.on('volumechange', () =>
	{
		statusContents.volume = getVolume();
		websocket.emit('status-update', statusContents);
	});

	setInterval(() =>
	{
		statusContents.currentTime = player.currentTime;
		websocket.emit('status-update', statusContents);
	}, 1000);

	websocket.on('remote-signal', msg =>
	{
		switch(msg.action)
		{
			case 'PLAY':
				player.play();
				break;
			case 'PAUSE':
				player.pause();
				break;
			case 'SEEK':
				player.currentTime = statusContents.media.duration * msg.value;
				break;
			case 'SEEK+':
				player.forward(msg.value);
				break;
			case 'SEEK-':
				player.rewind(msg.value);
				break;
			case 'VOLUME':
				player.volume = msg.value;
				break;
			case 'STOP':
				player.stop();
				break;
			default:
				break;
		}
	});
}
else
{
	websocket.emit('show-remote', true);
	websocket.emit('status-update', statusContents);
}

websocket.on('reload', () =>
{
	websocket.disconnect();
	location.reload(true);
});
