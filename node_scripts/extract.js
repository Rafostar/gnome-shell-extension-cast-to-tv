const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const bridge = require('./bridge');
const remove = require('./remove');
const notify = require('./notify');
const messages = require('./messages.js');

const ffprobe = require('./ffprobe');
const shared = require('../shared');
const noop = () => {};

exports.subsProcess = false;
exports.coverProcess = null;

exports.coverPath;
exports.metadata;
exports.subtitlesBuiltIn;

var coverFound;

exports.analyzeFile = function()
{
	exports.subtitlesBuiltIn = false;
	var ffprobePromise = ffprobe(bridge.selection.filePath, { path: bridge.config.ffprobePath });

	ffprobePromise
		.then(value => {
			if(bridge.selection.streamType == 'MUSIC') checkMetadata(value);
			else checkBuiltInSubs(value);
		})
		.catch(err => {
			if(err.message == 'FFprobe process error')
				notify('Cast to TV', messages.ffprobeError, bridge.selection.filePath);
			else if(err.message == 'FFprobe exec error')
				notify('Cast to TV', messages.ffprobePath);

			exports.subsProcess = false;
			exports.coverProcess = null;
		});
}
