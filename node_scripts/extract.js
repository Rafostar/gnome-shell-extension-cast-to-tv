var fs = require('fs');
var path = require('path');
var spawn = require('child_process').spawn;
var jschardet = require('jschardet');
var bridge = require('./bridge');
var ffprobe = require('./ffprobe');
var remove = require('./remove');
var gnome = require('./gnome');
var shared = require('../shared');

exports.subsProcess = null;
exports.coverProcess = null;
exports.coverPath;
exports.metadata;
exports.subtitlesBuiltIn;

var coverFound;

exports.detectSubsEncoding = function(subsFile)
{
	var fileBuffer = fs.readFileSync(subsFile);
	var charDet = jschardet.detect(fileBuffer);

	convertSubsToVtt(subsFile, charDet.encoding);
}

exports.findCoverFile = function()
{
	var coverFile;

	for(var i = 0; i < shared.coverNames.length; i++)
	{
		for(var j = 0; j < shared.coverExtensions.length; j++)
		{
			var coverExists = checkCombinedCover(i,j);
			if(coverExists) coverFound = true;
		}
	}

	coverFound = false;
}

exports.analyzeFile = function()
{
	exports.subtitlesBuiltIn = false;
	var ffprobePromise = ffprobe(bridge.selection.filePath, {path: bridge.config.ffprobePath});

	ffprobePromise
		.then(value => {
			if(bridge.selection.streamType == 'MUSIC') checkMetadata(value);
			else checkBuiltInSubs(value);
		})
		.catch(error => {
			gnome.notify('Cast to TV', 'Error: FFprobe could not process file ' + bridge.selection.filePath + '\nCheck FFprobe path and file permissions');
			exports.subsProcess = null;
			exports.coverProcess = null;
		});
}

function convertSubsToVtt(subsFile, subsEnc)
{
	exports.subsProcess = spawn(bridge.config.ffmpegPath, ['-sub_charenc', subsEnc, '-i', subsFile, shared.vttSubsPath, '-y']);
	exports.subsProcess.on('close', function(){ exports.subsProcess = null; });
}

function extractCoverArt(extension)
{
	exports.coverPath = shared.coverDefault + extension;
	exports.coverProcess = spawn(bridge.config.ffmpegPath, ['-i', bridge.selection.filePath, '-c', 'copy', exports.coverPath, '-y']);
	exports.coverProcess.on('close', function(){ exports.coverProcess = null; });
}

function checkBuiltInSubs(ffprobeData)
{
	for(var i = 0; i < ffprobeData.streams.length; i++)
	{
		if(ffprobeData.streams[i].codec_type == 'subtitle')
		{
			if(bridge.selection.streamType == 'VIDEO')
			{
				convertSubsToVtt(bridge.selection.filePath, 'UTF-8');
			}
			else
			{
				exports.subtitlesBuiltIn = true;
				remove.file(shared.vttSubsPath);
				exports.subsProcess = null;
			}

			/* Return when subtiles found */
			return;
		}
	}

	/* Delete existing file if no new subtiles */
	remove.file(shared.vttSubsPath);
	exports.subsProcess = null;
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

function checkCombinedCover(i,j)
{
	var coverCombined = shared.coverNames[i] + shared.coverExtensions[j];

	for(var k = 1; k <= 3; k++)
	{
		if(k == 1) coverFile = path.dirname(bridge.selection.filePath) + '/' + coverCombined;
		else if(k == 2) coverFile = path.dirname(bridge.selection.filePath) + '/' + coverCombined.charAt(0).toUpperCase() + coverCombined.slice(1);
		else if(k == 3) coverFile = path.dirname(bridge.selection.filePath) + '/' + shared.coverNames[i].toUpperCase() + shared.coverExtensions[j];

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

	return false;
}
