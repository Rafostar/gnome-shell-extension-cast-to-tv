const fs = require('fs');
const castserver = require('./castserver');
const encodesettings = require('./encodesettings');
const shared = require('./sharedsettings');
exports.config = require(shared.configPath);

function getConfig()
{
	delete require.cache[shared.configPath];
	return require(shared.configPath);
}

fs.watchFile(shared.configPath, { interval: 1000 }, (curr, prev) => {
	exports.config = getConfig();

	castserver.refreshConfig();
	encodesettings.refreshConfig();
});
