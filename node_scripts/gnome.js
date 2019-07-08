var path = require('path');
var { spawn, spawnSync } = require('child_process');
var gettext = require('./gettext');
var schemaDir = path.join(__dirname + '/../schemas');
var sysLang = process.env.LANG.substring(0, 2);

var gnome =
{
	showRemote: (enable) =>
	{
		spawn('gsettings', ['--schemadir', schemaDir,
			'set', 'org.gnome.shell.extensions.cast-to-tv', 'chromecast-playing', enable]);
	},

	showMenu: (enable) =>
	{
		spawn('gsettings', ['--schemadir', schemaDir,
			'set', 'org.gnome.shell.extensions.cast-to-tv', 'service-enabled', enable]);
	},

	getSetting: (setting) =>
	{
		var gsettings = spawnSync('gsettings', ['--schemadir', schemaDir,
			'get', 'org.gnome.shell.extensions.cast-to-tv', setting]);

		var outStr = String(gsettings.stdout).replace(/\'/g, '').replace(/\n/, '');

		if(outStr == 'true') return true;
		else if(outStr == 'false') return false;
		else return outStr;
	},

	isRemote: () =>
	{
		return gnome.getSetting('chromecast-playing');
	},

	notify: (summary, body) =>
	{
		gettext.setLocale(sysLang);
		spawn('notify-send', [summary, gettext.translate(body)]);
	}
}

module.exports = gnome;
