var path = require('path');
var { spawn, spawnSync } = require('child_process');
var gettext = require('./gettext');
var schemaDir = path.join(__dirname + '/../schemas');
var sysLang = process.env.LANG.substring(0, 2);

exports.showRemote = function(enable)
{
	spawn('gsettings', ['--schemadir', schemaDir,
		'set', 'org.gnome.shell.extensions.cast-to-tv', 'chromecast-playing', enable]);
}

exports.showMenu = function(enable)
{
	spawn('gsettings', ['--schemadir', schemaDir,
		'set', 'org.gnome.shell.extensions.cast-to-tv', 'service-enabled', enable]);
}

exports.isRemote = function()
{
	var gsettings = spawnSync('gsettings', ['--schemadir', schemaDir,
		'get', 'org.gnome.shell.extensions.cast-to-tv', 'chromecast-playing']);

	var outStr = gsettings.stdout.toString().replace(/\'/g, '').replace(/\n/, '');

	if(outStr == 'true') return true;
	else return false;
}

exports.notify = function(summary, body)
{
	gettext.setLocale(sysLang);
	spawn('notify-send', [summary, gettext.translate(body)]);
}
