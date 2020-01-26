const fs = require('fs');
const { spawn } = require('child_process');
const vttparser = require('./vtt-parser');

exports.findInStreams = function(ffprobeData, name, value)
{
	if(ffprobeData && Array.isArray(ffprobeData.streams))
	{
		for(var i = 0; i < ffprobeData.streams.length; i++)
		{
			if(
				ffprobeData.streams[i][name]
				&& ffprobeData.streams[i][name] === value
			)
				return true;
		}
	}

	return false;
}

exports.convertFile = function(opts, cb)
{
	if(!opts.spawnArgs || !Array.isArray(opts.spawnArgs))
		return cb(new Error('No spawn args array'));

	opts.ffmpegPath = opts.ffmpegPath || '/usr/bin/ffmpeg';

	if(opts.vttparser)
		opts.spawnArgs.push('pipe:1');
	else
		opts.spawnArgs.push(opts.outPath, '-y');

	var called = false;
	var spawnProcess = spawn(opts.ffmpegPath, opts.spawnArgs);

	const onConvertExit = function(code)
	{
		spawnProcess.removeListener('error', onConvertError);

		if(called) return;

		if(code)
		{
			called = true;
			return cb(new Error(`Extract process exit code: ${code}`));
		}
		else if(!opts.vttparser)
		{
			called = true;
			return cb(null);
		}
	}

	const onConvertError = function(code)
	{
		spawnProcess.removeListener('exit', onConvertExit);

		if(called) return;

		called = true;
		return cb(new Error(`Extract process error code: ${code}`));
	}

	spawnProcess.once('exit', onConvertExit);
	spawnProcess.once('error', onConvertError);

	if(!opts.vttparser) return;

	vttparser(spawnProcess.stdout, (err, data) =>
	{
		if(called) return;

		if(err)
		{
			called = true;
			return cb(err);
		}

		fs.writeFile(opts.outPath, data, (err) =>
		{
			if(called) return;

			called = true;
			return cb(err);
		});
	});
}
