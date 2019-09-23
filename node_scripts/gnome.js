var fs = require('fs');
var path = require('path');
var { spawn, spawnSync } = require('child_process');
var gettext = require('./gettext');
var schemaDir = path.join(__dirname + '/../schemas');
var sysLang = process.env.LANG.substring(0, 2);

if(!fs.existsSync(`${schemaDir}/gschemas.compiled`))
{
	schemaDir = null;
}

var gnome =
{
	setSetting: (setting, value) =>
	{
		var args = ['set', 'org.gnome.shell.extensions.cast-to-tv', setting, value];
		if(schemaDir) args.unshift('--schemadir', schemaDir);

		spawn('gsettings', args);
	},

	getSetting: (setting) =>
	{
		var args = ['get', 'org.gnome.shell.extensions.cast-to-tv', setting];
		if(schemaDir) args.unshift('--schemadir', schemaDir);

		var gsettings = spawnSync('gsettings', args);
		return String(gsettings.stdout).replace(/\n/, '');
	},

	getBoolean: (setting) =>
	{
		var value = gnome.getSetting(setting).replace(/\'/g, '');
		return (value === 'true' || value === true) ? true : false;
	},

	getJSON: (setting) =>
	{
		var value = gnome.getSetting(setting);
		return JSON.parse(value);
	},

	showRemote: (enable) =>
	{
		gnome.setSetting('chromecast-playing', enable);
	},

	showMenu: (enable) =>
	{
		gnome.setSetting('service-enabled', enable);
	},

	isRemote: () =>
	{
		return gnome.getBoolean('chromecast-playing');
	},

	notify: (summary, body) =>
	{
		gettext.setLocale(sysLang);
		spawn('notify-send', [summary, gettext.translate(body)]);
	}
}

module.exports = gnome;
