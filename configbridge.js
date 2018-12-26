const fs = require('fs');
const castserver = require('./castserver');
const encodesettings = require('./encodesettings');
const configPath = '/tmp/.cast-to-tv.json';
exports.config = require(configPath);

function getConfig()
{
	delete require.cache[configPath];
	return require(configPath);
}

fs.watchFile(configPath, { interval: 1000 }, (curr, prev) => {
	exports.config = getConfig();

	castserver.refreshConfig();
	encodesettings.refreshConfig();
});
