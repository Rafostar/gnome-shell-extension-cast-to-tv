const isMobile = (/Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Windows Phone/i.test(navigator.userAgent)) ? true : false;
const player = new Plyr('#player', playerOptions);
const confReq = new XMLHttpRequest();
const selReq = new XMLHttpRequest();
const subsReq = new XMLHttpRequest();

const sessionID = makeID();

var config;
var playerInit;
var subsKind = 'none';
var subsSrc = null;
var posterPath = '/webplayer/images/play.png';

/* Asynchronous XMLHttpRequests */
subsReq.open('HEAD', '/subswebplayer');
confReq.open('GET', '/config');
selReq.open('GET', '/selection');

confReq.send();
confReq.onreadystatechange = function()
{
	if(this.readyState == 4 && this.status == 200)
	{
		config = JSON.parse(this.responseText);
		selReq.send();
	}
}

selReq.onreadystatechange = function()
{
	if(this.readyState == 4 && this.status == 200)
	{
		var selection = JSON.parse(this.responseText);

		/* Show album cover when playing without visualizations */
		if(selection.streamType == 'MUSIC' && !config.musicVisualizer)
		{
			posterPath = '/cover';
		}

		/* Do not send subtitles request if content is music */
		if(selection.streamType == 'MUSIC')
		{
			setPlyrSource();
			addClickListeners();
		}
		else
		{
			subsReq.send();
		}
	}
}

subsReq.onreadystatechange = function()
{
	if(this.readyState == 4)
	{
		if(this.status == 200)
		{
			/* Enable subtitles */
			subsKind = 'captions';
			subsSrc = '/subswebplayer?session=' + sessionID;
		}

		setPlyrSource();
		addClickListeners();
	}
}

function addClickListeners()
{
	/* Toggle play on click event listener */
	var div = document.getElementsByClassName('plyr__video-wrapper')[0];
	div.addEventListener('click', startPlayer);

	initializePlayer(event);
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
			src: subsSrc,
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
		player.currentTime = 0;
		playerInit = true;

		player.play();
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
