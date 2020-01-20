const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const ffprobe = require('../ffprobe');
const shared = require('../../shared');
const noop = () => {};

exports.coverProcess = null;

exports.findCoverFile = function()
{
	var coverFile;

	for(var i = 0; i < shared.coverNames.length; i++)
	{
		for(var j = 0; j < shared.coverExtensions.length; j++)
		{
			var coverExists = checkCombinedCover(i,j);
			if(coverExists) return coverFound = true;
		}
	}

	return coverFound = false;
}

exports.checkCoverIncluded = function(cb)
{
	var ffprobePromise = ffprobe(bridge.selection.filePath, {path: bridge.config.ffprobePath});

	ffprobePromise
		.then(data => {
			for(var i = 0; i < data.streams.length; i++)
			{
				if(data.streams[i].codec_name == 'mjpeg')
					return cb(true);
			}

			cb(false);
		})
		.catch(err => {
			if(err.message == 'FFprobe process error')
				notify('Cast to TV', messages.ffprobeError, bridge.selection.filePath);
			else if(err.message == 'FFprobe exec error')
				notify('Cast to TV', messages.ffprobePath);

			cb(false);
		});
}

function extractCoverArt(extension)
{
	exports.coverPath = shared.coverDefault + extension;
	exports.coverProcess = spawn(bridge.config.ffmpegPath, [
		'-i', bridge.selection.filePath, '-c', 'copy', exports.coverPath, '-y'
	]);
	exports.coverProcess.on('close', () => exports.coverProcess = null);
}

function checkCombinedCover(i,j)
{
	var coverCombined = shared.coverNames[i] + shared.coverExtensions[j];

	for(var k = 1; k <= 3; k++)
	{
		switch(k)
		{
			case 1:
				coverFile = path.dirname(bridge.selection.filePath) + '/' + coverCombined;
				break
			case 2:
				coverFile = path.dirname(bridge.selection.filePath) + '/' +
					coverCombined.charAt(0).toUpperCase() + coverCombined.slice(1);
				break;
			case 3:
				coverFile = path.dirname(bridge.selection.filePath) + '/' +
					shared.coverNames[i].toUpperCase() + shared.coverExtensions[j];
				break;
			default:
				break;
		}

		if(fs.existsSync(coverFile))
		{
			shared.coverExtensions.forEach(function(ext)
			{
				if(ext != shared.coverExtensions[j]) remove.file(shared.coverDefault + ext);
			});

			exports.coverPath = shared.coverDefault + shared.coverExtensions[j];
			fs.copyFileSync(coverFile, exports.coverPath);
			return true;
		}
	}

	exports.coverPath = "";
	return false;
}

function checkMetadata(ffprobeData)
{
	var metadata = ffprobeData.format.tags;

	if(metadata.TITLE)
	{
		for(var i in metadata)
		{
			metadata[i.toLowerCase()] = metadata[i];
			delete metadata[i];
		}

		exports.metadata = metadata;
	}
	else if(metadata.title) exports.metadata = metadata;
	else exports.metadata = null;

	if(!coverFound)
	{
		for(var i = 0; i < ffprobeData.streams.length; i++)
		{
			if(ffprobeData.streams[i].codec_name == 'mjpeg')
			{
				shared.coverExtensions.forEach(function(ext)
				{
					if(ext != '.jpg') remove.file(shared.coverDefault + ext);
				});

				extractCoverArt('.jpg');
				return;
			}
		}

		/* Delete existing cover if new cover not found */
		remove.covers();
	}

	exports.coverProcess = null;
}
