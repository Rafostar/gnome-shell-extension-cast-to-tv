var path = require('path');
var spawn = require('child_process').spawn;
var gettext = require('./gettext');
var schemaDir = path.join(__dirname + '/../schemas');
var sysLang = process.env.LANG.substring(0, 2);

exports.showRemote = function(enable)
{
	spawn('gsettings', ['--schemadir', schemaDir, 'set', 'org.gnome.shell.extensions.cast-to-tv', 'chromecast-playing', enable]);
}

exports.notify = function(summary, body)
{
	gettext.setLocale(sysLang);
	spawn('notify-send', [summary, gettext.translate(body)]);
}
