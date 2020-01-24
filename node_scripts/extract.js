const ffprobe = require('./ffprobe');
const extractVid = require('./extract/extract-video');
const extractMus = require('./extract/extract-music');
const noop = () => {};

module.exports =
{
	video: extractVid,
	music: extractMus,
	analyzeFile: analyzeFile
}

function analyzeFile(opts, cb)
{
	cb = cb || noop;

	if(!opts.ffprobePath)
		return cb(new Error('No path to ffprobe'));

	if(!opts.filePath)
		return cb(new Error('No file path to analyze'));

	ffprobe(opts, (err, data) =>
	{
		if(err) return cb(err);

		cb(null, data);
	});
}
