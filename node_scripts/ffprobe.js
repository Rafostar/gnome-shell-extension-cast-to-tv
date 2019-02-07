var JSONStream = require('JSONStream');
var deferential = require('deferential');
var spawn = require('child_process').spawn;

module.exports = getInfo;

function getInfo(filePath, opts, cb)
{
	var d = deferential();
	var info;
	var stderr;

	var ffprobe = spawn(opts.path, ['-show_streams', '-show_format', '-print_format', 'json', filePath]);

	ffprobe.once('close', function(code)
	{
		if(!code)
		{
			d.resolve(info);
		}
		else
		{
			d.reject(new Error("FFprobe error"));
		}
	});

	ffprobe.stdout
		.pipe(JSONStream.parse())
		.once('data', function(data)
		{
			info = data;
		});

	return d.nodeify(cb);
}
