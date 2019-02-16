const isMobile = (/Android|iPhone|iPad|iPod|BlackBerry|webOS|IEMobile|Windows Phone/i.test(navigator.userAgent)) ? true : false;
const player = new Plyr('#player', playerOptions);
const sessionID = makeID();

var playerInit;
var subsKind = 'none';
var subsSrc = null;
var posterPath = '/webplayer/images/play.png';

function preparePlayer(msg)
{
	/* Show album cover when playing without visualizations */
	if(msg.type == 'MUSIC')
	{
		posterPath = '/cover';
	}
	else if(msg.subs)
	{
		/* Enable subtitles */
		subsKind = 'captions';
		subsSrc = '/subswebplayer?session=' + sessionID;
	}

	setPlyrSource();
	addClickListeners();
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

function addClickListeners()
{
	/* Toggle play on click event listener */
	var div = document.getElementsByClassName('plyr__video-wrapper')[0];
	div.addEventListener('click', startPlayer);

	finishInit(event);
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

function finishInit(e)
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
