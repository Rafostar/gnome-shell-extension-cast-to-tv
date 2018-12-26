const isMobile = (/Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Windows Phone/i.test(navigator.userAgent)) ? true : false;
const player = new Plyr('#player', playerOptions);

function startPlayer()
{
	/* When on mobile */ 
	if(isMobile)
	{
		/* Enter fullscreen after touch */
		player.fullscreen.enter();
	}
}
