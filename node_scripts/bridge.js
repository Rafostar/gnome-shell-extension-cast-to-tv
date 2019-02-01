var fs = require('fs');
var server = require('./server');
var encode = require('./encode');
var extract = require('./extract');
var chromecast = require('./chromecast');
var shared = require('../shared');
exports.config = require(shared.configPath);
exports.selection = require(shared.selectionPath);
exports.list = require(shared.listPath);
exports.remote = require(shared.remotePath);

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

function getList()
{
	delete require.cache[shared.listPath];
	return require(shared.listPath);
}

function getRemote()
{
	delete require.cache[shared.remotePath];
	return require(shared.remotePath);
}

function setProcesses()
{
	extract.subsProcess = true;
	extract.coverProcess = true;
}

fs.watchFile(shared.configPath, { interval: 1000 }, (curr, prev) => {

	exports.config = getConfig();

	server.refreshConfig();
});

fs.watchFile(shared.selectionPath, { interval: 1000 }, (curr, prev) => {

	exports.selection = getSelection();

	setProcesses();
	encode.refreshSelection();
	if(exports.config.receiverType == 'chromecast') chromecast.cast();
});

fs.watchFile(shared.listPath, { interval: 1000 }, (curr, prev) => {

	exports.list = getList();
});

fs.watchFile(shared.remotePath, { interval: 250 }, (curr, prev) => {

	exports.remote = getRemote();
	chromecast.remote(exports.remote.action, exports.remote.value);
});
