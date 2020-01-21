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

	var ffprobe = spawn(opts.ffprobePath, [
		'-show_streams', '-show_format', '-print_format', 'json', opts.filePath
	]);

	const addData = function(data)
	{
		outData += data;
	}

	const onFFprobeExit = function(code)
	{
		ffprobe.removeListener('error', onFFprobeError);
		ffprobe.removeListener('data', addData);

		if(!code) cb(null, JSON.parse(outData));
		else cb(new Error(`FFprobe process error code: ${code}`));
	}

	const onFFprobeError = function(code)
	{
		ffprobe.removeListener('exit', onFFprobeExit);
		ffprobe.removeListener('data', addData);

		cb(new Error(`FFprobe exec error code: ${code}`));
	}

	ffprobe.once('exit', onFFprobeExit);
	ffprobe.once('error', onFFprobeError);
	ffprobe.on('data', addData);
}
