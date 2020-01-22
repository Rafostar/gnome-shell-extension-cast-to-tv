const fs = require('fs');
const shared = require('../shared');
const noop = () => {};

exports.file = function(filePath, cb)
{
	cb = cb || noop;

	fs.access(filePath, fs.constants.F_OK, (err) =>
	{
		if(err) return cb(new Error(`File ${filePath} does not exist`));

		fs.unlink(filePath, (err) =>
		{
			if(err) cb(new Error(`Could not remove file: ${filePath}`));
			else cb(null);
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
