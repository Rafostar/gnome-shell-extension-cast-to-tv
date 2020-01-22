const bridge = require('./bridge');
const notify = require('./notify');
const messages = require('./messages.js');
const ffprobe = require('./ffprobe');
const extractVid = require('./extract/extract-video');
const extractMus = require('./extract/extract-music');
const noop = () => {};

module.exports =
{
	video: extractVid,
	music: extractMus,
	analyzeSelection: analyzeSelection
}

function analyzeSelection(cb)
{
	cb = cb || noop;

	exports.subtitlesBuiltIn = false;

	var ffprobeOpts = {
		ffprobePath : bridge.selection.filePath,
		filePath: bridge.config.ffprobePath
	};

	ffprobe(ffprobeOpts, (err, data) =>
	{
		if(!err)
			cb(null, data);
		else
		{
			if(err.message.includes('FFprobe process error'))
				notify('Cast to TV', messages.ffprobeError, bridge.selection.filePath);
			else if(err.message.includes('FFprobe exec error'))
				notify('Cast to TV', messages.ffprobePath);

			cb(err);
		}
	});
}
