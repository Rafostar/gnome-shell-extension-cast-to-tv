var fs = require('fs');
var path = require('path');
var rangeParser = require('range-parser');
var bridge = require('./bridge');
var encode = require('./encode');
var extract = require('./extract');
var shared = require('../shared');

exports.fileStream = function(req, res)
{
	var streamType = bridge.selection.streamType;
	var filePath = bridge.selection.filePath;

	if(!filePath)
	{
		res.statusCode = 404;
		res.end("No media file selected!");
		return;
	}

	/* Check if file exist */
	var exist = fs.existsSync(filePath);

	if(exist)
	{
		res.setHeader('Access-Control-Allow-Origin', '*');

		/* Pipe picture stream and exit function */
		if(streamType == 'PICTURE')
		{
			res.setHeader('Content-Type', 'image/png');
			return fs.createReadStream(filePath).pipe(res);
		}

		res.setHeader('Content-Type', 'video/mp4');

		/* Calculate file range for chunked streaming */
		var stat = fs.statSync(filePath);
		var total = stat.size;
		var range = req.headers.range;

		if (!range)
		{
			res.setHeader('Content-Length', total);
			res.statusCode = 200;
			return fs.createReadStream(filePath).pipe(res);
		}

		var part = rangeParser(total, range)[0];
		var chunksize = (part.end - part.start) + 1;
		var file = fs.createReadStream(filePath, {start: part.start, end: part.end});

		res.setHeader('Content-Range', 'bytes ' + part.start + '-' + part.end + '/' + total);
		res.setHeader('Accept-Ranges', 'bytes');
		res.setHeader('Content-Length', chunksize);
		res.statusCode = 206;
		return file.pipe(res);
	}
	else
	{
		res.statusCode = 404;
		res.end(`File ${filePath} not found!`);
	}
}

exports.encodedStream = function(req, res)
{
	var filePath = bridge.selection.filePath;

	if(!filePath)
	{
		res.statusCode = 404;
		res.end("No media file selected!");
		return;
	}

	/* Prevent spawning more then one ffmpeg encode process */
	if(encode.streamProcess)
	{
		res.statusCode = 429;
		res.end("Streaming is already active!");
		return;
	}

	res.setHeader('Content-Type', 'video/x-matroska');
	res.setHeader('Access-Control-Allow-Origin', '*');
	res.setHeader('Connection', 'keep-alive');
	res.statusCode = 200;

	var streamType = bridge.selection.streamType;

	/* Check if file exist */
	var exist = fs.existsSync(filePath);

	if(exist)
	{
		if(streamType == 'VIDEO_ENCODE') encode.videoConfig().stdout.pipe(res);
		else if(streamType == 'VIDEO_VAAPI') encode.videoVaapiConfig().stdout.pipe(res);
		else if(streamType == 'VIDEO_NVENC') encode.videoNvencConfig().stdout.pipe(res);
		else if(streamType == 'MUSIC') encode.musicVisualizerConfig().stdout.pipe(res);
		else res.end();

		return;
	}
	else
	{
		res.statusCode = 404;
		res.end(`File ${filePath} not found!`);
	}
}

exports.subsStream = function(req, res)
{
	var subsPath = bridge.selection.subsPath;
	var parsedUrl = req._parsedUrl.pathname;

	if(!subsPath || parsedUrl == '/subswebplayer')
	{
		subsPath = shared.vttSubsPath;
	}

	/* Check if file exist */
	var exist = fs.existsSync(subsPath);

	if(exist)
	{
		/* Get stat from file */
		var statSubs = fs.statSync(subsPath);
		var totalSubs = statSubs.size;

		res.writeHead(200, {
			'Access-Control-Allow-Origin': '*',
			'Accept-Ranges': 'bytes',
			'Content-Length': totalSubs,
			'Content-Type': 'text/vtt'
		});

		return fs.createReadStream(subsPath).pipe(res);
	}
	else
	{
		res.statusCode = 204;
		res.end();
		return;
	}
}

exports.coverStream = function(req, res)
{
	var coverPath = extract.coverPath;

	res.writeHead(200, {
		'Access-Control-Allow-Origin': '*',
		'Content-Type': 'image/png'
	});

	/* Check if file exist */
	var exist = fs.existsSync(coverPath);

	if(!exist)
	{
		coverPath = path.join(__dirname + '/../webplayer/images/cover.png');
	}

	return fs.createReadStream(coverPath).pipe(res);
}

exports.pageWrong = function(req, res)
{
	res.statusCode = 400;
	res.end("Bad Request!");
}
