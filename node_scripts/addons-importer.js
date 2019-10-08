var fs = require('fs');
var path = require('path');
var extensionsPath = path.join(__dirname + '/../..');
var addons = [];

module.exports = function(name)
{
	return addons[name];
}

fs.readdir(extensionsPath, (err, exensions) =>
{
	exensions.forEach(folder =>
	{
		if(folder.startsWith('cast-to-tv') && folder.includes('addon@'))
		{
			var addonPath = path.join(extensionsPath, folder, 'node_scripts/addon');
			var addonName = folder.substring(11, folder.lastIndexOf('-'));

			fs.access(addonPath + '.js', fs.constants.F_OK, (err) =>
			{
				if(!err) addons[addonName] = require(addonPath);
			});
		}
	});
});
