var fs = require('fs');
var bridge = require('./bridge');
var socket = require('./server-socket');
var shared = require('../shared');

exports.repeat = false;

exports.webControl = function(action, value)
{
	var currentTrackID;
	var listLastID;

	switch(action)
	{
		case 'SKIP+':
			currentTrackID = bridge.list.indexOf(bridge.selection.filePath) + 1;
			listLastID = bridge.list.length;
			if(currentTrackID < listLastID) exports.changeTrack(currentTrackID + 1);
			break;
		case 'SKIP-':
			currentTrackID = bridge.list.indexOf(bridge.selection.filePath) + 1;
			if(currentTrackID > 1) exports.changeTrack(currentTrackID - 1);
			break;
		case 'REPEAT':
			exports.repeat = value;
			break;
		default:
			socket.emit('remote-signal', { action, value });
			break;
	}
}

exports.changeTrack = function(id)
{
	/* Tracks are counted from 1, list indexes from 0 */
	bridge.selection.filePath = bridge.list[id - 1];
	fs.writeFileSync(shared.selectionPath, JSON.stringify(bridge.selection, null, 1));
}

exports.checkNextTrack = function()
{
	var currentTrackID = bridge.list.indexOf(bridge.selection.filePath) + 1;
	var listLastID = bridge.list.length;

	if(exports.repeat && currentTrackID == listLastID)
	{
		exports.changeTrack(1);
		return true;
	}
	else if(currentTrackID < listLastID)
	{
		exports.changeTrack(currentTrackID + 1);
		return true;
	}

	return false;
}
