const fs = require('fs');
const spawn = require('child_process').spawn;
const ffprobe = require('ffprobe');
const configbridge = require('./configbridge');
const webplayerSubsPath = '/tmp/webplayer_subs.vtt';
const escapeChars = [' ', '[', ']', '"', "'"];

var config;
var subsPathEscaped;
var subtitlesBuiltIn;
var codecAudio = 'copy';

exports.streamProcess;

String.prototype.replaceAt = function(index, replacement)
{
	return this.substr(0, index) + replacement + this.substr(index + 1);
}

exports.refreshConfig = function()
{
	config = configbridge.config;
	ffprobeAnalyzeFile(config.filePath);
}

function ffprobeAnalyzeFile(fileToAnalyze)
{
	if(fileToAnalyze)
	{
		var ffprobePromise = ffprobe(fileToAnalyze, { path: config.ffprobePath });
		ffprobePromise.then(value => {

			checkBuiltInSubs(value);			
		});
	}
}

function checkBuiltInSubs(ffprobeData)
{
	subtitlesBuiltIn = false;

	if(fs.existsSync(webplayerSubsPath))
	{
		fs.unlinkSync(webplayerSubsPath);
	}

	if(!config.subsPath)
	{
		/* Check file for built-in subs */
		for(var i = 0; i < ffprobeData.streams.length; i++)
		{
			if(ffprobeData.streams[i].codec_type == 'subtitle')
			{
				if(config.receiverType == 'other')
				{
					convertSubsForWeb(config.filePath);
				}
				subtitlesBuiltIn = true;
				break;
			}
		}
	}
	else if(config.receiverType == 'other')
	{
		convertSubsForWeb(config.subsPath);
	}
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

function convertSubsForWeb(subsFile)
{
	spawn(config.ffmpegPath, ['-i', subsFile, webplayerSubsPath, '-y']);
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
	'-c:a', codecAudio,
	'-metadata', 'title=Cast to TV - Software Encoded Stream',
	'-f', 'matroska',
	'pipe:1'
	];

	if(subtitlesBuiltIn)
	{
		getSubsPath();
		encodeOpts.splice(encodeOpts.length - 5, 0, '-vf', 'subtitles=' + subsPathEscaped, '-sn');
	}

	return exports.streamProcess = spawn(config.ffmpegPath, encodeOpts,
	{ stdio: ['ignore', 'pipe', 'ignore'] });
}

exports.videoVaapiConfig = function()
{
	var encodeOpts = [
	'-vaapi_device', '/dev/dri/renderD128',
	'-i', config.filePath,
	'-c:v', 'h264_vaapi',
	'-level:v', '4.1',
	'-b:v', config.videoBitrate + 'M',
	'-c:a', codecAudio,
	'-metadata', 'title=Cast to TV - VAAPI Encoded Stream',
	'-f', 'matroska',
	'pipe:1'
	];

	if(subtitlesBuiltIn)
	{
		getSubsPath();
		encodeOpts.splice(4, 0, '-vf', 'scale_vaapi,hwmap=mode=read+write+direct,format=nv12,subtitles=' + subsPathEscaped + ',hwmap', '-sn');
	}
	else
	{
		encodeOpts.splice(4, 0, '-vf', 'format=nv12,hwupload');
	}

	return exports.streamProcess = spawn(config.ffmpegPath, encodeOpts,
	{ stdio: ['ignore', 'pipe', 'ignore'] });
}

exports.pictureConfig = function()
{
	return exports.streamProcess = spawn(config.ffmpegPath, [
	'-framerate', '5',
	'-loop', '1',
	'-i', config.filePath,
	'-vf', 'scale=-2:1080',
	'-c:v', 'libx264',
	'-t', '30',
	'-pix_fmt', 'yuv420p',
	'-preset', 'ultrafast',
	'-level:v', '4.1',
	'-metadata', 'title=Cast to TV - Picture Stream',
	'-f', 'matroska',
	'pipe:1'
	],
	{ stdio: ['ignore', 'pipe', 'ignore'] });
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
	'-c:a', codecAudio,
	'-metadata', 'title=Cast to TV - Music Visualizer',
	'-f', 'matroska',
	'pipe:1'
	];

	return exports.streamProcess = spawn(config.ffmpegPath, encodeOpts,
	{ stdio: ['ignore', 'pipe', 'ignore'] });
}
