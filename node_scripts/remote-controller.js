var fs = require('fs');
var bridge = require('./bridge');
var socket = require('./server-socket');
var gnome = require('./gnome');
var shared = require('../shared');

exports.repeat = false;
exports.slideshow = false;

var slideshowTimeout;

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
		case 'SLIDESHOW':
			exports.slideshow = value;
			if(value) exports.setSlideshow();
			else exports.clearSlideshow();
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

	if(exports.repeat && currentTrackID === listLastID)
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

exports.clearSlideshow = function()
{
	if(slideshowTimeout)
	{
		clearTimeout(slideshowTimeout);
		slideshowTimeout = null;
	}
}

exports.setSlideshow = function()
{
	exports.clearSlideshow();

	if(exports.slideshow && bridge.selection.streamType === 'PICTURE')
	{
		var time = gnome.getSetting('slideshow-time') * 1000;

		slideshowTimeout = setTimeout(() =>
		{
			slideshowTimeout = null;
			var trackChanged = exports.checkNextTrack();

			if(!trackChanged)
				bridge.handleRemoteSignal('STOP');
		}, time);
	}
}
