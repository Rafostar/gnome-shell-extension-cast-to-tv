const isMobile = (/Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Windows Phone/i.test(navigator.userAgent)) ? true : false;
const player = new Plyr('#player', playerOptions);
var enteredFullscreen;
var playerInit;

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
