const { spawn } = require('child_process');
const noop = () => {};

module.exports = function(opts, cb)
{
	cb = cb || noop;

	if(!opts.ffprobePath)
		return cb(new Error('No ffprobe path'));

	if(!opts.filePath)
		return cb(new Error('No file path specified'));

	var outData = "";

	var ffprobe = spawn(
		opts.ffprobePath,
		['-show_streams', '-show_format', '-print_format', 'json', opts.filePath],
		{ stdio: ['ignore', 'pipe', 'ignore'] }
	);

	const addData = function(data)
	{
		outData += data;
	}

	const onFFprobeExit = function(code)
	{
		ffprobe.removeListener('error', onFFprobeError);
		ffprobe.stdout.removeListener('data', addData);

		if(!code)
		{
			var parsedData = null;

			try { parsedData = JSON.parse(outData); }
			catch(err) {}

			if(parsedData)
				cb(null, parsedData);
			else
				cb(new Error('Could not parse ffprobe data'));
		}
		else cb(new Error(`FFprobe process error code: ${code}`));
	}

	const onFFprobeError = function(code)
	{
		ffprobe.removeListener('exit', onFFprobeExit);
		ffprobe.stdout.removeListener('data', addData);

		cb(new Error(`FFprobe exec error code: ${code}`));
	}

	ffprobe.once('exit', onFFprobeExit);
	ffprobe.once('error', onFFprobeError);
	ffprobe.stdout.on('data', addData);
}
