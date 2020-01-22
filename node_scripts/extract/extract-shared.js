const { spawn } = require('child_process');

exports.findInStreams = function(ffprobeData, name, value)
{
	if(ffprobeData && Array.isArray(ffprobeData.streams))
	{
		for(var i = 0; i < ffprobeData.streams.length; i++)
		{
			if(
				ffprobeData.streams[i][name]
				&& ffprobeData.streams[i][name] === value
			) {
				return true;
			}
		}
	}

	return false;
}

exports.convertFile = function(opts, cb)
{
	if(!opts.spawnArgs || !Array.isArray(opts.spawnArgs))
		return cb(new Error('No spawn args array'));

	opts.ffmpegPath = opts.ffmpegPath || '/usr/bin/ffmpeg';

	var spawnProcess = spawn(opts.ffmpegPath, opts.spawnArgs);

	const onConvertExit = function(code)
	{
		spawnProcess.removeListener('error', onConvertError);

		if(code) cb(new Error(`Extract process exit code: ${code}`));
		else cb(null);
	}

	const onConvertError = function(code)
	{
		spawnProcess.removeListener('exit', onConvertExit);
		cb(new Error(`Extract process error code: ${code}`));
	}

	spawnProcess.once('exit', onConvertExit);
	spawnProcess.once('error', onConvertError);
}
