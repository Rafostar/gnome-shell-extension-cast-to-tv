const bridge = require('./bridge');
const socket = require('./server-socket');
const gnome = require('./gnome');

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
			currentTrackID = bridge.playlist.indexOf(bridge.selection.filePath) + 1;
			listLastID = bridge.playlist.length;
			if(currentTrackID < listLastID) exports.changeTrack(currentTrackID + 1);
			break;
		case 'SKIP-':
			currentTrackID = bridge.playlist.indexOf(bridge.selection.filePath) + 1;
			if(currentTrackID > 1) exports.changeTrack(currentTrackID - 1);
			break;
		case 'REPEAT':
			exports.repeat = value;
			break;
		case 'SLIDESHOW':
			exports.slideshow = value;
			if(exports.slideshow)
				exports.setSlideshow();
			else
				exports.clearSlideshow();
			break;
		default:
			if(typeof value !== 'undefined')
				socket.emit('remote-signal', { action, value });
			else
				socket.emit('remote-signal', { action });
			break;
	}
}

exports.changeTrack = function(id)
{
	/* Tracks are counted from 1, list indexes from 0 */
	bridge.selection.filePath = bridge.playlist[id - 1];
	bridge.selection.subsPath = "";

	bridge.updateSelection(bridge.selection);
}

exports.checkNextTrack = function()
{
	var currentTrackID = bridge.playlist.indexOf(bridge.selection.filePath) + 1;
	var listLastID = bridge.playlist.length;

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
	if(!slideshowTimeout)
		return false;

	clearTimeout(slideshowTimeout);
	slideshowTimeout = null;

	return true;
}

exports.setSlideshow = function()
{
	exports.clearSlideshow();

	if(exports.slideshow && bridge.selection.streamType === 'PICTURE')
	{
		var time = bridge.config.slideshowTime * 1000;

		slideshowTimeout = setTimeout(() =>
		{
			slideshowTimeout = null;
			var trackChanged = exports.checkNextTrack();

			if(!trackChanged)
				bridge.handleRemoteSignal('STOP');
		}, time);
	}
}
