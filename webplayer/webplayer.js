const isMobile = (/Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Windows Phone/i.test(navigator.userAgent)) ? true : false;
const player = new Plyr('#player', playerOptions);
const subsReq = new XMLHttpRequest();
const configReq = new XMLHttpRequest();
const sessionID = makeID();

var playerInit;
var subsKind = 'none';
var posterPath = '/webplayer/images/play.png';

/* Asynchronous XMLHttpRequests */
subsReq.open('HEAD', '/subswebplayer');
configReq.open('GET', '/config');

configReq.send();
configReq.onreadystatechange = function()
{
	if(this.readyState == 4 && this.status == 200)
	{
		var config = JSON.parse(this.responseText);

		if(config.streamType == 'MUSIC' && !config.musicVisualizer)
		{
			posterPath = '/cover';
		}

		subsReq.send();
	}
}

subsReq.onreadystatechange = function()
{
	if(this.readyState == 4)
	{
		if(this.status == 200)
		{
			/* Enable subtitles */
			subsKind ='captions';
		}

		setPlyrSource();
		addClickListeners();
	}
}

function addClickListeners()
{
	/* Toggle play on click event listener */
	var div = document.getElementsByClassName('plyr__video-wrapper')[0];
	div.addEventListener('click', initializePlayer);
	div.addEventListener('click', startPlayer);

	var button = document.querySelector('.plyr__controls button[data-plyr="play"]');
	button.addEventListener('click', initializePlayer);

	document.body.addEventListener('keydown', initializePlayer);
}

function setPlyrSource()
{
	player.source = {
		type: 'video',
		title: 'Cast to TV',
		sources: [{
			src: '/cast?session=' + sessionID,
			type: 'video/mp4'
		}],
		poster: posterPath,
		tracks: [{
			kind: subsKind,
			label: 'Subtitles',
			srclang: 'en',
			src: '/subswebplayer?session=' + sessionID,
			default: true
		}]
	};
}

function makeID()
{
	var text = "";
	var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

	for(var i = 0; i < 10; i++)
	{
		text += possible.charAt(Math.floor(Math.random() * possible.length));
	}

	return text;
}

function initializePlayer(e)
{
	/* Workaround Plyr volume bug */
	if(!playerInit)
	{
		if(!e.code || e.code == 'Space')
		{
			player.currentTime = 0;
			playerInit = true;
		}
	}
}

function startPlayer()
{
	/* When on mobile */ 
	if(isMobile)
	{
		if(!player.fullscreen.active)
		{
			/* Enter fullscreen after touch (when paused) */
			player.fullscreen.enter();

			if(!player.playing) player.togglePlay();
			return;
		}
	}

	/* Play and pause on click/touch */
	player.togglePlay();
}
