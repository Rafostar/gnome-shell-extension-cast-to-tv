var fs = require('fs');
var shared = require('../shared');

exports.file = function(fileToRemove)
{
	if(fs.existsSync(fileToRemove))
	{
		fs.unlink(fileToRemove, (err) =>
		{

			if(err) throw err;
		});
	}
}

exports.covers = function()
{
	shared.coverExtensions.forEach(ext =>
	{
		exports.file(shared.coverDefault + ext);
	});
}
