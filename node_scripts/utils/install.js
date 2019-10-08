#!/bin/sh
//bin/false || exec "$(command -v nodejs || command -v node)" "$0"

var fs = require('fs');
var path = require('path');
var { execSync } = require('child_process');
var extensionsPath = path.join(__dirname + '/../../..');

/* Add-ons should be installed synchronously */
var extensions = fs.readdirSync(extensionsPath);

extensions.forEach(folder =>
{
	if(folder.startsWith('cast-to-tv') && folder.includes('addon@'))
	{
		var addonFolder = path.join(extensionsPath, folder);
		var addonName = folder.substring(11, folder.lastIndexOf('-'));
		var isPackage = fs.existsSync(addonFolder + '/package.json');

		if(isPackage)
		{
			var installText = `Installing: Cast to TV - ${addonName[0].toUpperCase() + addonName.slice(1)} Add-on`;
			var textLength = installText.length;

			while(textLength)
			{
				process.stdout.write('-');
				textLength--;
			}

			process.stdout.write('\n');
			console.log(installText);
			execSync('npm install', { cwd: addonFolder, stdio: 'inherit' });
			process.stdout.write('\n');
		}
	}
});
