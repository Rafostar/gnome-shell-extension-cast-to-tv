var subtitlesConfig = document.getElementById("subtitles");
const httpReq = new XMLHttpRequest();

/* Check if server has available subtitles */
httpReq.open("HEAD", '/subswebplayer');
httpReq.send();

httpReq.onreadystatechange = function()
{
	if(this.readyState == 4 && this.status != 204)
	{
		/* Enable subtitles */
		subtitlesConfig.kind = "captions";
	}
}
