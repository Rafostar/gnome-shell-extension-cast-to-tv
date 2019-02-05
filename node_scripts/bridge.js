var fs = require('fs');
var server = require('./server');
var encode = require('./encode');
var extract = require('./extract');
var chromecast = require('./chromecast');
var gnome = require('./gnome');
var socket = require('./server-socket');
var shared = require('../shared');

exports.config = require(shared.configPath);
exports.selection = require(shared.selectionPath);
exports.list = require(shared.listPath);
exports.remote = require(shared.remotePath);

exports.changeTrack = function(id)
{
	/* Tracks are counted from 1, list indexes from 0 */
	exports.selection.filePath = exports.list[id - 1];
	fs.writeFileSync(shared.selectionPath, JSON.stringify(exports.selection, null, 1));
}

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

fs.watchFile(shared.configPath, { interval: 3000 }, (curr, prev) => {

	exports.config = getConfig();

	server.refreshConfig();
});

fs.watchFile(shared.selectionPath, { interval: 1000 }, (curr, prev) => {

	exports.selection = getSelection();

	setProcesses();
	encode.refreshSelection();
	gnome.showRemote(false);

	if(exports.config.receiverType == 'chromecast') chromecast.cast();
	else if(exports.config.receiverType == 'other') socket.emit('reload');
});

fs.watchFile(shared.listPath, { interval: 1000 }, (curr, prev) => {

	exports.list = getList();
});

fs.watchFile(shared.remotePath, { interval: 250 }, (curr, prev) => {

	exports.remote = getRemote();
	chromecast.remote(exports.remote.action, exports.remote.value);
});
