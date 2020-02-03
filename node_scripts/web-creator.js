const fs = require('fs');
const path = require('path');
const debug = require('debug')('web-creator');
const bridge = require('./bridge');
const socket = require('./server-socket');
const encode = require('./encode');
const shared = require('../shared');

exports.fileStream = function(req, res)
{
	res.setHeader('Access-Control-Allow-Origin', '*');

	var streamType = bridge.selection.streamType;
	var filePath = bridge.selection.filePath;

	if(!filePath)
	{
		debug('No file path');
		return res.sendStatus(404);
	}

	/* Check if file exists */
	fs.access(filePath, fs.constants.F_OK, (err) =>
	{
		if(err)
		{
			debug(err);
			return res.sendStatus(404);
		}

		return res.sendFile(filePath);
	});
}

exports.encodedStream = function(req, res)
{
	if(!encode.enabled)
		return res.sendStatus(204);

	var filePath = bridge.selection.filePath;

	if(!filePath)
		return res.sendStatus(404);

	/* Prevent spawning more then one ffmpeg encode process */
	if(encode.streamProcess)
		return res.sendStatus(429);

	var streamType = bridge.selection.streamType;

	/* Check if file exists */
	fs.access(filePath, fs.constants.F_OK, (err) =>
	{
		if(err) return res.sendStatus(404);

		res.writeHead(200, {
			'Access-Control-Allow-Origin': '*',
			'Connection': 'close',
			'Content-Type': 'video/mp4'
		});

		switch(streamType)
		{
			case 'VIDEO_VAAPI':
				encode.videoVaapi().pipe(res);
				break;
			case 'VIDEO_NVENC':
				encode.videoNvenc().pipe(res);
				break;
			case 'MUSIC':
				encode.musicVisualizer().pipe(res);
				break;
			case 'VIDEO_AUDIOENC':
				encode.audio().pipe(res);
				break;
			default:
				encode.video().pipe(res);
				break;
		}

		res.once('close', encode.closeStreamProcess);
	});
}

exports.subsStream = function(req, res)
{
	res.setHeader('Access-Control-Allow-Origin', '*');

	if(!bridge.selection.streamType.startsWith('VIDEO'))
		return res.sendStatus(204);

	var subsPath = bridge.selection.subsPath;

	/* Check if file is specified and exists */
	if(subsPath)
	{
		if(
			req._parsedUrl.pathname === '/subswebplayer'
			&& !subsPath.endsWith('.vtt')
		) {
			return res.sendStatus(204);
		}

		fs.access(subsPath, fs.constants.F_OK, (err) =>
		{
			if(err) return res.sendStatus(404);

			return res.sendFile(subsPath);
		});
	}
	else
		return res.sendStatus(204);
}

exports.coverStream = function(req, res)
{
	res.setHeader('Access-Control-Allow-Origin', '*');

	if(bridge.selection.streamType !== 'MUSIC')
		return res.sendStatus(204);

	var coverPath = bridge.mediaData.coverPath;

	/* Playercast supports covers in media file */
	if(
		bridge.config.receiverType === 'playercast'
		&& coverPath
		&& coverPath === 'muxed_image'
	) {
		return res.sendStatus(204);
	}

	/* Use default cover when other does not exists */
	if(!coverPath) coverPath = path.join(__dirname + '/../webplayer/images/cover.png');

	fs.access(coverPath, fs.constants.F_OK, (err) =>
	{
		if(err) return res.sendStatus(404);

		return res.sendFile(coverPath);
	});
}

exports.hlsStream = function(req, res)
{
	res.setHeader('Access-Control-Allow-Origin', '*');

	var filePath = shared.hlsDir + req.url;

	/* Check if stream segment exists */
	fs.access(filePath, fs.constants.F_OK, (err) =>
	{
		if(err) return res.sendStatus(404);

		return res.sendFile(filePath);
	});
}

exports.webConfig = function(req, res)
{
	res.setHeader('Access-Control-Allow-Origin', '*');
	res.setHeader('Content-Type', 'text/css');

	var size = bridge.config.webplayerSubs;

	var webConfig = `@media {
	.plyr__captions{font-size:${5*size}vmin}
	.plyr:-webkit-full-screen .plyr__captions{font-size:${5*size}vmin}
	.plyr:-moz-full-screen .plyr__captions{font-size:${5*size}vmin}
	.plyr:-ms-fullscreen .plyr__captions{font-size:${5*size}vmin}
	.plyr:fullscreen .plyr__captions{font-size:${5*size}vmin}\n}`

	res.send(webConfig);
}

exports.getTemp = function(type, req, res)
{
	switch(type)
	{
		case 'config':
		case 'selection':
		case 'playlist':
		case 'status':
			res.send(bridge[type]);
			break;
		case 'playercasts':
			res.send(socket.playercasts);
			break;
		case 'playback-data':
			res.send(bridge.getPlaybackData());
			break;
		case 'remote-buttons':
			res.send(bridge.getRemoteButtons());
			break;
		case 'is-enabled':
			res.send({ isEnabled: true });
			break;
		default:
			res.sendStatus(404);
			break;
	}
}

exports.postTemp = function(type, req, res)
{
	switch(type)
	{
		case 'config':
			bridge.updateConfig(req.body);
			res.sendStatus(200);
			break;
		case 'selection':
			bridge.updateSelection(req.body);
			res.sendStatus(200);
			break;
		case 'playlist':
			const append = (req.query && req.query.append === 'true');
			bridge.updatePlaylist(req.body, append);
			res.sendStatus(200);
			break;
		case 'remote':
			bridge.updateRemote(req.body);
			res.sendStatus(200);
			break;
		case 'playback-data':
			bridge.updatePlaylist(req.body.playlist, false);
			bridge.updateSelection(req.body.selection);
			res.sendStatus(200);
			break;
		case 'lock-screen':
			bridge.updateLockScreen(req.body);
			res.sendStatus(200);
			break;
		default:
			res.sendStatus(404);
			break;
	}
}
