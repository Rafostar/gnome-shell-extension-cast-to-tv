var fs = require('fs');
var path = require('path');
var { spawn, spawnSync } = require('child_process');

const schemaDir = path.join(__dirname + '/../schemas');
const isSchema = fs.existsSync(`${schemaDir}/gschemas.compiled`);

var gnome =
{
	setSetting: function(setting, value)
	{
		var args = ['set', 'org.gnome.shell.extensions.cast-to-tv', setting, value];
		if(isSchema) args.unshift('--schemadir', schemaDir);

		spawn('gsettings', args);
	},

	getSetting: function(setting)
	{
		var args = ['get', 'org.gnome.shell.extensions.cast-to-tv', setting];
		if(isSchema) args.unshift('--schemadir', schemaDir);

		var gsettings = spawnSync('gsettings', args);
		return String(gsettings.stdout).replace(/\n/, '').replace(/\'/g, '');
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
