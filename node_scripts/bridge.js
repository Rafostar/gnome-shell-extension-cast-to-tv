var fs = require('fs');
var server = require('./server');
var encode = require('./encode');
var extract = require('./extract');
var remove = require('./remove');
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

function getContents(path)
{
	delete require.cache[path];
	return require(path);
}

function setProcesses()
{
	switch(exports.selection.streamType)
	{
		case 'MUSIC':
			extract.coverProcess = true;
			extract.findCoverFile();
			extract.analyzeFile();
			remove.file(shared.vttSubsPath);
			break;
		case 'PICTURE':
			remove.covers();
			remove.file(shared.vttSubsPath);
			break;
		default:
			extract.subsProcess = true;
			if(exports.selection.subsPath) extract.detectSubsEncoding(exports.selection.subsPath);
			else extract.analyzeFile();
			remove.covers();
			break;
	}
}

fs.watchFile(shared.configPath, { interval: 3000 }, (curr, prev) => {

	exports.config = getContents(shared.configPath);

	server.refreshConfig();
});

fs.watchFile(shared.selectionPath, { interval: 1000 }, (curr, prev) => {

	exports.selection = getContents(shared.selectionPath);

	if(exports.selection.filePath)
	{
		setProcesses();

		if(exports.config.receiverType == 'chromecast') chromecast.cast();
		else if(exports.config.receiverType == 'other') setTimeout(socket.emit, 250, 'reload');
	}
});

fs.watchFile(shared.listPath, { interval: 1000 }, (curr, prev) => {

	exports.list = getContents(shared.listPath);

	gnome.showRemote(false);
});

fs.watchFile(shared.remotePath, { interval: 250 }, (curr, prev) => {

	exports.remote = getContents(shared.remotePath);

	chromecast.remote(exports.remote.action, exports.remote.value);
});
