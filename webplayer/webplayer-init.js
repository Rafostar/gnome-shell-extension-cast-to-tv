const isMobile = (/Android|iPhone|iPad|iPod|BlackBerry|webOS|IEMobile|Windows Phone/i.test(navigator.userAgent)) ? true : false;
const player = new Plyr('#player', playerOptions);
const sessionID = makeID();

var subsKind = 'none';
var subsSrc = null;
var posterPath = '/webplayer/images/play.png';

function preparePlayer(msg)
{
	player.config.i18n = msg.i18n;

	/* Show album cover when playing without visualizations */
	if(msg.type == 'MUSIC')
	{
		posterPath = '/cover?session=' + sessionID;
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
