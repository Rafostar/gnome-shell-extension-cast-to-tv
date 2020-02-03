const fs = require('fs');
const debug = require('debug')('remove');
const shared = require('../shared');
const noop = () => {};

exports.file = function(filePath, cb)
{
	cb = cb || noop;

	debug(`Removing ${filePath}...`);
	fs.access(filePath, fs.constants.F_OK, (err) =>
	{
		if(err)
		{
			var noFileMsg = `File ${filePath} does not exist`;
			debug(noFileMsg);

			return cb(new Error(noFileMsg));
		}

		fs.unlink(filePath, (err) =>
		{
			if(!err)
			{
				debug(`Removed ${filePath}`);
				return cb(null);
			}

			var noUnlinkMsg = `Could not remove file: ${filePath}`;
			debug(noUnlinkMsg);

			return cb(new Error(noUnlinkMsg));
		});
	});
}

exports.tempCover = function(cb)
{
	cb = cb || noop;

	exports.file(shared.coverDefault + '.jpg', cb);
}

exports.tempSubs = function(cb)
{
	cb = cb || noop;

	exports.file(shared.vttSubsPath, cb);
}
