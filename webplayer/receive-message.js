const msgReq = new XMLHttpRequest();
msgReq.open('GET', '/message');
msgReq.send();

msgReq.onreadystatechange = function()
{
	if(this.readyState == 4 && this.status == 200)
	{
		document.getElementById("msg").innerHTML = this.responseText;
	}
}
