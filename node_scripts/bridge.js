const fs = require('fs');
const server = require('./server');
const encode = require('./encode');
const shared = require('./shared');
exports.config = require(shared.configPath);
exports.selection = require(shared.selectionPath);

function getConfig()
{
	delete require.cache[shared.configPath];
	return require(shared.configPath);
}

function getSelection()
{
	delete require.cache[shared.selectionPath];
	return require(shared.selectionPath);
}

fs.watchFile(shared.configPath, { interval: 1000 }, (curr, prev) => {

	exports.config = getConfig();

	server.refreshConfig();
});

fs.watchFile(shared.selectionPath, { interval: 1000 }, (curr, prev) => {

	exports.selection = getSelection();

	encode.refreshSelection();
});
