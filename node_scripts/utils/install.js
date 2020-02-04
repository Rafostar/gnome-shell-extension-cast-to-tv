#!/bin/sh
//bin/false || exec "$(command -v nodejs || command -v node)" "$0"

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const extensionsPath = path.join(__dirname + '/../../..');

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
			var addonText = addonName[0].toUpperCase() + addonName.slice(1);
			var installText = `Installing: Cast to TV - ${addonText} Add-on`;
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
