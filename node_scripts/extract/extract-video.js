const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const jschardet = require('jschardet');
const shared = require('../../shared');
const noop = () => {};

exports.subsProcess = false;

exports.subsToVtt = function(opts, cb)
{
	cb = cb || noop;

	if(!opts.file)
		return cb(new Error('No subtiles file specified'));

	if(!opts.outPath)
		return cb(new Error('No output file path'));

	fs.readFileSync(opts.file, (err, data) =>
	{
		if(err) return cb(err);

		if(!opts.charEnc)
		{
			var charDet = jschardet.detect(data);

			if(charDet && charDet.encoding)
				opts.charEnc = charDet.encoding;
			else
				return cb(new Error('Could not detect subtitles encoding'));
		}

		convertSubsToVtt(opts, cb);
	});
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
				exports.subsProcess = false;
			}

			/* Return when subtiles found */
			return;
		}
	}

	/* Delete existing file if no new subtiles */
	remove.file(shared.vttSubsPath);
	exports.subsProcess = false;
}

function convertSubsToVtt(opts, cb)
{
	exports.subsProcess = true;
	opts.ffmpegPath = opts.ffmpegPath || '/usr/bin/ffmpeg';

	var spawnProcess = spawn(opts.ffmpegPath, [
		'-sub_charenc', opts.charEnc, '-i', opts.file, opts.outPath, '-y'
	]);

	const onConvertExit = function(code)
	{
		if(!exports.subsProcess) return;

		exports.subsProcess = false;
		spawnProcess.removeListener('error', onConvertError);

		cb(null);
	}

	const onConvertError = function(code)
	{
		if(!exports.subsProcess) return;

		exports.subsProcess = false;
		spawnProcess.removeListener('exit', onConvertExit);

		cb(new Error(`Convert process error code: ${code}`));
	}

	spawnProcess.once('exit', onConvertExit);
	spawnProcess.once('error', onConvertError);
}
