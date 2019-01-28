const isMobile = (/Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Windows Phone/i.test(navigator.userAgent)) ? true : false;
const player = new Plyr('#player', playerOptions);
const httpReq = new XMLHttpRequest();
var enteredFullscreen;
var playerInit;

var subsKind = 'none';
var posterPath = '/webplayer/images/play.png';

httpReq.open("HEAD", '/subswebplayer');
httpReq.send();

httpReq.onreadystatechange = function()
{
	if(this.readyState == 4)
	{
		if(this.status != 204)
		{
			/* Enable subtitles */
			subsKind ='captions';
		}

		setPlyrSource();
	}
}

function setPlyrSource()
{
	var sessionID = makeID();

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
			src: '/subswebplayer',
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

function startPlayer()
{
	/* Workaround Plyr volume bug */
	if(!playerInit)
	{
		player.currentTime = 0;
		playerInit = true;
	}

	/* When on mobile */ 
	if(isMobile)
	{
		/* Enter fullscreen after touch (only once) */
		if(!enteredFullscreen)
		{
			player.fullscreen.enter();
			enteredFullscreen = true;
		}

		/* Play and pause on touch */
		player.togglePlay();
	}
}
