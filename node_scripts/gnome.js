var path = require('path');
var spawn = require('child_process').spawn;
var schemaDir = path.join(__dirname + '/../schemas');

exports.showRemote = function(enable)
{
	spawn('gsettings', ['--schemadir', schemaDir, 'set', 'org.gnome.shell.extensions.cast-to-tv', 'chromecast-playing', enable]);
}
