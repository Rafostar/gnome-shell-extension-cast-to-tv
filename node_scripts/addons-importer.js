const fs = require('fs');
const path = require('path');
const debug = require('debug')('addons-importer');
const extensionsPath = path.join(__dirname + '/../..');

var addons = [];

module.exports = function(name)
{
	return addons[name];
}

fs.readdir(extensionsPath, (err, extensions) =>
{
	extensions.forEach(folder =>
	{
		if(!folder.startsWith('cast-to-tv') || !folder.includes('addon@'))
			return;

		debug(`Addon folder: ${folder}`);

		var addonPath = path.join(extensionsPath, folder, 'node_scripts/addon');
		debug(`Addon path: ${addonPath}`);

		var addonName = folder.substring(11, folder.lastIndexOf('-'));
		debug(`Addon name: ${addonName}`);

		fs.access(addonPath + '.js', fs.constants.F_OK, (err) =>
		{
			if(err) return debug(err);

			addons[addonName] = require(addonPath);
			debug(`Imported: ${addonName}`);
		});
	});
});
