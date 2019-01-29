const fs = require('fs');
const path = require('path');
const spawn = require('child_process').spawn;
const ffprobe = require('./ffprobe');
const configbridge = require('./configbridge');
const vttSubsPath = '/tmp/webplayer_subs.vtt';
const metadataPath = '/tmp/.chromecast-metadata.json';
const coverDefault = '/tmp/cover';
const escapeChars = [' ', '[', ']', '"', "'"];

var config;
var subsPathEscaped;
var subtitlesBuiltIn;
var codecAudio = 'copy';

exports.streamProcess = null;
exports.coverPath = null;

String.prototype.replaceAt = function(index, replacement)
{
	return this.substr(0, index) + replacement + this.substr(index + 1);
}

exports.refreshConfig = function()
{
	config = configbridge.config;
	subtitlesBuiltIn = false;

	if(config.subsPath)
	{
		convertSubsToVtt(config.subsPath);
	}
	else if(config.filePath)
	{
		switch(config.streamType)
		{
			case 'MUSIC':
				findCoverFile();
			case 'PICTURE':
				removeExistingFile(metadataPath);
				removeExistingFile(vttSubsPath);
				break;
			default:
				removeExistingFile(metadataPath);
				ffprobeAnalyzeFile();
				break;
		}
	}
}

function removeExistingFile(fileToRemove)
{
	if(fs.existsSync(fileToRemove))
	{
		fs.unlink(fileToRemove, (err) => {
			if(err) throw err;
		});
	}
}

function ffprobeAnalyzeFile()
{
	var ffprobePromise = ffprobe(config.filePath, {path: config.ffprobePath});

	ffprobePromise.then(value => {

		if(config.streamType == 'MUSIC') checkMetadata(value);
		else checkBuiltInSubs(value);
	});
}

function checkBuiltInSubs(ffprobeData)
{
	for(var i = 0; i < ffprobeData.streams.length; i++)
	{
		if(ffprobeData.streams[i].codec_type == 'subtitle')
		{
			if(config.streamType == 'VIDEO')
			{
				convertSubsToVtt(config.filePath);
			}
			else
			{
				subtitlesBuiltIn = true;
				removeExistingFile(vttSubsPath);
			}

			/* Return when subtiles found */
			return;
		}
	}

	/* Delete existing file if no new subtiles */
	removeExistingFile(vttSubsPath);
}

function findCoverFile()
{
	const coverNames = ['cover', 'cover_01', 'cover 01', 'cover1'];
	const coverExtensions = ['.jpg', '.png'];

	var coverFile;

	for(var i = 0; i < coverNames.length; i++)
	{
		for(var j = 0; j < coverExtensions.length; j++)
		{
			var coverCombined = coverNames[i] + coverExtensions[j];

			for(var k = 1; k <= 3; k++)
			{
				if(k == 1) coverFile = path.dirname(config.filePath) + '/' + coverCombined;
				else if(k == 2) coverFile = path.dirname(config.filePath) + '/' + coverCombined.charAt(0).toUpperCase() + coverCombined.slice(1);
				else if(k == 3) coverFile = path.dirname(config.filePath) + '/' + coverNames[i].toUpperCase() + coverExtensions[j];

				if(fs.existsSync(coverFile))
				{
					exports.coverPath = coverDefault + coverExtensions[j];
					fs.copyFileSync(coverFile, exports.coverPath);
					return;
				}
			}
		}
	}

	/* When no external image found, analyze file for cover */
	ffprobeAnalyzeFile();
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

		fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 1));
	}
	else if(metadata.title)
	{
		fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 1));
	}
	else
	{
		removeExistingFile(metadataPath);
	}

	for(var i = 0; i < ffprobeData.streams.length; i++)
	{
		if(ffprobeData.streams[i].codec_name == 'mjpeg')
		{
			extractCoverArt('.jpg');
			return;
		}
	}

	/* Delete existing cover if new cover not found */
	removeExistingFile(coverDefault + '.jpg');
	removeExistingFile(coverDefault + '.png');
}

function getSubsPath()
{
	subsPathEscaped = config.filePath;
	var i = subsPathEscaped.length;

	while(i--)
	{
		if(escapeChars.indexOf(subsPathEscaped.charAt(i)) > -1)
		{
			subsPathEscaped = subsPathEscaped.replaceAt(i, '\\' + subsPathEscaped.charAt(i));
		}
	}
}

function convertSubsToVtt(subsFile)
{
	spawn(config.ffmpegPath, ['-i', subsFile, vttSubsPath, '-y']);
}

function extractCoverArt(extension)
{
	exports.coverPath = coverDefault + extension;
	spawn(config.ffmpegPath, ['-i', config.filePath, '-c', 'copy', exports.coverPath, '-y']);
}

exports.videoConfig = function()
{
	var encodeOpts = [
	'-i', config.filePath,
	'-c:v', 'libx264',
	'-pix_fmt', 'yuv420p',
	'-preset', 'superfast',
	'-level:v', '4.1',
	'-b:v', config.videoBitrate + 'M',
	'-maxrate', config.videoBitrate + 'M',
	'-c:a', codecAudio,
	'-metadata', 'title=Cast to TV - Software Encoded Stream',
	'-f', 'matroska',
	'pipe:1'
	];

	if(subtitlesBuiltIn)
	{
		getSubsPath();
		encodeOpts.splice(encodeOpts.indexOf('libx264') + 1, 0, '-vf', 'subtitles=' + subsPathEscaped, '-sn');
	}

	exports.streamProcess = spawn(config.ffmpegPath, encodeOpts,
	{ stdio: ['ignore', 'pipe', 'ignore'] });

	exports.streamProcess.on('close', function()
	{
		exports.streamProcess = null;
	});

	return exports.streamProcess;
}

exports.videoVaapiConfig = function()
{
	var encodeOpts = [
	'-i', config.filePath,
	'-c:v', 'h264_vaapi',
	'-level:v', '4.1',
	'-b:v', config.videoBitrate + 'M',
	'-maxrate', config.videoBitrate + 'M',
	'-c:a', codecAudio,
	'-metadata', 'title=Cast to TV - VAAPI Encoded Stream',
	'-f', 'matroska',
	'pipe:1'
	];

	if(subtitlesBuiltIn)
	{
		getSubsPath();
		encodeOpts.splice(0, 0, '-hwaccel', 'vaapi', '-hwaccel_device', '/dev/dri/renderD128', '-hwaccel_output_format', 'vaapi');
		encodeOpts.splice(encodeOpts.indexOf('h264_vaapi') + 1, 0, '-vf', 'scale_vaapi,hwmap=mode=read+write,format=nv12,subtitles=' + subsPathEscaped + ',hwmap', '-sn');
	}
	else
	{
		encodeOpts.splice(0, 0, '-vaapi_device', '/dev/dri/renderD128');
		encodeOpts.splice(encodeOpts.indexOf('h264_vaapi') + 1, 0, '-vf', 'format=nv12,hwmap');
	}

	exports.streamProcess = spawn(config.ffmpegPath, encodeOpts,
	{ stdio: ['ignore', 'pipe', 'ignore'] });

	exports.streamProcess.on('close', function()
	{
		exports.streamProcess = null;
	});

	return exports.streamProcess;
}

exports.musicVisualizerConfig = function()
{
	var encodeOpts = [
	'-i', config.filePath,
	'-filter_complex',
	`firequalizer=gain='(1.4884e8 * f*f*f / (f*f + 424.36) / (f*f + 1.4884e8) / sqrt(f*f + 25122.25)) / sqrt(2)':
	scale=linlin:
	wfunc=tukey:
	zero_phase=on:
	fft2=on,
	showcqt=fps=60:
	size=1280x360:
	count=1:
	csp=bt470bg:
	cscheme=1|0|0.5|0|1|0.5:
	bar_g=2:
	sono_g=4:
	bar_v=9:
	sono_v=17:
	sono_h=0:
	bar_t=0.5:
	axis_h=0:
	tc=0.33:
	tlength='st(0,0.17); 384*tc / (384 / ld(0) + tc*f /(1-ld(0))) + 384*tc / (tc*f / ld(0) + 384 /(1-ld(0)))',
	format=yuv420p,split [v0],vflip [v1]; [v0][v1] vstack [vis]`,
	'-map', '[vis]',
	'-map', '0:a',
	'-c:v', 'libx264',
	'-pix_fmt', 'yuv420p',
	'-preset', 'superfast',
	'-level:v', '4.1',
	'-b:v', config.videoBitrate + 'M',
	'-maxrate', config.videoBitrate + 'M',
	'-c:a', codecAudio,
	'-metadata', 'title=Cast to TV - Music Visualizer',
	'-f', 'matroska',
	'pipe:1'
	];

	exports.streamProcess = spawn(config.ffmpegPath, encodeOpts,
	{ stdio: ['ignore', 'pipe', 'ignore'] });

	exports.streamProcess.on('close', function()
	{
		exports.streamProcess = null;
	});

	return exports.streamProcess;
}
