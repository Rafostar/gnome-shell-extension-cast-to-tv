var fs = require('fs');
var path = require('path');
var { spawn, spawnSync } = require('child_process');
var debug = require('debug')('gnome');

const schemaDir = path.join(__dirname + '/../schemas');
const isSchema = fs.existsSync(`${schemaDir}/gschemas.compiled`);
debug(`Local setting schema available: ${isSchema}`);

var gnome =
{
	setSetting: function(setting, value)
	{
		var args = ['set', 'org.gnome.shell.extensions.cast-to-tv', setting, value];
		if(isSchema) args.unshift('--schemadir', schemaDir);

		debug(`Set ${setting}: ${value}`);
		spawn('gsettings', args);
	},

	getSetting: function(setting)
	{
		var args = ['get', 'org.gnome.shell.extensions.cast-to-tv', setting];
		if(isSchema) args.unshift('--schemadir', schemaDir);

		var gsettings = spawnSync('gsettings', args);
		var value = String(gsettings.stdout).replace(/\n/, '').replace(/\'/g, '');
		debug(`Get ${setting}: ${value}`);

		return value;
	},

	getBoolean: function(setting)
	{
		var value = this.getSetting(setting);
		return (value === 'true' || value === true) ? true : false;
	},

	getJSON: function(setting)
	{
		var value = this.getSetting(setting);
		return JSON.parse(value);
	},

	showRemote: function(enable)
	{
		this.setSetting('chromecast-playing', enable);
	},

	showMenu: function(enable)
	{
		this.setSetting('service-enabled', enable);
	},

	isRemote: function()
	{
		return this.getBoolean('chromecast-playing');
	}
}

module.exports = gnome;
