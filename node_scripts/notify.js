var gettext = require('./gettext');
var { spawn } = require('child_process');
const sysLang = process.env.LANG.substring(0, 2);

module.exports = function(summary, body)
{
	gettext.setLocale(sysLang);
	spawn('notify-send', [summary, gettext.translate(body)]);
}
