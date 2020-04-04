const gettext = require('./gettext');
const { spawn } = require('child_process');

const sysLang = process.env.LANG.substring(0, 2);

module.exports = function(summary, mainBody, data, infoBody)
{
	if(!summary || !mainBody) return;

	gettext.setLocale(sysLang);
	mainBody = gettext.translate(mainBody);

	if(data && typeof data === 'string')
		mainBody += ` ${data}`;

	if(infoBody && typeof infoBody === 'string')
		mainBody += '.\n' + gettext.translate(infoBody) + '.';

	spawn('notify-send', [
		'-i', 'tv-symbolic',
		'-u', 'normal',
		summary, mainBody
	]);

	console.log(summary + ': ' + mainBody);
}
